/*
 * FSRS-5 formulas exactly as written in SPEC § 5.2. The scheduler itself runs on ts-fsrs (given
 * these same weights); this file is the independent reference the unit tests compare against,
 * and what the forgetting-curve chart and "R today" use.
 */

export const DECAY = -0.5;
export const FACTOR = 19 / 81;

/** FSRS-5 published default weights (SPEC § 5.2; checked against ts-fsrs 5.4.2 — no clipping). */
export const W5 = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
  0.51655, 0.6621,
] as const;

const clampD = (d: number) => Math.min(10, Math.max(1, d));

/** Recall probability after t days at stability S. */
export function retrievability(t: number, s: number): number {
  if (s <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, t)) / s, DECAY);
}

/** Interval (days) at which R falls to the target r. At r = 0.9 this equals S. */
export function intervalFor(r: number, s: number): number {
  return (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

export function initialStability(g: number, w: readonly number[] = W5): number {
  return w[g - 1];
}

export function initialDifficulty(g: number, w: readonly number[] = W5): number {
  return clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);
}

/** Difficulty after grade g: linear damping, then mean reversion towards D0(Easy). */
export function nextDifficulty(d: number, g: number, w: readonly number[] = W5): number {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  const d0Easy = w[4] - Math.exp(w[5] * 3) + 1; // unclamped, as in the reference
  return clampD(w[7] * d0Easy + (1 - w[7]) * damped);
}

/** Stability after a successful review (g ≥ 2). Uses D and R before this review. */
export function recallStability(s: number, d: number, r: number, g: number, w: readonly number[] = W5): number {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy);
}

/** Stability after a lapse (Again on a review card). Never above the old S. */
export function lapseStability(s: number, d: number, r: number, w: readonly number[] = W5): number {
  return Math.min(s, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)));
}

/** Same-day (short-term) review. */
export function shortTermStability(s: number, g: number, w: readonly number[] = W5): number {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}
