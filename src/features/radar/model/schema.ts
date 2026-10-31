import { z } from 'zod';
import type { Feed, Opportunity, RadarChange } from './types';

/*
 * zod checks for the feed file (public/data/opportunities.json, written daily by the Claude
 * scheduled task) and for Radar rows pulled from Supabase. A feed that fails is not used at all.
 */

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date');
const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const categorySchema = z.enum([
  'olympiad',
  'mathModeling',
  'research',
  'summerProgram',
  'innovation',
  'entrepreneurship',
  'sustainability',
  'scholarship',
  'applicationSupport',
  'artWriting',
  'csCyber',
  'physics',
  'other',
]);
const deadlineType = z.enum(['registration', 'application', 'submission', 'event', 'decision', 'payment']);
const dateStatus = z.enum(['confirmed', 'estimated', 'stale']);
const confidence = z.enum(['high', 'medium', 'low']);

export const feedDeadlineSchema = z.object({
  type: deadlineType,
  date: z.string().regex(LOCAL_DATE, 'use "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (organiser local time)'),
  tz: z.string().refine(validTz, 'not an IANA time zone'),
  status: dateStatus,
  sourceUrl: z.string().nullable(),
});

export const feedOpportunitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: categorySchema,
  url: z.string(),
  deadlines: z.array(feedDeadlineSchema),
  requirements: z.array(z.string()),
  cost: z.string().nullable(),
  aid: z.string().nullable(),
  eligibility: z.string(),
  lastVerified: z.string().nullable(),
});

export const feedChangeSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  old: z.string().nullable(),
  new: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  confidence,
});

export const feedSchema = z.object({
  generatedAt: iso,
  opportunities: z.array(feedOpportunitySchema),
  changes: z.array(feedChangeSchema),
}) satisfies z.ZodType<Feed>;

// ---------- Local rows ----------

const radarDeadline = z.object({
  id: z.string(),
  type: deadlineType,
  date: z.string().regex(LOCAL_DATE),
  tz: z.string(),
  status: dateStatus,
  confidence,
  sourceUrl: z.string().optional(),
  lastVerified: z.string().optional(),
  manual: z.boolean().optional(),
});

export const opportunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: categorySchema,
  url: z.string(),
  deadlines: z.array(radarDeadline),
  requirements: z.array(
    z.object({ id: z.string(), title: z.string(), kind: z.enum(['essay', 'rec', 'transcript', 'test', 'video', 'website', 'problemSet', 'fee', 'team', 'form', 'other']), done: z.boolean() }),
  ),
  cost: z.string().optional(),
  aid: z.string().optional(),
  eligibility: z.string(),
  lastVerified: z.string().optional(),
  status: z.enum(['watching', 'preparing', 'submitted', 'result', 'hidden']),
  result: z.enum(['accepted', 'award', 'finalist', 'waitlisted', 'notSelected', 'withdrawn']).optional(),
  confirmationNumber: z.string().optional(),
  plan: z
    .object({
      deadlineId: z.string(),
      createdAt: z.string(),
      compressed: z.object({ days: z.number(), insteadOf: z.number() }).optional(),
      tasks: z.array(z.object({ id: z.string(), title: z.string(), day: z.string(), offset: z.number() })),
    })
    .optional(),
  notes: z.string(),
  history: z.array(z.object({ at: z.string(), field: z.string(), old: z.string().nullable(), new: z.string().nullable(), sourceUrl: z.string().optional() })),
  cancelled: z.boolean().optional(),
  createdBy: z.enum(['seed', 'radar', 'user']),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<Opportunity>;

export const changeSchema = z.object({
  id: z.string(),
  oppId: z.string(),
  field: z.string(),
  old: z.string().optional(),
  new: z.string().optional(),
  sourceUrl: z.string().optional(),
  confidence,
  fetchedAt: iso,
  state: z.enum(['pending', 'accepted', 'rejected', 'expired']),
  decidedAt: iso.optional(),
  opportunity: feedOpportunitySchema.optional(),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<RadarChange>;
