import { z } from 'zod';
import type { ReviewLog, VocabCard, VocabNote } from './types';

// zod checks for English rows (used by sync on every row pulled from Supabase) and the seed kit file.

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date');
const source = z.object({
  kind: z.enum(['claudeExport', 'share', 'ocr', 'manual', 'seed', 'errorLog']),
  title: z.string().optional(),
  conversationId: z.string().optional(),
  date: z.string().optional(),
});
const cardType = z.enum(['recognition', 'production', 'cloze', 'listening', 'spelling', 'collocation', 'synonymLadder', 'wordFamily', 'useIt', 'palace']);
const cardState = z.enum(['new', 'learning', 'review', 'relearning']);
const grade = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const noteSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: z.enum(['word', 'collocation', 'phrase', 'paraphrasePair', 'spelling']),
  headword: z.string(),
  lemma: z.string(),
  pos: z.string().optional(),
  ipa: z.string().optional(),
  cefr: z.string().optional(),
  ieltsTopic: z.string().optional(),
  definition: z.string(),
  glossKK: z.string().optional(),
  glossRU: z.string().optional(),
  examples: z.array(z.object({ text: z.string(), target: z.string().optional(), source })),
  family: z.array(z.string()),
  collocations: z.array(z.string()),
  synonymLadder: z.array(z.object({ band: z.number(), word: z.string(), note: z.string().optional() })),
  tip: z.string().optional(),
  mnemonic: z.string().optional(),
  source,
  packId: z.string().optional(),
  status: z.enum(['active', 'known', 'suspended']),
  needsDetails: z.boolean().optional(),
  frozenAt: iso.optional(),
  isLeech: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<VocabNote>;

export const cardSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  type: cardType,
  state: cardState,
  stability: z.number(),
  difficulty: z.number(),
  due: iso,
  lastReview: iso.optional(),
  scheduledDays: z.number(),
  step: z.number().int(),
  ladderIndex: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  lastGrade: grade.optional(),
  goodStreak: z.number().int(),
  isLeech: z.boolean(),
  suspended: z.boolean(),
  introducedAt: iso.optional(),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<VocabCard>;

export const logSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  noteId: z.string(),
  reviewedAt: iso,
  grade,
  stateBefore: cardState,
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  rBefore: z.number(),
  sBefore: z.number(),
  sAfter: z.number(),
  dBefore: z.number(),
  dAfter: z.number(),
  durationMs: z.number().int(),
  scheduler: z.enum(['fsrs5', 'ladder']),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<ReviewLog>;

/** seed/perspectives-word-kit.json */
export const seedKitSchema = z.object({
  source: z.string(),
  perspectivesWordKit: z.array(
    z.object({
      word: z.string(),
      pos: z.string(),
      definition: z.string(),
      ru: z.string(),
      kk: z.string(),
      example: z.string(),
      exampleTarget: z.string(),
      tip: z.string(),
    }),
  ),
  linkingDevices: z.array(z.object({ job: z.string(), basic: z.array(z.string()), highLevel: z.array(z.string()) })),
});
