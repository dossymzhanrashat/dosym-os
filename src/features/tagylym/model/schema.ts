import { z } from 'zod';
import type { DecisionRecord, KitOption, KitProject } from './types';

// zod checks for Tagylym rows pulled from Supabase; a row that fails is skipped, never saved.

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date');
const criterion = z.enum(['cost', 'durability', 'learningDepth', 'scalability', 'rural', 'teacherEffort', 'uniqueness']);
const weights = z.record(criterion, z.number());
const score = z.object({ value: z.number(), aiEstimate: z.boolean().optional() });

export const optionSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameKk: z.string().optional(),
  nameRu: z.string().optional(),
  concept: z.string(),
  gradeMin: z.number(),
  gradeMax: z.number(),
  controller: z.string().optional(),
  outcomes: z.array(z.object({ grade: z.number(), text: z.string() })),
  bom: z.array(
    z.object({
      name: z.string(),
      qty: z.number(),
      qtyLabel: z.string().optional(),
      unitCost: z.number(),
      currency: z.enum(['USD', 'KZT']),
      isEstimate: z.boolean(),
      sourceUrl: z.string().optional(),
      checkedAt: z.string().optional(),
    }),
  ),
  manufacturing: z.object({ method: z.string(), moq: z.number(), leadTimeDays: z.number().optional(), fixedCostsKZT: z.number(), supplierNotes: z.string() }),
  packaging: z.string(),
  curriculum: z.array(z.object({ index: z.number(), title: z.string() })),
  lessonCount: z.number(),
  softwareNeeds: z.string(),
  safetyNotes: z.array(z.object({ regulation: z.string(), text: z.string(), toConfirm: z.boolean() })),
  risks: z.array(z.string()),
  scores: z.record(criterion, score),
  prices: z.object({ grant: z.number().optional(), b2b: z.number().optional(), b2c: z.number().optional(), refill: z.number().optional() }),
  status: z.enum(['exploring', 'active', 'parked']),
  source: z.enum(['seed', 'manual', 'ai', 'merge']),
  isTeacherBox: z.boolean(),
  sellAsTeacherBox: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<KitOption>;

export const decisionSchema = z.object({
  id: z.string(),
  winnerId: z.string(),
  runnerUpId: z.string().optional(),
  weights,
  scores: z.record(z.string(), z.number()),
  robustness: z.number(),
  reason: z.string(),
  decidedAt: iso,
  archived: z.boolean(),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<DecisionRecord>;

export const projectSchema = z.object({
  id: z.string(),
  optionId: z.string(),
  decisionId: z.string(),
  mode: z.enum(['forward', 'backward']),
  anchorDate: z.string(),
  stages: z.array(
    z.object({
      kind: z.enum(['research', 'concept', 'proto1', 'userTest', 'proto2', 'dfm', 'pilot', 'certification', 'production', 'launch', 'sales']),
      days: z.number(),
      start: z.string(),
      end: z.string(),
      checklist: z.array(z.object({ id: z.string(), text: z.string(), required: z.boolean(), due: z.string(), done: z.boolean() })),
      deliverables: z.array(z.object({ title: z.string(), required: z.boolean(), link: z.string().optional() })),
      state: z.enum(['todo', 'active', 'done']),
      overrideNote: z.string().optional(),
    }),
  ),
  archived: z.boolean(),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<KitProject>;
