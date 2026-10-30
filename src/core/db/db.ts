import Dexie, { type EntityTable } from 'dexie';
import type { PlannerItem } from '../planner/types';

/** Small key/value rows for app state (first open, sync cursors, device settings). Not synced. */
export interface MetaRow {
  key: string;
  value: unknown;
}

/** Synced key/value rows (fixed weekly blocks, weekly focus goals, …). */
export interface SettingRow {
  id: string;
  value: unknown;
  updatedAt: string;
  deletedAt?: string;
}

/** A local change waiting to be pushed to Supabase. */
export interface OutboxRow {
  key: string; // "<table>:<id>"
  table: string;
  id: string;
  updatedAt: string;
}

/**
 * Local-first store in IndexedDB. Each device keeps a full copy; core/db/sync.ts pushes local
 * changes and pulls remote ones. Module tables are added as new versions in later phases.
 */
export const db = new Dexie('dosym-os') as Dexie & {
  plannerItems: EntityTable<PlannerItem, 'id'>;
  settings: EntityTable<SettingRow, 'id'>;
  outbox: EntityTable<OutboxRow, 'key'>;
  meta: EntityTable<MetaRow, 'key'>;
};

db.version(1).stores({
  plannerItems: 'id, start, dueDate, kind, source, done, updatedAt',
  meta: 'key',
});

db.version(2).stores({
  settings: 'id',
  outbox: 'key, table',
});

// Module 1 (English): typed accessors live in features/english/data/db.ts.
db.version(3).stores({
  vocabNotes: 'id, key, packId',
  vocabCards: 'id, noteId, due',
  reviewLogs: 'id, cardId, noteId, reviewedAt',
});

/** Records the first time this device opened the app and returns it. */
export async function firstOpenedAt(): Promise<string> {
  const row = await db.meta.get('firstOpenedAt');
  if (typeof row?.value === 'string') return row.value;
  const now = new Date().toISOString();
  await db.meta.put({ key: 'firstOpenedAt', value: now });
  return now;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
