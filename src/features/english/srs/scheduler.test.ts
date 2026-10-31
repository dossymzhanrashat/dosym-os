import { describe, expect, it } from 'vitest';
import { DAY, MINUTE } from '../../../core/planner/time';
import type { Grade, VocabCard, VocabNote } from '../model/types';
import {
  FACTOR,
  initialDifficulty,
  initialStability,
  intervalFor,
  lapseStability,
  nextDifficulty,
  recallStability,
  retrievability,
  shortTermStability,
  W5,
} from './fsrsMath';
import { newCap } from './phase';
import { buildQueue } from './queue';
import { fuzzDays, ladderDays, newCard, preview, review, toFsrs5, toLadder, type SchedulerConfig } from './scheduler';

const FSRS: SchedulerConfig = { kind: 'fsrs5', retention: 0.9, maxIntervalDays: 180 };
const LADDER: SchedulerConfig = { kind: 'ladder', retention: 0.9, maxIntervalDays: 180 };
const T0 = new Date('2026-11-02T03:00:00Z'); // 08:00 Almaty
const days = (c: VocabCard, from: Date) => (new Date(c.due).getTime() - from.getTime()) / DAY;

/** Grade repeatedly, each time exactly when the card is due. */
function run(grades: Grade[], cfg = FSRS, start = T0) {
  let card = newCard('note', 'recognition', start);
  let now = start;
  const out: { card: VocabCard; now: Date }[] = [];
  for (const g of grades) {
    card = review(card, g, now, cfg, 5000).card;
    out.push({ card, now });
    now = new Date(card.due);
  }
  return out;
}

describe('FSRS-5 formulas (SPEC § 5.2)', () => {
  it('R and I: I(0.9, S) equals S, and R(S, S) is 0.9', () => {
    for (const s of [0.4, 1, 3.17, 15.7, 42, 180]) {
      expect(Math.abs(intervalFor(0.9, s) - s)).toBeLessThan(0.01);
      expect(retrievability(s, s)).toBeCloseTo(0.9, 6);
    }
    expect(retrievability(0, 5)).toBe(1);
    expect(FACTOR).toBeCloseTo(19 / 81);
    expect(intervalFor(0.95, 10)).toBeLessThan(10);
  });

  it('initial stability and difficulty', () => {
    expect([1, 2, 3, 4].map((g) => initialStability(g))).toEqual([0.40255, 1.18385, 3.173, 15.69105]);
    expect(initialDifficulty(1)).toBeCloseTo(7.1949, 4);
    expect(initialDifficulty(3)).toBeCloseTo(W5[4] - Math.exp(W5[5] * 2) + 1, 6);
    expect(initialDifficulty(4)).toBeGreaterThanOrEqual(1);
  });

  it('difficulty update: damping towards 10 and mean reversion, clamped 1–10', () => {
    const d = 5;
    const again = nextDifficulty(d, 1);
    const good = nextDifficulty(d, 3);
    const easy = nextDifficulty(d, 4);
    expect(again).toBeGreaterThan(d);
    expect(easy).toBeLessThan(d);
    // Good has ΔD = 0, so only the tiny mean reversion moves it.
    expect(Math.abs(good - d)).toBeLessThan(0.05);
    // Damping: the same Again moves a hard card less than an easy one.
    expect(nextDifficulty(9, 1) - 9).toBeLessThan(nextDifficulty(2, 1) - 2);
    expect(nextDifficulty(10, 1)).toBeLessThanOrEqual(10);
    expect(nextDifficulty(1, 4)).toBeGreaterThanOrEqual(1);
  });

  it('recall stability: Hard < Good < Easy, all above S', () => {
    const [s, d, r] = [10, 5, 0.9];
    const h = recallStability(s, d, r, 2);
    const g = recallStability(s, d, r, 3);
    const e = recallStability(s, d, r, 4);
    expect(h).toBeGreaterThan(s);
    expect(g).toBeGreaterThan(h);
    expect(e).toBeGreaterThan(g);
  });

  it('lapse stability never exceeds the old S', () => {
    for (const s of [0.5, 2, 10, 60, 180]) for (const d of [1, 5, 10]) for (const r of [0.3, 0.7, 0.95]) expect(lapseStability(s, d, r)).toBeLessThanOrEqual(s);
  });

  it('short-term stability: Good grows S, Again shrinks it', () => {
    expect(shortTermStability(3, 3)).toBeGreaterThan(3);
    expect(shortTermStability(3, 1)).toBeLessThan(3);
  });
});

describe('ts-fsrs matches the spec formulas', () => {
  it('first grade sets S0 and D0', () => {
    for (const g of [1, 2, 3, 4] as Grade[]) {
      const c = review(newCard('n', 'recognition', T0), g, T0, FSRS, 0).card;
      expect(c.stability).toBeCloseTo(initialStability(g), 4);
      expect(c.difficulty).toBeCloseTo(initialDifficulty(g), 4);
    }
  });

  it('a learning step uses the short-term formula, and a due review the recall formula', () => {
    const steps = run([3, 3, 3]);
    const afterStep2 = steps[1].card;
    expect(afterStep2.stability).toBeCloseTo(shortTermStability(initialStability(3), 3), 4);
    const before = afterStep2;
    const t = Math.round((steps[2].now.getTime() - new Date(before.lastReview!).getTime()) / DAY);
    const r = retrievability(t, before.stability);
    expect(steps[2].card.stability).toBeCloseTo(recallStability(before.stability, before.difficulty, r, 3), 3);
  });
});

describe('intervals (SPEC § 5.3)', () => {
  it('Good, Good, then Good at each due date grows monotonically', () => {
    const path = run([3, 3, 3, 3, 3, 3, 3, 3]);
    expect(days(path[0].card, path[0].now) * 24 * 60).toBeCloseTo(10, 5); // step 2: 10 min
    const reviewDays = path.slice(1).map((p) => Math.round(days(p.card, p.now)));
    for (let i = 1; i < reviewDays.length; i++) expect(reviewDays[i]).toBeGreaterThanOrEqual(reviewDays[i - 1]);
    expect(reviewDays[0]).toBeGreaterThanOrEqual(1);
    expect(Math.max(...reviewDays)).toBeLessThanOrEqual(180);
  });

  it('new card: Again 1 min, Hard 1.5 min (1.5 × step), Good 10 min, Easy graduates', () => {
    const p = preview(newCard('n', 'recognition', T0), T0, FSRS);
    const min = (c: VocabCard) => (new Date(c.due).getTime() - T0.getTime()) / MINUTE;
    expect(min(p[1])).toBeCloseTo(1);
    expect(min(p[2])).toBeCloseTo(1.5);
    expect(min(p[3])).toBeCloseTo(10);
    expect(p[4].state).toBe('review');
    expect(days(p[4], T0)).toBeGreaterThanOrEqual(1);
  });

  it('review buttons are always Again < Hard < Good < Easy, Hard at least 1 day', () => {
    let card = run([3, 3])[1].card;
    let now = new Date(card.due);
    for (let i = 0; i < 6; i++) {
      const p = preview(card, now, FSRS);
      const d = ([1, 2, 3, 4] as Grade[]).map((g) => days(p[g], now));
      expect(d[0]).toBeLessThan(d[1]);
      expect(d[1]).toBeLessThan(d[2]);
      expect(d[2]).toBeLessThan(d[3]);
      expect(d[1]).toBeGreaterThanOrEqual(1);
      card = review(card, 3, now, FSRS, 0).card;
      now = new Date(card.due);
      if (days(card, now) > 170) break;
    }
  });

  it('a lapse moves to relearning, adds a lapse and comes back in 10 min', () => {
    const graduated = run([3, 3])[1].card;
    const now = new Date(graduated.due);
    const lapsed = review(graduated, 1, now, FSRS, 0).card;
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(graduated.lapses + 1);
    expect((new Date(lapsed.due).getTime() - now.getTime()) / MINUTE).toBeCloseTo(10);
    expect(lapsed.stability).toBeLessThanOrEqual(graduated.stability);
  });

  it('six lapses mark a leech; three Good in a row clear it', () => {
    let card = run([3, 3])[1].card;
    let now = new Date(card.due);
    for (let i = 0; i < 6; i++) {
      card = review(card, 1, now, FSRS, 0).card; // lapse
      now = new Date(card.due);
      card = review(card, 3, now, FSRS, 0).card; // relearn
      now = new Date(card.due);
      if (i < 5) expect(card.isLeech).toBe(false);
    }
    expect(card.lapses).toBe(6);
    expect(card.isLeech).toBe(true);
    // One Good was already given after the 6th lapse; two more make three in a row.
    card = review(card, 3, now, FSRS, 0).card;
    expect(card.isLeech).toBe(true);
    now = new Date(card.due);
    card = review(card, 3, now, FSRS, 0).card;
    expect(card.isLeech).toBe(false);
  });

  it('fuzz is ±5 % from 3 days and reproducible', () => {
    expect(fuzzDays(2, 'x')).toBe(2);
    for (let i = 0; i < 50; i++) {
      const d = fuzzDays(100, `seed${i}`);
      expect(d).toBeGreaterThanOrEqual(95);
      expect(d).toBeLessThanOrEqual(105);
      expect(fuzzDays(100, `seed${i}`)).toBe(d);
    }
  });

  it('review() does not change its input (undo restores the saved card exactly)', () => {
    const card = run([3, 3])[1].card;
    const copy = structuredClone(card);
    review(card, 1, new Date(card.due), FSRS, 0);
    expect(card).toEqual(copy);
  });
});

describe('Simple ladder (SPEC § 5.4)', () => {
  it('repeated Good gives 1, 3, 6, 14, 24, 60, 150 days', () => {
    const path = run([3, 3, 3, 3, 3, 3, 3], LADDER);
    expect(path.map((p) => Math.round(days(p.card, p.now)))).toEqual([1, 3, 6, 14, 24, 60, 150]);
    expect(ladderDays(7)).toBe(180); // capped
  });

  it('Again resets to 1 day after a 10-minute relearning step', () => {
    const path = run([3, 3, 3, 1, 3], LADDER);
    expect((new Date(path[3].card.due).getTime() - path[3].now.getTime()) / MINUTE).toBeCloseTo(10);
    expect(path[3].card.lapses).toBe(1);
    expect(Math.round(days(path[4].card, path[4].now))).toBe(1);
  });

  it('switching scheduler keeps the due date and stays within one rung', () => {
    const fsrsCard = run([3, 3, 3, 3])[3].card;
    const asLadder = toLadder(fsrsCard);
    expect(asLadder.due).toBe(fsrsCard.due);
    expect(ladderDays(asLadder.ladderIndex)).toBeGreaterThanOrEqual(Math.floor(fsrsCard.scheduledDays));
    if (asLadder.ladderIndex > 0) expect(ladderDays(asLadder.ladderIndex - 1)).toBeLessThan(fsrsCard.scheduledDays);
    const back = toFsrs5(run([3, 3, 3], LADDER)[2].card);
    expect(back.stability).toBe(6);
    expect(back.difficulty).toBe(5);
  });
});

describe('exam-date awareness (SPEC § 5.3)', () => {
  const test = new Date('2027-06-09T23:00:00Z').getTime(); // 10 Jun 2027 04:00 Almaty
  const cap = test - 3 * DAY;
  const reviewCard = (s: number, now: Date): VocabCard => ({
    ...newCard('n', 'recognition', now),
    state: 'review',
    stability: s,
    difficulty: 5,
    scheduledDays: s,
    reps: 5,
    due: now.toISOString(),
    lastReview: new Date(now.getTime() - s * DAY).toISOString(),
  });

  it('from 1 Apr 2027 no card with test-day R < 0.90 is due after test − 3 days', () => {
    let capped = 0;
    for (const retention of [0.8, 0.9]) {
      const cfg: SchedulerConfig = { ...FSRS, retention, testDate: '2027-06-10' };
      for (const when of ['2027-04-05', '2027-05-01', '2027-05-25']) {
        const now = new Date(`${when}T03:00:00Z`);
        for (const s of [3, 10, 20, 40, 80, 160]) {
          const p = preview(reviewCard(s, now), now, cfg);
          for (const g of [2, 3, 4] as Grade[]) {
            const due = new Date(p[g].due).getTime();
            if (retrievability((test - now.getTime()) / DAY, p[g].stability) < 0.9) expect(due).toBeLessThanOrEqual(cap);
            if (due === cap) capped++;
          }
        }
      }
    }
    expect(capped).toBeGreaterThan(0); // the rule actually fired somewhere
  });

  it('does nothing before 1 Apr 2027', () => {
    const cfg: SchedulerConfig = { ...FSRS, retention: 0.8, testDate: '2027-06-10' };
    const p = preview(reviewCard(80, T0), T0, cfg);
    expect(days(p[3], T0)).toBeGreaterThan(80);
  });
});

describe('queue and caps (SPEC § 5.6)', () => {
  const note = (id: string, kind: VocabNote['source']['kind'], createdAt: string): VocabNote => ({
    id,
    key: id,
    kind: 'word',
    headword: id,
    lemma: id,
    definition: '',
    examples: [],
    family: [],
    collocations: [],
    synonymLadder: [],
    source: { kind },
    status: 'active',
    isLeech: false,
    createdAt,
    updatedAt: createdAt,
  });

  it('learning first, then reviews by ascending R, new cards one per four', () => {
    const now = new Date('2026-11-10T05:00:00Z');
    const notes = new Map<string, VocabNote>();
    const cards: VocabCard[] = [];
    const add = (id: string, card: Partial<VocabCard>, kind: VocabNote['source']['kind'] = 'seed') => {
      notes.set(id, note(id, kind, `2026-11-01T00:00:0${cards.length % 10}Z`));
      cards.push({ ...newCard(id, 'recognition', now), ...card });
    };
    add('learn', { state: 'learning', due: new Date(now.getTime() - MINUTE).toISOString(), lastReview: new Date(now.getTime() - 11 * MINUTE).toISOString(), introducedAt: '2026-11-09T00:00:00Z' });
    for (let i = 0; i < 6; i++) {
      // Older last review at the same stability → lower R → earlier in the queue.
      add(`rev${i}`, { state: 'review', stability: 10, due: new Date(now.getTime() - DAY).toISOString(), lastReview: new Date(now.getTime() - (10 + i) * DAY).toISOString() });
    }
    add('new-seed', {}, 'seed');
    add('new-manual', {}, 'manual');
    const q = buildQueue({ cards, notes, now, newAllowance: 15, reviewAllowance: 250, typeEnabled: () => true });
    expect(q.order.map((c) => c.noteId)).toEqual(['learn', 'rev5', 'rev4', 'rev3', 'rev2', 'new-manual', 'rev1', 'rev0', 'new-seed']);
  });

  it('buries siblings and introduces new siblings on separate days', () => {
    const now = new Date('2026-11-10T05:00:00Z');
    const notes = new Map([['w', note('w', 'seed', '2026-11-01T00:00:00Z')]]);
    const rec = { ...newCard('w', 'recognition', now) };
    const prod = { ...newCard('w', 'production', now) };
    let q = buildQueue({ cards: [rec, prod], notes, now, newAllowance: 15, reviewAllowance: 250, typeEnabled: () => true });
    expect(q.order.map((c) => c.type)).toEqual(['recognition']);
    // Recognition introduced today → production waits for tomorrow.
    const recDone: VocabCard = { ...rec, state: 'review', due: new Date(now.getTime() + 3 * DAY).toISOString(), lastReview: now.toISOString(), introducedAt: now.toISOString() };
    q = buildQueue({ cards: [recDone, prod], notes, now, newAllowance: 15, reviewAllowance: 250, typeEnabled: () => true });
    expect(q.order).toHaveLength(0);
    const tomorrow = new Date(now.getTime() + DAY);
    q = buildQueue({ cards: [recDone, prod], notes, now: tomorrow, newAllowance: 15, reviewAllowance: 250, typeEnabled: () => true });
    expect(q.order.map((c) => c.type)).toEqual(['production']);
  });

  it('respects the new and review allowances', () => {
    const now = new Date('2026-11-10T05:00:00Z');
    const notes = new Map<string, VocabNote>();
    const cards: VocabCard[] = [];
    for (let i = 0; i < 20; i++) {
      notes.set(`n${i}`, note(`n${i}`, 'seed', '2026-11-01T00:00:00Z'));
      cards.push(newCard(`n${i}`, 'recognition', now));
    }
    expect(buildQueue({ cards, notes, now, newAllowance: 15, reviewAllowance: 250, typeEnabled: () => true }).news).toBe(15);
    expect(buildQueue({ cards, notes, now, newAllowance: 0, reviewAllowance: 250, typeEnabled: () => true }).news).toBe(0);
  });

  it('new cap follows the phase (15/15/5/0) and the load throttle', () => {
    expect(newCap('2026-11-10', 0).cap).toBe(15);
    expect(newCap('2027-02-01', 0).cap).toBe(15);
    expect(newCap('2027-03-10', 0).cap).toBe(5);
    expect(newCap('2027-05-05', 0).cap).toBe(0);
    expect(newCap('2027-06-01', 0).cap).toBe(0); // test on 10 June: still peak
    expect(newCap('2026-11-10', 151)).toEqual({ cap: 7, throttled: 'half' });
    expect(newCap('2026-11-10', 251)).toEqual({ cap: 0, throttled: 'stop' });
  });
});

describe('streak', async () => {
  const { streakLength } = await import('../data/store');
  it('counts days in a row ending today, or yesterday while today is open', () => {
    const days = new Set(['2026-10-29', '2026-10-30', '2026-10-31']);
    expect(streakLength(days, '2026-10-31')).toBe(3);
    expect(streakLength(days, '2026-11-01')).toBe(3); // today not done yet
    expect(streakLength(days, '2026-11-02')).toBe(0); // a day was missed
    expect(streakLength(new Set(['2026-02-28', '2026-03-01']), '2026-03-01')).toBe(2);
  });
});
