import type { Table } from 'dexie';
import { db } from '../../../core/db/db';
import { registerSyncTable } from '../../../core/db/sync';
import { autoTable } from '../../../core/db/syncTables';
import { candidateSchema, cardSchema, logSchema, noteSchema, useItSchema } from '../model/schema';
import type { Candidate, ReviewLog, UseItAnswer, VocabCard, VocabNote } from '../model/types';

// Typed access to the English tables (Dexie versions 3–4 in core/db/db.ts) and their sync.

export const notesTable = db.table('vocabNotes') as Table<VocabNote, string>;
export const cardsTable = db.table('vocabCards') as Table<VocabCard, string>;
export const logsTable = db.table('reviewLogs') as Table<ReviewLog, string>;
export const candidatesTable = db.table('vocabCandidates') as Table<Candidate, string>;
export const useItTable = db.table('useItAnswers') as Table<UseItAnswer, string>;

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

export const candidateSync = autoTable<Candidate>({
  local: 'vocabCandidates',
  remote: 'vocab_candidates',
  schema: candidateSchema,
  dates: ['decidedAt', 'createdAt', 'updatedAt', 'deletedAt'],
});
export const useItSync = autoTable<UseItAnswer>({
  local: 'useItAnswers',
  remote: 'use_it_answers',
  schema: useItSchema,
  dates: ['writtenAt', 'feedbackAt', 'updatedAt', 'deletedAt'],
});

registerSyncTable(noteSync);
registerSyncTable(cardSync);
registerSyncTable(logSync);
registerSyncTable(candidateSync);
registerSyncTable(useItSync);
