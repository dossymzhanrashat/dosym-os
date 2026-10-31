import { addDayKey, dayDiff } from '../../radar/engine/time';
import type { ChecklistItem, PipelineStage, StageKind } from '../model/types';

/*
 * The 11-stage pipeline (SPEC Module 3 › Pipeline board).
 *   forward    start date + cumulative stage days
 *   backward   from a target launch date (end of stage 10) back; if that starts in the past:
 *              "Needs N more days", with an offer to compress every stage proportionally
 *              (never below 50 % of its default); if even that is too late, the earliest
 *              feasible launch date instead
 *   checklist  items spread evenly across their stage; the stage end is a milestone
 *   gate       a stage is done only when its required items are ticked and required
 *              deliverables have a link — or with an override note
 * Certification: 45 days [TO CONFIRM] (kept by the user, 1 Nov 2026). Sales is ongoing; it is
 * scheduled as a first 30-day review period.
 */

interface Template {
  kind: StageKind;
  title: string;
  days: number;
  deliverables: string[];
  checklist: string[];
  toConfirm?: boolean;
}

export const STAGES: Template[] = [
  { kind: 'research', title: 'Research', days: 14, deliverables: ['Teacher interview notes (5+)', 'Competitor table'], checklist: ['Interview 3 rural teachers via Keleshek Schools', 'List devices in classrooms', 'Price check 3 competitors'] },
  { kind: 'concept', title: 'Concept', days: 10, deliverables: ['Concept sheet', '3 sketches', 'Lesson outline'], checklist: ['Define age band', 'Write 3 learning outcomes per grade', 'Pick controller'] },
  { kind: 'proto1', title: 'Prototype v1', days: 21, deliverables: ['Working robot', 'Photos', 'BOM v1'], checklist: ['Order parts', 'Build 3 units', 'First firmware', 'Record cost'] },
  { kind: 'userTest', title: 'User test', days: 14, deliverables: ['Test report', 'Video'], checklist: ['Test with 10+ kids in 2 grades', 'Time to assemble', 'Breakages log', 'Teacher SUS-style rating'] },
  { kind: 'proto2', title: 'Prototype v2', days: 21, deliverables: ['Revised CAD', 'BOM v2'], checklist: ['Fix top 5 issues', 'Translate all strings KZ/RU', 'Drop-test 1 m × 10'] },
  { kind: 'dfm', title: 'DFM', days: 14, deliverables: ['Supplier quotes ×3', 'Packaging dieline'], checklist: ['Tolerances', 'Nesting on sheet', 'Assembly time per kit target', 'QC test jig'] },
  { kind: 'pilot', title: 'Pilot', days: 45, deliverables: ['Pilot in 5 schools', 'Survey data'], checklist: ['Ship kits', 'Train teachers', 'Mid-pilot check-in', 'Collect pre/post quiz'] },
  {
    kind: 'certification',
    title: 'Certification',
    days: 45,
    toConfirm: true,
    deliverables: ['EAC certificate/declaration'],
    checklist: ['Choose accredited lab', 'Samples', 'Technical file', 'Labels with EAC mark ≥ 5 mm and “0–3” warning ≥ 10 mm'],
  },
  { kind: 'production', title: 'Production', days: 30, deliverables: ['First batch (MOQ)'], checklist: ['PO', 'Incoming QC', 'Assemble', 'Test every board', 'Pack'] },
  { kind: 'launch', title: 'Launch', days: 7, deliverables: ['Landing page', 'Kaspi listing', 'School letter'], checklist: ['Photos', 'Video', 'Price list', 'Akimat letter'] },
  { kind: 'sales', title: 'Sales', days: 30, deliverables: ['Monthly sales report'], checklist: ['Weekly order review', 'Reorder point check'] },
];

export const LAUNCH_INDEX = STAGES.findIndex((s) => s.kind === 'launch');
export const stageTitle = (k: StageKind) => STAGES.find((s) => s.kind === k)!.title;

/** Checklist due dates spread evenly inside the stage (the last item lands on the stage end). */
export function spreadDue(start: string, end: string, n: number): string[] {
  const span = dayDiff(start, end);
  return Array.from({ length: n }, (_, i) => addDayKey(start, Math.round(((i + 1) * span) / n)));
}

export function makeStages(start: string, days: number[] = STAGES.map((s) => s.days), prev?: PipelineStage[]): PipelineStage[] {
  let cursor = start;
  return STAGES.map((t, i) => {
    const d = Math.max(1, Math.round(days[i]));
    const s = cursor;
    const e = addDayKey(s, d - 1);
    cursor = addDayKey(e, 1);
    const old = prev?.[i];
    const dues = spreadDue(s, e, t.checklist.length);
    const checklist: ChecklistItem[] = old
      ? old.checklist.map((c, k) => ({ ...c, due: k < dues.length ? dues[k] : e }))
      : t.checklist.map((text, k) => ({ id: `${t.kind}-${k + 1}`, text, required: true, due: dues[k], done: false }));
    return {
      kind: t.kind,
      days: d,
      start: s,
      end: e,
      checklist,
      deliverables: old?.deliverables ?? t.deliverables.map((title) => ({ title, required: true })),
      state: old?.state ?? 'todo',
      overrideNote: old?.overrideNote,
    };
  });
}

/** Days from the first stage's start to the end of Launch. */
export const daysToLaunch = (days: number[]) => days.slice(0, LAUNCH_INDEX + 1).reduce((s, d) => s + Math.max(1, Math.round(d)), 0);

export interface BackwardPlan {
  start: string;
  days: number[];
  shortBy: number; // days missing at full length (0 = fits)
  compressed: boolean;
  earliestLaunch?: string; // when even 50 % compression is too late
}

/**
 * Backward from a target launch date (the end of Launch). Without `compress` the plan keeps the
 * default lengths and reports how many days are missing.
 */
export function backward(launch: string, today: string, compress: boolean, days: number[] = STAGES.map((s) => s.days)): BackwardPlan {
  const full = daysToLaunch(days);
  const startFull = addDayKey(launch, -(full - 1));
  const shortBy = Math.max(0, dayDiff(startFull, today));
  if (!shortBy || !compress) return { start: startFull, days, shortBy, compressed: false };

  const available = dayDiff(today, launch) + 1; // days from today to launch, inclusive
  const minimum = daysToLaunch(days.map((d) => Math.ceil(d * 0.5)));
  if (available < minimum) {
    const half = days.map((d, i) => (i <= LAUNCH_INDEX ? Math.ceil(d * 0.5) : d));
    return { start: today, days: half, shortBy, compressed: true, earliestLaunch: addDayKey(today, minimum - 1) };
  }
  // Scale the stages up to Launch to fit, never below half; fix rounding on the longest stage.
  const factor = available / full;
  const scaled = days.map((d, i) => (i <= LAUNCH_INDEX ? Math.max(Math.ceil(d * 0.5), Math.floor(d * factor)) : d));
  let diff = available - daysToLaunch(scaled);
  while (diff !== 0) {
    const order = scaled
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => i <= LAUNCH_INDEX && (diff > 0 || scaled[i] > Math.ceil(days[i] * 0.5)))
      .sort((a, b) => b.d - a.d);
    if (!order.length) break;
    scaled[order[0].i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  return { start: today, days: scaled, shortBy, compressed: true };
}

/** Changing one stage's length moves every later stage (ripple). */
export function rippleDays(stages: PipelineStage[], index: number, days: number): PipelineStage[] {
  const next = stages.map((s, i) => (i === index ? Math.max(1, Math.round(days)) : s.days));
  return makeStages(stages[0].start, next, stages);
}

export interface GateCheck {
  ok: boolean;
  missing: string[];
}

export function gate(s: PipelineStage): GateCheck {
  const missing = [...s.checklist.filter((c) => c.required && !c.done).map((c) => c.text), ...s.deliverables.filter((d) => d.required && !d.link?.trim()).map((d) => `${d.title} (link)`)];
  return { ok: missing.length === 0, missing };
}

export function projectProgress(stages: PipelineStage[]): number {
  const items = stages.flatMap((s) => s.checklist);
  return items.length ? items.filter((c) => c.done).length / items.length : 0;
}
