import Dexie, { type EntityTable } from 'dexie';
import type { PlannerItem } from '../planner/types';

/** Small key/value rows for app state (first open, last sync, settings). */
export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Local-first store in IndexedDB. Each device keeps a full copy; Supabase sync is layered
 * on top in Phase 1. Module tables are added as new versions in later phases.
 */
export const db = new Dexie('dosym-os') as Dexie & {
  plannerItems: EntityTable<PlannerItem, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

db.version(1).stores({
  plannerItems: 'id, start, dueDate, kind, source, done, updatedAt',
  meta: 'key',
});

/** Records the first time this device opened the app and returns it. */
export async function firstOpenedAt(): Promise<string> {
  const row = await db.meta.get('firstOpenedAt');
  if (typeof row?.value === 'string') return row.value;
  const now = new Date().toISOString();
  await db.meta.put({ key: 'firstOpenedAt', value: now });
  return now;
}
