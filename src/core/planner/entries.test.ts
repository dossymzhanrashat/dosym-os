import { describe, expect, it } from 'vitest';
import { entriesInRange, entryFor, expandItem } from './entries';
import type { PlannerItem } from './types';

const item = (over: Partial<PlannerItem>): PlannerItem => ({
  id: 'a',
  title: 'Item',
  kind: 'event',
  source: 'user',
  priority: 0,
  importance: 'normal',
  reminders: [],
  done: false,
  updatedAt: '2026-10-30T00:00:00.000Z',
  ...over,
});

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('expandItem', () => {
  it('returns a one-off item only when it falls in the range', () => {
    const one = item({ start: at(2026, 11, 2, 10).toISOString(), end: at(2026, 11, 2, 11).toISOString() });
    expect(expandItem(one, at(2026, 11, 2), at(2026, 11, 3))).toHaveLength(1);
    expect(expandItem(one, at(2026, 11, 3), at(2026, 11, 4))).toHaveLength(0);
    expect(expandItem(item({}), at(2026, 11, 2), at(2026, 11, 3))).toHaveLength(0); // unscheduled
    expect(expandItem({ ...one, deletedAt: '2026-11-01T00:00:00Z' }, at(2026, 11, 2), at(2026, 11, 3))).toHaveLength(0);
  });

  it('repeats weekly on chosen weekdays, keeping the clock time', () => {
    const gym = item({
      start: at(2026, 11, 2, 17).toISOString(), // Monday
      end: at(2026, 11, 2, 18).toISOString(),
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3] },
    });
    const out = expandItem(gym, at(2026, 11, 1), at(2026, 11, 15));
    expect(out.map((e) => e.occurrence)).toEqual(['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
    expect(new Date(out[1].start!).getHours()).toBe(17);
    expect(out[1].id).toBe('a@2026-11-04');
    expect(out[1].baseId).toBe('a');
  });

  it('honours interval, until, completions and exceptions', () => {
    const daily = item({
      start: at(2026, 11, 1, 20).toISOString(),
      recurrence: { freq: 'daily', interval: 2, until: at(2026, 11, 9).toISOString() },
      completions: ['2026-11-03'],
      exceptions: ['2026-11-05'],
    });
    const out = expandItem(daily, at(2026, 11, 1), at(2026, 11, 30));
    expect(out.map((e) => e.occurrence)).toEqual(['2026-11-01', '2026-11-03', '2026-11-07', '2026-11-09']);
    expect(out.map((e) => e.done)).toEqual([false, true, false, false]);
  });

  it('repeats monthly on the same day of the month', () => {
    const rent = item({ dueDate: at(2026, 10, 31, 23, 59).toISOString(), kind: 'deadline', recurrence: { freq: 'monthly', interval: 1 } });
    const out = expandItem(rent, at(2026, 10, 1), at(2027, 2, 1));
    expect(out.map((e) => e.occurrence)).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']); // November has no 31st
  });
});

describe('entriesInRange / entryFor', () => {
  it('sorts by time and rebuilds a single occurrence', () => {
    const a = item({ id: 'a', start: at(2026, 11, 2, 12).toISOString() });
    const b = item({ id: 'b', dueDate: at(2026, 11, 2, 9).toISOString(), kind: 'deadline' });
    expect(entriesInRange([a, b], at(2026, 11, 2), at(2026, 11, 3)).map((e) => e.id)).toEqual(['b', 'a']);
    const daily = item({ id: 'd', start: at(2026, 11, 1, 8).toISOString(), recurrence: { freq: 'daily', interval: 1 } });
    expect(entryFor(daily, '2026-11-04')?.start).toBe(at(2026, 11, 4, 8).toISOString());
  });
});
