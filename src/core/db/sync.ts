import { useSyncExternalStore } from 'react';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { db, getMeta, setMeta } from './db';
import { supabase } from './supabase';
import { plannerTable, remoteWins, settingsTable, type SyncTableDef } from './syncTables';

/*
 * Dexie ↔ Supabase sync (WEB EDITION: updated_at last-write-wins, soft deletes).
 *
 * Every local write goes through saveLocal(): the row is stored and an outbox entry is added.
 * A sync run pushes the outbox (upsert), then pulls rows changed on the server since this
 * device's cursor (server_updated_at). It runs on open, when the page becomes visible, when
 * the network comes back, shortly after a local change, when Realtime reports a change from
 * another device, and every minute while the page is open.
 */

export type SyncState = 'offline' | 'signed-out' | 'syncing' | 'idle' | 'error';
export interface SyncStatus {
  state: SyncState;
  lastSyncAt?: string;
  error?: string;
  email?: string;
}

const TABLES: SyncTableDef[] = [plannerTable, settingsTable] as SyncTableDef[];
const PAGE = 1000;
const OVERLAP_MS = 60_000; // re-read the last minute: rows committed slightly out of order are not missed

let status: SyncStatus = { state: 'signed-out' };
const listeners = new Set<() => void>();
function setStatus(next: Partial<SyncStatus>) {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

const afterSync: (() => Promise<void>)[] = [];
/** Runs after every successful sync (the reminder engine hooks in here). */
export function onSynced(fn: () => Promise<void>): void {
  afterSync.push(fn);
}

/** Store a row locally and queue it for upload. */
export async function saveLocal<T extends { updatedAt: string }>(def: SyncTableDef<T>, row: T): Promise<void> {
  const table = db.table(def.local);
  const id = def.key(row);
  await db.transaction('rw', table, db.outbox, async () => {
    await table.put(row);
    await db.outbox.put({ key: `${def.local}:${id}`, table: def.local, id, updatedAt: row.updatedAt });
  });
  requestSync(1500);
}

async function push(): Promise<void> {
  const pending = await db.outbox.toArray();
  for (const def of TABLES) {
    const entries = pending.filter((p) => p.table === def.local);
    if (!entries.length) continue;
    const rows = (await db.table(def.local).bulkGet(entries.map((e) => e.id))).filter(Boolean);
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from(def.remote)
        .upsert(rows.slice(i, i + 200).map((r) => def.toRemote(r)), { onConflict: def.onConflict });
      if (error) throw new Error(error.message);
    }
    // Only clear entries not changed again while uploading.
    await db.transaction('rw', db.outbox, async () => {
      for (const e of entries) {
        const now = await db.outbox.get(e.key);
        if (now?.updatedAt === e.updatedAt) await db.outbox.delete(e.key);
      }
    });
  }
}

async function pull(): Promise<void> {
  for (const def of TABLES) {
    const cursorKey = `pull:${def.remote}`;
    let cursor = (await getMeta<string>(cursorKey)) ?? '1970-01-01T00:00:00Z';
    let since = new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString();
    for (;;) {
      const { data, error } = await supabase
        .from(def.remote)
        .select('*')
        .gt('server_updated_at', since)
        .order('server_updated_at')
        .limit(PAGE);
      if (error) throw new Error(error.message);
      if (!data.length) break;
      const table = db.table(def.local);
      await db.transaction('rw', table, db.outbox, async () => {
        for (const r of data) {
          const row = def.fromRemote(r);
          if (!row) continue;
          const key = def.key(row);
          const local = (await table.get(key)) as { updatedAt: string } | undefined;
          const queued = await db.outbox.get(`${def.local}:${key}`);
          if (remoteWins(row.updatedAt, local?.updatedAt, queued?.updatedAt)) await table.put(row);
        }
      });
      const last = data[data.length - 1].server_updated_at as string;
      if (last > cursor) cursor = last;
      if (data.length < PAGE) break;
      since = last;
    }
    await setMeta(cursorKey, cursor);
  }
}

let running: Promise<void> | null = null;
let again = false;

async function runSync(): Promise<void> {
  if (!navigator.onLine) return setStatus({ state: 'offline' });
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return setStatus({ state: 'signed-out', email: undefined });

  // A different account on this device: read everything again from the start.
  if ((await getMeta<string>('syncUser')) !== session.user.id) {
    await db.meta.where('key').startsWith('pull:').delete();
    await setMeta('syncUser', session.user.id);
  }

  setStatus({ state: 'syncing', email: session.user.email, error: undefined });
  try {
    await push();
    await pull();
    for (const fn of afterSync) await fn();
    setStatus({ state: 'idle', lastSyncAt: new Date().toISOString() });
  } catch (e) {
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Sync now (or as soon as the current run finishes). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = runSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function requestSync(delayMs = 0): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

let channel: RealtimeChannel | null = null;
function listen(session: Session | null) {
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  if (!session) return;
  channel = supabase.channel('dosym-sync');
  for (const def of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: def.remote }, () => requestSync(500));
  }
  channel.subscribe();
}

let started = false;
/** Starts background sync. Call once when the app boots. */
export function startSync(): void {
  if (started) return;
  started = true;
  supabase.auth.onAuthStateChange((event, session) => {
    // Supabase advises not to await other Supabase calls inside this callback.
    setTimeout(() => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') listen(session);
      if (session) {
        setStatus({ email: session.user.email });
        if (event !== 'TOKEN_REFRESHED') requestSync();
      } else setStatus({ state: 'signed-out', email: undefined });
    }, 0);
  });
  window.addEventListener('online', () => requestSync());
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') requestSync();
  }, 60_000);
}

export async function pendingChanges(): Promise<number> {
  return db.outbox.count();
}
