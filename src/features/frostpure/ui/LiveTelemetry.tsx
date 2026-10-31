import { useMemo } from 'react';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Chip } from '../../../core/design/components';
import { useDevice } from '../data/store';
import { isStale, sendInterval, useTelemetry } from '../data/telemetry';
import { iceDepthCm, iceFraction } from '../engine/results';
import type { Run, TelemetryRow } from '../model/types';

/*
 * Live Telemetry inside the Run-sheet (SPEC Module 2 › 3): a tank gauge (ice on top, brine below)
 * with ice %, line charts of T1–T5 and air, EC1/EC2 and level, valve chips, and a "stale" banner
 * when the last reading is older than 3× the send interval. Readings flagged clock_skew are
 * marked and left out of the charts.
 */

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });
const COLORS = ['var(--ice)', 'var(--sky)', 'var(--periwinkle)', 'var(--violet)', '#9a6bff', 'var(--warm)'];
const axis = { stroke: 'var(--text-3)', tick: { fill: 'var(--text-3)', fontSize: 11 }, tickLine: false, axisLine: false };

/** Every 2nd, 3rd … reading so a chart has at most ~300 points. */
const thin = <T,>(rows: T[], max = 300) => (rows.length <= max ? rows : rows.filter((_, i) => i % Math.ceil(rows.length / max) === 0));

export function useRunTelemetry(run: Run) {
  const from = run.startedAt ? new Date(Date.parse(run.startedAt) - 10 * 60_000) : undefined;
  const to = run.status === 'running' ? undefined : run.endedAt ? new Date(run.endedAt) : undefined;
  const t = useTelemetry(from, to);
  // Rows for this run: its run_id, or (no run_id) this run's device within the run's time.
  const rows = useMemo(() => t.rows.filter((r) => r.run_id === run.id || (!r.run_id && (!run.deviceId || r.device_id === run.deviceId))), [t.rows, run.id, run.deviceId]);
  return { ...t, rows };
}

export function LiveTelemetry({ run, rows, loading, error, now }: { run: Run; rows: TelemetryRow[]; loading: boolean; error?: string; now: Date }) {
  const device = useDevice();
  const clean = rows.filter((r) => !r.flags.includes('clock_skew'));
  const skewed = rows.length - clean.length;
  const last = rows[rows.length - 1];
  const stale = run.status === 'running' && isStale(rows, now);

  const chart = useMemo(
    () =>
      thin(clean).map((r) => {
        const p = r.payload;
        return {
          t: Date.parse(r.ts),
          ...Object.fromEntries(Object.entries(p.temps_c ?? {}).map(([k, v]) => [k, v ?? undefined])),
          EC1: p.ec_ms_cm?.EC1 ?? undefined,
          EC2: p.ec_ms_cm?.EC2 ?? undefined,
          level: p.level_cm ?? undefined,
        };
      }),
    [clean],
  );

  if (!run.startedAt) return <p className="m-0 text-sm">Live readings appear here once the run starts.</p>;
  if (loading && !rows.length) return <p className="m-0 text-sm">Loading readings…</p>;
  if (error) return <p className="notice notice--warm m-0">Readings could not be loaded ({error}). Sign in, and check that the telemetry SQL was run.</p>;
  if (!rows.length) return <p className="m-0 text-sm">No readings from the Pi for this run yet. Manual samples work without it.</p>;

  const temps = last.payload.temps_c ?? {};
  const depth = last.payload.ice_depth_cm ?? iceDepthCm(temps, device.probes, device.iceThresholdC);
  const ice = depth !== undefined && device.waterDepthCm ? iceFraction(depth, device.waterDepthCm) : undefined;
  const tempKeys = Object.keys(clean[clean.length - 1]?.payload.temps_c ?? {});
  const tick = (v: number) => TIME.format(new Date(v));

  return (
    <div className="grid gap-3">
      {stale && (
        <p className="notice notice--warm m-0" role="alert">
          Pi silent since {TIME.format(new Date(last.ts))} (sends every ~{sendInterval(rows)} s). Check power and Wi-Fi.
        </p>
      )}
      {skewed > 0 && <p className="m-0 text-sm">{skewed} reading(s) had a wrong clock on the Pi and are left out.</p>}

      <div className="fp-live">
        <div className="fp-tank" role="img" aria-label={ice !== undefined ? `Tank: ${Math.round(ice * 100)}% ice` : 'Tank: ice depth unknown'}>
          <div className="fp-tank-ice" style={{ height: `${Math.round((ice ?? 0) * 100)}%` }} />
          <div className="fp-tank-brine" />
          <span className="fp-tank-label">{ice !== undefined ? `${Math.round(ice * 100)}% ice` : depth !== undefined ? `${depth} cm ice` : '—'}</span>
        </div>
        <div className="grid gap-1 text-sm">
          <span>
            Last reading {TIME.format(new Date(last.ts))} · phase {last.phase ?? '—'} · #{last.seq}
          </span>
          {depth !== undefined && <span>Ice depth {depth} cm</span>}
          {last.payload.ec_ms_cm?.EC1 != null && <span>EC1 {last.payload.ec_ms_cm.EC1} mS/cm</span>}
          {temps.air != null && <span>Air {temps.air} °C</span>}
          {last.payload.power?.battery_v != null && <span>Battery {last.payload.power.battery_v} V</span>}
          <span className="flex flex-wrap gap-1">
            {Object.entries(last.payload.valves ?? {}).map(([k, v]) => (
              <Chip key={k} tone={v === 'closed' ? 'plain' : 'ice'}>
                {k} {v}
              </Chip>
            ))}
          </span>
        </div>
      </div>

      {[
        { title: 'Temperatures, °C', keys: tempKeys },
        { title: 'Conductivity, mS/cm', keys: ['EC1', 'EC2'] },
        { title: 'Level, cm', keys: ['level'] },
      ].map((c) => (
        <figure key={c.title} className="m-0">
          <figcaption className="text-sm">{c.title}</figcaption>
          <div className="fp-chart" aria-hidden="true">
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tick} {...axis} minTickGap={32} />
                <YAxis {...axis} />
                <Tooltip labelFormatter={(v) => tick(Number(v))} contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--card-border)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {c.keys.map((k, i) => (
                  <Line key={k} dataKey={k} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      ))}
    </div>
  );
}

/** Sensor-triggered test moments whose condition the latest reading meets. */
export function triggeredMoments(run: Run, rows: TelemetryRow[], probes: { key: string; depthCm?: number }[], waterDepthCm?: number, threshold = -0.3) {
  const last = rows.filter((r) => !r.flags.includes('clock_skew')).at(-1);
  if (!last) return [];
  const depth = last.payload.ice_depth_cm ?? iceDepthCm(last.payload.temps_c ?? {}, probes, threshold);
  const ice = depth !== undefined && waterDepthCm ? iceFraction(depth, waterDepthCm) : undefined;
  const ec1 = last.payload.ec_ms_cm?.EC1 ?? undefined;
  return run.moments.filter((m) => m.kind === 'when' && !m.doneAt && m.when && ((m.when.metric === 'icePct' && ice !== undefined && ice * 100 >= m.when.value) || (m.when.metric === 'ec1' && ec1 !== undefined && ec1 >= m.when.value)));
}
