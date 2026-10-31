import { useEffect, useState } from 'react';
import { supabase } from '../../../core/db/supabase';
import type { TelemetryRow } from '../model/types';

/*
 * Pi telemetry (WEB EDITION): the Pi inserts rows into Supabase `telemetry`; this page reads the
 * owner's rows for a time window and listens for new ones with Realtime while it is open.
 * Rows flagged clock_skew are shown with a warning and left out of rate calculations.
 */

const COLS = 'id, device_id, run_id, seq, ts, phase, payload, flags, received_at';

export async function fetchTelemetry(from: Date, to?: Date, limit = 5000): Promise<TelemetryRow[]> {
  let q = supabase.from('telemetry').select(COLS).gte('ts', from.toISOString()).order('ts', { ascending: true }).limit(limit);
  if (to) q = q.lte('ts', to.toISOString());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TelemetryRow[];
}

export async function latestTelemetry(): Promise<TelemetryRow | undefined> {
  const { data } = await supabase.from('telemetry').select(COLS).order('ts', { ascending: false }).limit(1);
  return (data?.[0] as TelemetryRow | undefined) ?? undefined;
}

export interface TelemetryState {
  rows: TelemetryRow[];
  loading: boolean;
  error?: string;
}

/** Rows from `from` (to `to`, or live when open-ended), kept up to date with Realtime. */
export function useTelemetry(from: Date | undefined, to?: Date): TelemetryState {
  const [state, setState] = useState<TelemetryState>({ rows: [], loading: !!from });
  const fromKey = from?.toISOString();
  const toKey = to?.toISOString();
  useEffect(() => {
    if (!from) {
      setState({ rows: [], loading: false });
      return;
    }
    let alive = true;
    const load = () =>
      fetchTelemetry(from, to)
        .then((rows) => alive && setState({ rows, loading: false }))
        .catch((e: Error) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    void load();
    if (to) return () => void (alive = false);
    // Live: new rows arrive through Realtime; a 60 s poll covers a dropped connection.
    const channel = supabase
      .channel(`telemetry-${fromKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry' }, (msg) => {
        const row = msg.new as TelemetryRow;
        if (!alive || row.ts < fromKey!) return;
        setState((s) => (s.rows.some((r) => r.id === row.id) ? s : { ...s, rows: [...s.rows, row].sort((a, b) => a.ts.localeCompare(b.ts)) }));
      })
      .subscribe();
    const poll = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [fromKey, toKey]);
  return state;
}

/** Seconds between the last two readings (the Pi's current send interval), default 60. */
export function sendInterval(rows: TelemetryRow[]): number {
  if (rows.length < 2) return 60;
  const a = Date.parse(rows[rows.length - 2].ts);
  const b = Date.parse(rows[rows.length - 1].ts);
  return Math.max(5, Math.round((b - a) / 1000));
}

/** "Stale" when the last reading is older than 3× the send interval. */
export const isStale = (rows: TelemetryRow[], now: Date) => !rows.length || now.getTime() - Date.parse(rows[rows.length - 1].ts) > 3 * sendInterval(rows) * 1000;
