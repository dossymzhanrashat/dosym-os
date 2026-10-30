import { describe, expect, it } from 'vitest';
import { computeReminders, DAILY_CAP } from './reminderEngine';
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

// Tests run with TZ=Asia/Almaty, so local time = Almaty time.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 10, 30, 15); // Friday 30 Oct 2026 15:00
const base = '/dosym-os/';
const run = (items: PlannerItem[], now = NOW) => computeReminders(items, { now, base });
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('computeReminders', () => {
  it('sends an important plan 30 min before, linking to the item', () => {
    const r = run([item({ id: 'x', title: 'IELTS mock', start: at(2026, 10, 31, 10).toISOString(), importance: 'important', reminders: [{ offsetMinutes: 30 }] })]);
    const plan = r.find((d) => d.plannerItemId === 'x')!;
    expect(hhmm(plan.fireAt)).toBe('10-31 09:30');
    expect(plan.url).toBe('/dosym-os/planner/item/x');
    expect(plan.alarm).toBe(false);
    expect(plan.body).toContain('in 30 min');
  });

  it('drops reminders already in the past', () => {
    const r = run([item({ start: at(2026, 10, 30, 15, 20).toISOString(), reminders: [{ offsetMinutes: 30 }] })]);
    expect(r.filter((d) => d.plannerItemId)).toHaveLength(0);
  });

  it('warns about critical deadlines at T-7, T-3, T-1 18:00 and 09:00 on the day, as alarms', () => {
    const r = run([item({ id: 'c', kind: 'deadline', importance: 'critical', dueDate: at(2026, 11, 12, 23, 59).toISOString() })]);
    const mine = r.filter((d) => d.plannerItemId === 'c');
    expect(mine.map((d) => hhmm(d.fireAt))).toEqual(['11-5 18:00', '11-9 18:00', '11-11 18:00', '11-12 09:00']);
    expect(mine.every((d) => d.alarm)).toBe(true);
  });

  it('gives test moments an alarm 10 min before and at the time', () => {
    const r = run([item({ id: 't', kind: 'testMoment', start: at(2026, 11, 1, 23, 0).toISOString() })]);
    const mine = r.filter((d) => d.plannerItemId === 't');
    expect(mine.map((d) => [hhmm(d.fireAt), d.alarm])).toEqual([
      ['11-1 22:50', true],
      ['11-1 23:00', true],
    ]);
  });

  it('keeps quiet hours: non-alarms fold into the next morning plan', () => {
    const late = item({ id: 'q', title: 'Pack bag', start: at(2026, 10, 31, 23, 30).toISOString(), reminders: [{ offsetMinutes: 15 }] });
    const r = run([late]);
    expect(r.find((d) => d.plannerItemId === 'q')).toBeUndefined();
    const nov1 = r.find((d) => d.id === 'morning:2026-11-01')!;
    expect(hhmm(nov1.fireAt)).toBe('11-1 09:00'); // Sunday → 09:00
    expect(nov1.body).toContain('Also: Pack bag');
  });

  it('sends alarms inside quiet hours', () => {
    const r = run([item({ id: 'a', start: at(2026, 10, 31, 23, 30).toISOString(), reminders: [{ offsetMinutes: 15, alarm: true }] })]);
    expect(r.find((d) => d.plannerItemId === 'a')?.alarm).toBe(true);
  });

  it(`caps non-critical reminders at ${DAILY_CAP} a day and folds the rest`, () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      item({ id: `n${i}`, title: `Task ${i}`, start: at(2026, 11, 2, 9 + i).toISOString(), reminders: [{ offsetMinutes: 10 }] }),
    );
    const r = run(many);
    expect(r.filter((d) => d.plannerItemId)).toHaveLength(DAILY_CAP);
    const morning = r.find((d) => d.id === 'morning:2026-11-02')!;
    expect(hhmm(morning.fireAt)).toBe('11-2 07:00'); // Monday → school day
    expect(morning.title).toBe('Today: 9 planned');
  });

  it('only sends a morning plan on days with something planned, and the weekly review on Sundays', () => {
    const r = run([item({ start: at(2026, 11, 3, 16).toISOString() })]);
    expect(r.filter((d) => d.id.startsWith('morning:')).map((d) => d.id)).toEqual(['morning:2026-11-03']);
    expect(r.filter((d) => d.id.startsWith('review:')).map((d) => hhmm(d.fireAt))).toEqual(['11-1 19:00', '11-8 19:00']);
  });

  it('ignores done items and done occurrences', () => {
    const r = run([
      item({ id: 'd', done: true, start: at(2026, 11, 2, 10).toISOString(), reminders: [{ offsetMinutes: 10 }] }),
      item({
        id: 'rep',
        start: at(2026, 10, 31, 10).toISOString(),
        reminders: [{ offsetMinutes: 10 }],
        recurrence: { freq: 'daily', interval: 1 },
        completions: ['2026-10-31'],
      }),
    ]);
    expect(r.some((d) => d.plannerItemId === 'd')).toBe(false);
    const rep = r.filter((d) => d.plannerItemId === 'rep');
    expect(hhmm(rep[0].fireAt)).toBe('11-1 09:50');
    expect(rep[0].url).toBe('/dosym-os/planner/item/rep?on=2026-11-01');
  });

  it('is stable: same input, same ids', () => {
    const items = [item({ start: at(2026, 11, 2, 10).toISOString(), reminders: [{ offsetMinutes: 30 }] })];
    expect(run(items).map((d) => d.id)).toEqual(run(items).map((d) => d.id));
  });
});
