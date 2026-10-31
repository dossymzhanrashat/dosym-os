import { z } from 'zod';
import type { BomItem, BuildStep, Competition, MediaAsset, Run } from './types';

// zod checks for FrostPure rows pulled from Supabase; a row that fails is skipped, never saved.

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date');
const check = z.object({ id: z.string(), text: z.string(), done: z.boolean() });

export const assetSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['video', 'canva', 'brandBoard', 'document', 'photoSet', 'data', 'link']),
  tags: z.array(z.string()),
  notes: z.string(),
  pinned: z.boolean(),
  versions: z.array(
    z.object({
      id: z.string(),
      number: z.number().int(),
      note: z.string(),
      url: z.string().optional(),
      byteSize: z.number().optional(),
      durationSec: z.number().optional(),
      createdAt: iso,
    }),
  ),
  currentVersionId: z.string().optional(),
  photos: z.array(z.object({ id: z.string(), path: z.string(), thumbPath: z.string(), caption: z.string(), byteSize: z.number(), createdAt: iso })),
  chapters: z.array(z.object({ title: z.string(), start: z.number() })),
  linkedBomIds: z.array(z.string()),
  linkedStepIds: z.array(z.string()),
  linkedRunIds: z.array(z.string()),
  createdAt: iso,
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<MediaAsset>;

export const bomSchema = z.object({
  id: z.string(),
  order: z.number(),
  name: z.string(),
  model: z.string().optional(),
  subsystem: z.enum(['have', 'waterPath', 'sensors', 'controlPower', 'safetyTools']),
  qty: z.number(),
  qtyLabel: z.string().optional(),
  status: z.enum(['need', 'ordered', 'have']),
  unitPriceKZT: z.number().optional(),
  supplierUrl: z.string().optional(),
  datasheetUrl: z.string().optional(),
  purpose: z.string(),
  notes: z.string(),
  orderedAt: iso.optional(),
  expectedAt: z.string().optional(),
  partTag: z.string().optional(),
  stage: z.enum(['lab', 'outdoor']).optional(),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<BomItem>;

export const stepSchema = z.object({
  id: z.string(),
  order: z.number(),
  title: z.string(),
  body: z.string(),
  estMinutes: z.number(),
  requiredBomIds: z.array(z.string()),
  checklist: z.array(check),
  photoAssetIds: z.array(z.string()),
  doneAt: iso.optional(),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<BuildStep>;

const phaseId = z.enum(['prepare', 'fill', 'freeze', 'drain', 'sweat', 'harvest', 'measure']);

export const runSchema = z.object({
  id: z.string(),
  name: z.string(),
  rig: z.enum(['lab', 'outdoor', 'custom']),
  status: z.enum(['planned', 'running', 'done', 'aborted']),
  feedSalinityGL: z.number(),
  feedVolumeL: z.number(),
  plannedAmbientC: z.number(),
  plannedFreezeHours: z.number(),
  targetFrozenPct: z.number(),
  drainRule: z.object({ kind: z.enum(['targetIce', 'ec1Limit', 'fixedTime', 'manual']), value: z.number().optional() }),
  sweatEnabled: z.boolean(),
  sweatMinutes: z.number().optional(),
  ec2SwitchMS: z.number().optional(),
  variable: z.enum(['salinity', 'temperature', 'frozenPct', 'drainTiming', 'duration']),
  hypothesis: z.string(),
  tdsK: z.number(),
  startedAt: iso.optional(),
  endedAt: iso.optional(),
  phases: z.array(
    z.object({ id: phaseId, checklist: z.array(check), timerMin: z.number().optional(), timerEndsAt: iso.optional(), startedAt: iso.optional(), doneAt: iso.optional() }),
  ),
  samples: z.array(
    z.object({
      id: z.string(),
      at: iso,
      point: z.enum(['feed', 'brine', 'sweat', 'clean', 'iceCore']),
      ecMS: z.number().optional(),
      tdsMgL: z.number().optional(),
      tempC: z.number().optional(),
      volumeL: z.number().optional(),
      source: z.enum(['handheld', 'pi']),
      note: z.string(),
    }),
  ),
  moments: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: z.enum(['at', 'afterStart', 'when']),
      at: iso.optional(),
      afterMin: z.number().optional(),
      when: z.object({ metric: z.enum(['icePct', 'ec1']), value: z.number() }).optional(),
      instruction: z.string(),
      doneAt: iso.optional(),
    }),
  ),
  energyWh: z.number().optional(),
  freezerWh: z.number().optional(),
  iceThicknessCm: z.number().optional(),
  freezeHoursActual: z.number().optional(),
  deviceId: z.string().optional(),
  notes: z.string(),
  createdAt: iso,
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<Run>;

const requirement = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['brief', 'link', 'task', 'fee']),
  wordLimit: z.number().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  estHours: z.number(),
  dependsOn: z.array(z.string()),
  weight: z.number(),
  doneAt: iso.optional(),
});

export const compSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  status: z.enum(['watching', 'preparing', 'submitted', 'done']),
  source: z.enum(['seed', 'radar', 'manual']),
  phases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      start: z.string().optional(),
      deadline: z.object({ date: z.string(), tz: z.string() }).optional(),
      verified: z.boolean(),
      sourceUrl: z.string().optional(),
      requirements: z.array(requirement),
      doneAt: iso.optional(),
    }),
  ),
  milestones: z.array(z.object({ id: z.string(), title: z.string(), day: z.string(), doneAt: iso.optional() })),
  notes: z.string(),
  updatedAt: iso,
  deletedAt: iso.optional(),
}) satisfies z.ZodType<Competition>;
