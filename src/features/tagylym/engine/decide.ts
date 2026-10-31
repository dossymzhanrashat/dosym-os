import { CRITERIA } from '../data/seed';
import type { Criterion, KitOption, Weights } from '../model/types';

/*
 * Decision matrix (SPEC Module 3 › Decision Matrix screen).
 *   score(o) = Σ w_c · s_{o,c} / Σ w_c, shown 0–100 as (score − 1) / 4 × 100
 *   ties: higher rural suitability, then lower cost (= higher cost score), then code
 *   robustness: 500 runs with each weight × uniform(0.8, 1.2); share where the leader stays first
 *   (a seeded random generator, so the same weights always give the same number)
 * Option E (Teacher Box) is a modifier, not a competitor, so it is never ranked.
 */

const KEYS = CRITERIA.map((c) => c.id);

export const weightSum = (w: Weights) => KEYS.reduce((s, k) => s + Math.max(0, w[k]), 0);

export function score(o: Pick<KitOption, 'scores'>, w: Weights): number {
  const total = weightSum(w);
  if (total <= 0) return 0;
  const raw = KEYS.reduce((s, k) => s + Math.max(0, w[k]) * o.scores[k].value, 0) / total;
  return ((raw - 1) / 4) * 100;
}

export interface Ranked {
  option: KitOption;
  score: number;
  /** Each criterion's share of the 0–100 score (for the stacked bar). */
  parts: { criterion: Criterion; value: number }[];
}

export const rankable = (options: KitOption[]) => options.filter((o) => !o.deletedAt && !o.isTeacherBox);

function compare(a: { o: KitOption; s: number }, b: { o: KitOption; s: number }) {
  return b.s - a.s || b.o.scores.rural.value - a.o.scores.rural.value || b.o.scores.cost.value - a.o.scores.cost.value || a.o.code.localeCompare(b.o.code);
}

export function rank(options: KitOption[], w: Weights): Ranked[] {
  const total = weightSum(w);
  return rankable(options)
    .map((o) => ({ o, s: score(o, w) }))
    .sort(compare)
    .map(({ o, s }) => ({
      option: o,
      score: s,
      // (Σ w·s/W − 1)/4·100 = Σ w·(s − 1)/(4W)·100: each criterion's slice of the bar.
      parts: KEYS.map((k) => ({ criterion: k, value: total ? ((Math.max(0, w[k]) * (o.scores[k].value - 1)) / (4 * total)) * 100 : 0 })),
    }));
}

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Share of 500 jittered weightings in which the current leader stays first. */
export function robustness(options: KitOption[], w: Weights, runs = 500, seed = 42): number {
  const list = rankable(options);
  if (list.length < 2 || weightSum(w) <= 0) return 1;
  const leader = rank(list, w)[0].option.id;
  const rand = rng(seed);
  let kept = 0;
  for (let i = 0; i < runs; i++) {
    const jw = Object.fromEntries(KEYS.map((k) => [k, w[k] * (0.8 + 0.4 * rand())])) as Weights;
    if (rank(list, jw)[0].option.id === leader) kept++;
  }
  return kept / runs;
}

/** Optional "Cost auto-score": BOM total in ₸ → 1–5. */
export function costAutoScore(totalKZT: number): number {
  if (totalKZT < 3000) return 5;
  if (totalKZT < 8000) return 4;
  if (totalKZT < 12000) return 3;
  if (totalKZT < 20000) return 2;
  return 1;
}

export const CLOSE_CALL = 3;

/** When the top two share a controller (Steppe Bot and Ertegi Cards both use the ESP32). */
export function canMerge(a?: KitOption, b?: KitOption): boolean {
  return !!a && !!b && !!a.controller && a.controller === b.controller;
}

/** "Merge as one platform": one option with both kits' specs, to re-score. */
export function mergeOptions(a: KitOption, b: KitOption, now: Date): KitOption {
  const iso = now.toISOString();
  const names = new Set(a.bom.map((l) => l.name.toLowerCase()));
  const keys = CRITERIA.map((c) => c.id);
  return {
    ...a,
    id: crypto.randomUUID(),
    code: `${a.code}+${b.code}`,
    name: `${a.name} + ${b.name}`,
    nameKk: undefined,
    nameRu: undefined,
    concept: `One platform on the ${a.controller}: ${a.name} (${a.concept.split('.')[0]}) and ${b.name} (${b.concept.split('.')[0]}). Re-score before deciding.`,
    gradeMin: Math.min(a.gradeMin, b.gradeMin),
    gradeMax: Math.max(a.gradeMax, b.gradeMax),
    outcomes: [...a.outcomes, ...b.outcomes].sort((x, y) => x.grade - y.grade),
    // Shared parts once; the second kit's own parts added.
    bom: [...a.bom, ...b.bom.filter((l) => !names.has(l.name.toLowerCase()) && !/esp32|motor|labour|box|carton|holder|caster/i.test(l.name))],
    curriculum: [...a.curriculum, ...b.curriculum.map((l) => ({ ...l, index: l.index + a.lessonCount }))],
    lessonCount: a.lessonCount + b.lessonCount,
    safetyNotes: [...a.safetyNotes, ...b.safetyNotes.filter((n) => !a.safetyNotes.some((m) => m.regulation === n.regulation))],
    risks: [...new Set([...a.risks, ...b.risks])],
    scores: Object.fromEntries(keys.map((k) => [k, { value: Math.round((a.scores[k].value + b.scores[k].value) / 2), aiEstimate: true }])) as KitOption['scores'],
    prices: {},
    status: 'exploring',
    source: 'merge',
    sellAsTeacherBox: false,
    createdAt: iso,
    updatedAt: iso,
  };
}
