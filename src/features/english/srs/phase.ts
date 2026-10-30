import { almatyAt } from '../../../core/planner/time';

/*
 * The IELTS plan's phases (SPEC § 2), picked from the date — the app launched mid-Phase 1.
 * The test is on 10 Jun 2027 (confirmed 31 Oct 2026), after the plan's 10–21 May test week,
 * so Phase 4 (peak, no new cards) runs until the test date.
 */

export interface Phase {
  index: 1 | 2 | 3 | 4;
  name: string;
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
  newCardsPerDay: number;
}

export const PHASES: Phase[] = [
  { index: 1, name: 'Foundation', start: '2026-10-26', end: '2026-12-31', newCardsPerDay: 15 },
  { index: 2, name: 'Skill building', start: '2027-01-01', end: '2027-02-28', newCardsPerDay: 15 },
  { index: 3, name: 'Exam mastery', start: '2027-03-01', end: '2027-04-30', newCardsPerDay: 5 },
  { index: 4, name: 'Peak and test', start: '2027-05-01', end: '2027-06-10', newCardsPerDay: 0 },
];

/** Mock weeks and overall targets (SPEC § 2). */
export const MOCKS: { date: string; target: string }[] = [
  { date: '2026-10-26', target: 'diagnostic' },
  { date: '2026-11-23', target: '6.5' },
  { date: '2026-12-21', target: '6.5–7.0' },
  { date: '2027-01-25', target: '7.0' },
  { date: '2027-02-22', target: '7.0–7.5' },
  { date: '2027-03-15', target: '7.5' },
  { date: '2027-03-29', target: '7.5' },
  { date: '2027-04-12', target: '7.5–8.0' },
  { date: '2027-04-26', target: '8.0' },
  { date: '2027-05-03', target: '8.0' },
];

export const ADMIN_DEADLINES = [
  { id: 'decide', date: '2027-01-31', title: 'IELTS: decide test date and centre' },
  { id: 'book', date: '2027-03-01', title: 'IELTS: book the test' },
];

/** The plan's weekly pattern: the day's skill block (Mon = 1 … Sun = 0). */
export const WEEKLY_PATTERN: Record<number, string> = {
  1: 'Writing Task 2',
  2: 'Reading passage',
  3: 'Speaking',
  4: 'Writing Task 1',
  5: 'Listening, 2 parts',
  6: 'Full Listening + Reading test',
  0: 'Rewrite + Part 2 ×3 + weekly review',
};

/** Phase for a study day ("YYYY-MM-DD"); before the plan → Phase 1, after → Phase 4. */
export function phaseFor(day: string): Phase {
  return PHASES.find((p) => day >= p.start && day <= p.end) ?? (day < PHASES[0].start ? PHASES[0] : PHASES[3]);
}

const toDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return almatyAt(y, m - 1, d, 12 * 60);
};

/** "week 1 of 10" inside the phase. */
export function phaseWeek(phase: Phase, day: string): { week: number; of: number } {
  const start = toDate(phase.start).getTime();
  const days = (toDate(day).getTime() - start) / 86_400_000;
  const total = (toDate(phase.end).getTime() - start) / 86_400_000 + 1;
  return { week: Math.max(1, Math.floor(days / 7) + 1), of: Math.ceil(total / 7) };
}

export function nextMock(day: string): { date: string; target: string } | undefined {
  return MOCKS.find((m) => m.date >= day);
}

/**
 * Today's new-card cap: the phase's number (or the user's setting), halved when tomorrow's
 * forecast is over 150 reviews and zero over 250 (SPEC § 5.6 load throttle).
 */
export function newCap(day: string, tomorrowForecast: number, override?: number): { cap: number; throttled: 'none' | 'half' | 'stop' } {
  const base = override ?? phaseFor(day).newCardsPerDay;
  if (tomorrowForecast > 250) return { cap: 0, throttled: 'stop' };
  if (tomorrowForecast > 150) return { cap: Math.floor(base / 2), throttled: 'half' };
  return { cap: base, throttled: 'none' };
}
