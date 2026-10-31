import type { Table } from 'dexie';
import { db } from '../../../core/db/db';
import { registerSyncTable } from '../../../core/db/sync';
import { autoTable } from '../../../core/db/syncTables';
import { assetSchema, bomSchema, compSchema, runSchema, stepSchema } from '../model/schema';
import type { BomItem, BuildStep, Competition, MediaAsset, Run } from '../model/types';

// Typed access to the FrostPure tables (Dexie version 6 in core/db/db.ts) and their sync.
// Ids are text: uuids for things the user makes, stable slugs for seeded rows.

export const assetsTable = db.table('fpAssets') as Table<MediaAsset, string>;
export const bomTable = db.table('fpBom') as Table<BomItem, string>;
export const stepsTable = db.table('fpSteps') as Table<BuildStep, string>;
export const runsTable = db.table('fpRuns') as Table<Run, string>;
export const compsTable = db.table('fpComps') as Table<Competition, string>;

const keyed = { onConflict: 'user_id,id' };
export const assetSync = autoTable<MediaAsset>({ local: 'fpAssets', remote: 'fp_assets', schema: assetSchema, dates: ['createdAt', 'updatedAt', 'deletedAt'], ...keyed });
export const bomSync = autoTable<BomItem>({ local: 'fpBom', remote: 'fp_bom_items', schema: bomSchema, dates: ['orderedAt', 'updatedAt', 'deletedAt'], columns: { unitPriceKZT: 'unit_price_kzt' }, ...keyed });
export const stepSync = autoTable<BuildStep>({ local: 'fpSteps', remote: 'fp_build_steps', schema: stepSchema, dates: ['doneAt', 'updatedAt', 'deletedAt'], ...keyed });
export const runSync = autoTable<Run>({ local: 'fpRuns', remote: 'fp_runs', schema: runSchema, dates: ['startedAt', 'endedAt', 'createdAt', 'updatedAt', 'deletedAt'], columns: { feedSalinityGL: 'feed_salinity_gl', feedVolumeL: 'feed_volume_l', ec2SwitchMS: 'ec2_switch_ms', energyWh: 'energy_wh', freezerWh: 'freezer_wh' }, ...keyed });
export const compSync = autoTable<Competition>({ local: 'fpComps', remote: 'fp_competitions', schema: compSchema, dates: ['updatedAt', 'deletedAt'], ...keyed });

for (const t of [assetSync, bomSync, stepSync, runSync, compSync]) registerSyncTable(t as never);
