import type { Table } from 'dexie';
import { db } from '../../../core/db/db';
import { registerSyncTable } from '../../../core/db/sync';
import { autoTable } from '../../../core/db/syncTables';
import { changeSchema, opportunitySchema } from '../model/schema';
import type { Opportunity, RadarChange } from '../model/types';

// Typed access to the Radar tables (Dexie version 5 in core/db/db.ts) and their sync.
// Ids are text (opportunity slugs, change hashes), so the Supabase key is (user_id, id).

export const oppsTable = db.table('radarOpps') as Table<Opportunity, string>;
export const changesTable = db.table('radarChanges') as Table<RadarChange, string>;

export const oppSync = autoTable<Opportunity>({
  local: 'radarOpps',
  remote: 'radar_opportunities',
  schema: opportunitySchema,
  dates: ['updatedAt', 'deletedAt'],
  onConflict: 'user_id,id',
});
export const changeSync = autoTable<RadarChange>({
  local: 'radarChanges',
  remote: 'radar_changes',
  schema: changeSchema,
  dates: ['fetchedAt', 'decidedAt', 'updatedAt', 'deletedAt'],
  columns: { old: 'old_value', new: 'new_value' },
  onConflict: 'user_id,id',
});

registerSyncTable(oppSync);
registerSyncTable(changeSync);
