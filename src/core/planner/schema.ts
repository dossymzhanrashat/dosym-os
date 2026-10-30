import { z } from 'zod';
import type { PlannerItem } from './types';

// zod check for PlannerItem, shared by sync (rows pulled from Supabase) and JSON import/export.

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date');
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const plannerItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  notes: z.string().optional(),
  start: iso.optional(),
  end: iso.optional(),
  dueDate: iso.optional(),
  kind: z.enum(['task', 'event', 'deadline', 'review', 'practice', 'testMoment']),
  source: z.enum(['user', 'english', 'frostpure', 'tagylym', 'radar']),
  sourceRef: z.string().optional(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  importance: z.enum(['normal', 'important', 'critical']),
  reminders: z.array(z.object({ offsetMinutes: z.number(), alarm: z.boolean().optional() })),
  recurrence: z
    .object({
      freq: z.enum(['daily', 'weekly', 'monthly']),
      interval: z.number().int().min(1),
      byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
      until: iso.optional(),
    })
    .optional(),
  done: z.boolean(),
  completedAt: iso.optional(),
  updatedAt: iso,
  deletedAt: iso.optional(),
  completions: z.array(dayKey).optional(),
  exceptions: z.array(dayKey).optional(),
  snoozedUntil: iso.optional(),
  checklist: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })).optional(),
  links: z.array(z.object({ title: z.string(), url: z.string() })).optional(),
}) satisfies z.ZodType<PlannerItem>;
