import type { Table } from 'dexie';
import { db } from '../../../core/db/db';
import { registerSyncTable } from '../../../core/db/sync';
import { autoTable } from '../../../core/db/syncTables';
import { decisionSchema, optionSchema, projectSchema } from '../model/schema';
import type { DecisionRecord, KitOption, KitProject } from '../model/types';

// Typed access to the Tagylym tables (Dexie version 7 in core/db/db.ts) and their sync.

export const optionsTable = db.table('tgOptions') as Table<KitOption, string>;
export const decisionsTable = db.table('tgDecisions') as Table<DecisionRecord, string>;
export const projectsTable = db.table('tgProjects') as Table<KitProject, string>;

const keyed = { onConflict: 'user_id,id' };
export const optionSync = autoTable<KitOption>({ local: 'tgOptions', remote: 'tg_options', schema: optionSchema, dates: ['createdAt', 'updatedAt', 'deletedAt'], ...keyed });
export const decisionSync = autoTable<DecisionRecord>({ local: 'tgDecisions', remote: 'tg_decisions', schema: decisionSchema, dates: ['decidedAt', 'updatedAt', 'deletedAt'], ...keyed });
export const projectSync = autoTable<KitProject>({ local: 'tgProjects', remote: 'tg_projects', schema: projectSchema, dates: ['updatedAt', 'deletedAt'], ...keyed });

for (const t of [optionSync, decisionSync, projectSync]) registerSyncTable(t as never);
