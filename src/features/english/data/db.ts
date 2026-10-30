import type { Table } from 'dexie';
import { db } from '../../../core/db/db';
import { registerSyncTable } from '../../../core/db/sync';
import { autoTable } from '../../../core/db/syncTables';
import { cardSchema, logSchema, noteSchema } from '../model/schema';
import type { ReviewLog, VocabCard, VocabNote } from '../model/types';

// Typed access to the English tables (declared as Dexie version 3 in core/db/db.ts) and their sync.

export const notesTable = db.table('vocabNotes') as Table<VocabNote, string>;
export const cardsTable = db.table('vocabCards') as Table<VocabCard, string>;
export const logsTable = db.table('reviewLogs') as Table<ReviewLog, string>;

export const noteSync = autoTable<VocabNote>({
  local: 'vocabNotes',
  remote: 'vocab_notes',
  schema: noteSchema,
  dates: ['frozenAt', 'createdAt', 'updatedAt', 'deletedAt'],
  columns: { glossKK: 'gloss_kk', glossRU: 'gloss_ru' },
});
export const cardSync = autoTable<VocabCard>({
  local: 'vocabCards',
  remote: 'vocab_cards',
  schema: cardSchema,
  dates: ['due', 'lastReview', 'introducedAt', 'updatedAt', 'deletedAt'],
});
export const logSync = autoTable<ReviewLog>({
  local: 'reviewLogs',
  remote: 'review_logs',
  schema: logSchema,
  dates: ['reviewedAt', 'updatedAt', 'deletedAt'],
});

registerSyncTable(noteSync);
registerSyncTable(cardSync);
registerSyncTable(logSync);
