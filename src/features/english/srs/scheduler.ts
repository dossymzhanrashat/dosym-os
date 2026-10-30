import { createEmptyCard, fsrs, generatorParameters, State, type Card as FsrsCard, type FSRS, type Grade as FsrsGrade } from 'ts-fsrs';
import { DAY, MINUTE, almatyAt } from '../../../core/planner/time';
import type { CardState, Grade, ReviewLog, SchedulerKind, VocabCard } from '../model/types';
import { retrievability, W5 } from './fsrsMath';

/*
 * Grading a card (SPEC § 5.2–5.4). FSRS-5 runs on ts-fsrs with the spec's weights; this wrapper
 * adds the spec's own rules on top:
 *   - learning steps [1m, 10m], relearning [10m]; Hard on a step waits 1.5 × the step
 *   - review intervals: whole days, ±5 % fuzz from 3 days (seeded by card id + reps, so it
 *     repeats exactly), Hard < Good < Easy, 1 day minimum, max interval cap (180 d)
 *   - exam-date awareness from 1 Apr 2027: due no later than test − 3 days if R would drop < 0.90
 *   - leech at 6 lapses; three Good/Easy in a row clear it
 * plus the Simple ladder fallback (1 → 3 → 6 → 14 → 24 → 60 d, then × 2.5).
 */

export interface SchedulerConfig {
  kind: SchedulerKind;
  retention: number;
  maxIntervalDays: number;
  testDate?: string; // YYYY-MM-DD
}

export const LEARNING_STEPS_MIN = [1, 10];
export const RELEARNING_STEPS_MIN = [10];
export const LEECH_LAPSES = 6;
const EXAM_AWARE_FROM = almatyAt(2027, 3, 1, 0); // 1 Apr 2027

const STATE_TO_FSRS: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const STATE_FROM_FSRS: Record<State, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const engines = new Map<string, FSRS>();
function engine(cfg: SchedulerConfig): FSRS {
  const key = `${cfg.retention}|${cfg.maxIntervalDays}`;
  let e = engines.get(key);
  if (!e) {
    e = fsrs(
      generatorParameters({
        w: [...W5],
        request_retention: cfg.retention,
        maximum_interval: cfg.maxIntervalDays,
        enable_fuzz: false, // the spec's ±5 % fuzz is applied below
        enable_short_term: true,
        learning_steps: LEARNING_STEPS_MIN.map((m) => `${m}m` as const),
        relearning_steps: RELEARNING_STEPS_MIN.map((m) => `${m}m` as const),
      }),
    );
    // ts-fsrs raises w19 (FSRS-6 only) to at least 0.01 when short-term is on; FSRS-5 has no w19,
    // so set it to exactly 0 to get the spec's same-day formula S·e^(w17(G−3+w18)).
    (e.parameters.w as number[])[19] = 0;
    engines.set(key, e);
  }
  return e;
}

/** Deterministic 0–1 from a string (FNV-1a + mulberry32). */
export function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** ±5 % fuzz for intervals of 3 days and more, reproducible for a given card, reps and grade. */
export function fuzzDays(days: number, seed: string): number {
  if (days < 3) return days;
  return Math.max(1, Math.round(days * (1 + (seededUnit(seed) * 2 - 1) * 0.05)));
}

function toFsrs(card: VocabCard, now: Date): FsrsCard {
  if (card.state === 'new') return createEmptyCard(now);
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: Math.round(card.scheduledDays),
    learning_steps: card.step,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_FSRS[card.state],
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  };
}

function elapsedDays(card: VocabCard, now: Date): number {
  return card.lastReview ? Math.max(0, (now.getTime() - new Date(card.lastReview).getTime()) / DAY) : 0;
}

/** Recall probability of a card right now (1 for new cards). */
export function cardR(card: VocabCard, now: Date): number {
  if (card.state === 'new' || !card.lastReview) return 1;
  return retrievability(elapsedDays(card, now), card.stability);
}

// ---------- Simple ladder ----------

const RUNGS = [1, 3, 6, 14, 24, 60];
export function ladderDays(index: number, maxDays = 180): number {
  if (index < RUNGS.length) return Math.min(RUNGS[index], maxDays);
  return Math.min(Math.round(RUNGS[RUNGS.length - 1] * Math.pow(2.5, index - RUNGS.length + 1)), maxDays);
}

function ladderNext(card: VocabCard, g: Grade, now: Date, cfg: SchedulerConfig): VocabCard {
  const inReview = card.state === 'review';
  // Hard on a new or (re)learning card: one more short step (15 min), so Again < Hard < Good.
  if (g === 2 && !inReview) {
    return {
      ...card,
      state: card.state === 'relearning' ? 'relearning' : 'learning',
      due: new Date(now.getTime() + 1.5 * RELEARNING_STEPS_MIN[0] * MINUTE).toISOString(),
      scheduledDays: (1.5 * RELEARNING_STEPS_MIN[0]) / (24 * 60),
      stability: Math.max(card.stability, 1),
      difficulty: card.difficulty || 5,
    };
  }
  if (g === 1) {
    return {
      ...card,
      state: inReview ? 'relearning' : 'learning',
      ladderIndex: 0,
      lapses: card.lapses + (inReview ? 1 : 0),
      due: new Date(now.getTime() + RELEARNING_STEPS_MIN[0] * MINUTE).toISOString(),
      scheduledDays: RELEARNING_STEPS_MIN[0] / (24 * 60),
      stability: Math.max(card.stability, 1),
      difficulty: card.difficulty || 5,
    };
  }
  const index = !inReview ? (g === 4 ? card.ladderIndex + 1 : card.ladderIndex) : g === 2 ? card.ladderIndex : card.ladderIndex + (g === 4 ? 2 : 1);
  const days = ladderDays(index, cfg.maxIntervalDays);
  return {
    ...card,
    state: 'review',
    ladderIndex: index,
    due: new Date(now.getTime() + days * DAY).toISOString(),
    scheduledDays: days,
    stability: days, // implied S = interval, so R(t, S) and the curve still work
    difficulty: card.difficulty || 5,
  };
}

// ---------- Preview and review ----------

export type Preview = Record<Grade, VocabCard>;

/** What each of Again / Hard / Good / Easy would do to this card now. */
export function preview(card: VocabCard, now: Date, cfg: SchedulerConfig): Preview {
  const out = {} as Preview;
  if (cfg.kind === 'ladder') {
    for (const g of [1, 2, 3, 4] as Grade[]) out[g] = ladderNext(card, g, now, cfg);
  } else {
    const rec = engine(cfg).repeat(toFsrs(card, now), now);
    for (const g of [1, 2, 3, 4] as Grade[]) {
      const f = rec[g as FsrsGrade].card;
      let due = f.due;
      // Hard on a learning step: 1.5 × the current step (ts-fsrs would wait the mean of two steps).
      if (g === 2 && (card.state === 'new' || card.state === 'learning') && f.state === State.Learning) {
        const step = LEARNING_STEPS_MIN[Math.min(card.state === 'new' ? 0 : card.step, LEARNING_STEPS_MIN.length - 1)];
        due = new Date(now.getTime() + 1.5 * step * MINUTE);
      }
      out[g] = {
        ...card,
        state: STATE_FROM_FSRS[f.state],
        stability: f.stability,
        difficulty: f.difficulty,
        due: due.toISOString(),
        step: f.learning_steps,
        reps: f.reps,
        lapses: f.lapses,
        scheduledDays: (due.getTime() - now.getTime()) / DAY,
      };
    }
  }

  // Review intervals: whole days with fuzz, then Hard < Good < Easy, 1 day min, max cap.
  const max = cfg.maxIntervalDays;
  const days = {} as Record<Grade, number>;
  for (const g of [2, 3, 4] as Grade[]) {
    if (out[g].state !== 'review') continue;
    const raw = Math.max(1, Math.round(out[g].scheduledDays));
    // No fuzz at the cap, so a long interval never shrinks again.
    days[g] = cfg.kind === 'fsrs5' && raw < max ? Math.min(fuzzDays(raw, `${card.id}:${card.reps}:${g}`), max) : Math.min(raw, max);
  }
  if (days[3] !== undefined && days[2] !== undefined && days[3] <= days[2]) days[3] = days[2] + 1;
  if (days[4] !== undefined && days[3] !== undefined && days[4] <= days[3]) days[4] = days[3] + 1;
  // At the cap, keep the buttons distinct by stepping down from it: Easy ≤ max, Good < Easy, Hard < Good.
  if (days[4] !== undefined && days[4] > max) days[4] = max;
  if (days[3] !== undefined && days[4] !== undefined && days[3] >= days[4]) days[3] = Math.max(1, days[4] - 1);
  else if (days[3] !== undefined && days[3] > max) days[3] = max;
  if (days[2] !== undefined && days[3] !== undefined && days[2] >= days[3]) days[2] = Math.max(1, days[3] - 1);
  for (const g of [2, 3, 4] as Grade[]) {
    if (days[g] === undefined) continue;
    let d = days[g];
    let due = new Date(now.getTime() + d * DAY);
    // Exam-date awareness: fresh for the test.
    if (cfg.testDate && now >= EXAM_AWARE_FROM) {
      const [y, m, dd] = cfg.testDate.split('-').map(Number);
      const test = almatyAt(y, m - 1, dd, 4 * 60);
      const cap = new Date(test.getTime() - 3 * DAY);
      const rOnTest = retrievability((test.getTime() - now.getTime()) / DAY, out[g].stability);
      if (rOnTest < 0.9 && due > cap && cap > now) {
        due = cap;
        d = (cap.getTime() - now.getTime()) / DAY;
      }
    }
    out[g] = { ...out[g], due: due.toISOString(), scheduledDays: d };
  }
  return out;
}

export interface ReviewResult {
  card: VocabCard;
  log: ReviewLog;
}

/** Grade a card. Returns the new card and the log row (which also allows an exact undo). */
export function review(card: VocabCard, g: Grade, now: Date, cfg: SchedulerConfig, durationMs: number): ReviewResult {
  const next = preview(card, now, cfg)[g];
  const lapsed = card.state === 'review' && g === 1;
  const goodStreak = g >= 3 ? card.goodStreak + 1 : 0;
  const isLeech = lapsed && next.lapses >= LEECH_LAPSES ? true : card.isLeech && goodStreak >= 3 ? false : card.isLeech;
  const iso = now.toISOString();
  const result: VocabCard = {
    ...next,
    lastReview: iso,
    lastGrade: g,
    goodStreak,
    isLeech,
    reps: cfg.kind === 'ladder' ? card.reps + 1 : next.reps,
    introducedAt: card.introducedAt ?? iso,
    updatedAt: iso,
  };
  const log: ReviewLog = {
    id: crypto.randomUUID(),
    cardId: card.id,
    noteId: card.noteId,
    reviewedAt: iso,
    grade: g,
    stateBefore: card.state,
    elapsedDays: elapsedDays(card, now),
    scheduledDays: result.scheduledDays,
    rBefore: cardR(card, now),
    sBefore: card.stability,
    sAfter: result.stability,
    dBefore: card.difficulty,
    dAfter: result.difficulty,
    durationMs,
    scheduler: cfg.kind,
    updatedAt: iso,
  };
  return { card: result, log };
}

// ---------- Switching scheduler ----------

/** FSRS → ladder: nearest rung at or above the current interval; due date unchanged. */
export function toLadder(card: VocabCard, maxDays = 180): VocabCard {
  if (card.state === 'new') return { ...card, ladderIndex: 0 };
  let i = 0;
  while (ladderDays(i, maxDays) < card.scheduledDays && ladderDays(i + 1, maxDays) > ladderDays(i, maxDays)) i++;
  return { ...card, ladderIndex: i };
}

/** Ladder → FSRS: S = current interval, D = 5; due date unchanged. */
export function toFsrs5(card: VocabCard): VocabCard {
  if (card.state === 'new') return card;
  return { ...card, stability: Math.max(card.scheduledDays, 0.01), difficulty: 5 };
}

/** Button label for the next interval: "1m", "10m", "5h", "2d", "3mo". */
export function intervalLabel(card: VocabCard, now: Date): string {
  const min = Math.max(1, Math.round((new Date(card.due).getTime() - now.getTime()) / MINUTE));
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h`;
  const days = Math.round(min / (24 * 60));
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

export function newCard(noteId: string, type: VocabCard['type'], now: Date): VocabCard {
  const iso = now.toISOString();
  return {
    id: crypto.randomUUID(),
    noteId,
    type,
    state: 'new',
    stability: 0,
    difficulty: 0,
    due: iso,
    scheduledDays: 0,
    step: 0,
    ladderIndex: 0,
    reps: 0,
    lapses: 0,
    goodStreak: 0,
    isLeech: false,
    suspended: false,
    updatedAt: iso,
  };
}
