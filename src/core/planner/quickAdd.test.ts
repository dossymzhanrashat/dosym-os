import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd';

// Friday 30 Oct 2026, 15:00 in Almaty (tests run with TZ=Asia/Almaty).
const NOW = new Date(2026, 9, 30, 15, 0);
const local = (iso: string | Date | undefined) => {
  const d = new Date(iso!);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('parseQuickAdd', () => {
  it('reads the spec example', () => {
    const r = parseQuickAdd('IELTS mock Sat 10:00 2h !important', NOW);
    expect(r.title).toBe('IELTS mock');
    expect(local(r.start)).toBe('2026-10-31 10:00');
    expect(local(r.end)).toBe('2026-10-31 12:00');
    expect(r.kind).toBe('event');
    expect(r.importance).toBe('important');
    expect(r.matched).toContain('Important');
  });

  it('keeps plain text as an unscheduled task', () => {
    const r = parseQuickAdd('Buy salt for the brine test', NOW);
    expect(r).toMatchObject({ title: 'Buy salt for the brine test', kind: 'task', importance: 'normal', source: 'user' });
    expect(r.start).toBeUndefined();
    expect(r.dueDate).toBeUndefined();
  });

  it('puts a past time without a date on tomorrow', () => {
    expect(local(parseQuickAdd('Call coach 9:30', NOW).start)).toBe('2026-10-31 09:30');
    expect(local(parseQuickAdd('Call coach 18:00', NOW).start)).toBe('2026-10-30 18:00');
  });

  it('reads am/pm, "at", ranges and lengths', () => {
    expect(local(parseQuickAdd('Run 7pm', NOW).start)).toBe('2026-10-30 19:00');
    expect(local(parseQuickAdd('Run at 18 tomorrow', NOW).start)).toBe('2026-10-31 18:00');
    const range = parseQuickAdd('Lab 10:00-12:30 tomorrow', NOW);
    expect([local(range.start), local(range.end)]).toEqual(['2026-10-31 10:00', '2026-10-31 12:30']);
    const len = parseQuickAdd('Essay 16:00 1h30', NOW);
    expect(local(len.end)).toBe('2026-10-30 17:30');
    expect(local(parseQuickAdd('Read 16:00 45m', NOW).end)).toBe('2026-10-30 16:45');
  });

  it('does not read page ranges as times', () => {
    expect(parseQuickAdd('Read pages 10-12', NOW).title).toBe('Read pages 10-12');
  });

  it('reads dates in several forms', () => {
    expect(local(parseQuickAdd('Pay fee 12 Nov', NOW).dueDate)).toBe('2026-11-12 23:59');
    expect(local(parseQuickAdd('Pay fee Nov 12', NOW).dueDate)).toBe('2026-11-12 23:59');
    expect(local(parseQuickAdd('Pay fee 12.11', NOW).dueDate)).toBe('2026-11-12 23:59');
    expect(local(parseQuickAdd('Pay fee 2027-01-05', NOW).dueDate)).toBe('2027-1-5 23:59');
    expect(local(parseQuickAdd('Pay fee in 3 days', NOW).dueDate)).toBe('2026-11-2 23:59');
    // A day already past this year means next year.
    expect(local(parseQuickAdd('Renew 3 Jan', NOW).dueDate)).toBe('2027-1-3 23:59');
  });

  it('reads weekdays, with "next" skipping today', () => {
    expect(local(parseQuickAdd('Swim fri 18:00', NOW).start)).toBe('2026-10-30 18:00');
    expect(local(parseQuickAdd('Swim next fri 18:00', NOW).start)).toBe('2026-11-6 18:00');
    expect(local(parseQuickAdd('Swim thu 18:00', NOW).start)).toBe('2026-11-5 18:00');
    expect(local(parseQuickAdd('Swim monday', NOW).dueDate)).toBe('2026-11-2 23:59');
  });

  it('marks deadlines, critical items and modules', () => {
    const r = parseQuickAdd('Conrad deadline 12 Nov !! #frostpure', NOW);
    expect(r).toMatchObject({ title: 'Conrad deadline', kind: 'deadline', importance: 'critical', source: 'frostpure' });
    const due = parseQuickAdd('Essay due Sat 18:00', NOW);
    expect(due.title).toBe('Essay');
    expect(due.kind).toBe('deadline');
    expect(local(due.dueDate)).toBe('2026-10-31 18:00');
    expect(due.start).toBeUndefined();
  });

  it('reads repeats', () => {
    expect(parseQuickAdd('Vocab daily 20:00', NOW).recurrence).toEqual({ freq: 'daily', interval: 1 });
    expect(parseQuickAdd('Report every 2 weeks', NOW).recurrence).toEqual({ freq: 'weekly', interval: 2 });
    const gym = parseQuickAdd('Gym every mon, wed 17:00', NOW);
    expect(gym.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 3] });
    expect(local(gym.start)).toBe('2026-11-2 17:00');
    expect(gym.title).toBe('Gym');
  });

  it('does not eat names that look like words it knows', () => {
    expect(parseQuickAdd('Message Tom about kit', NOW).title).toBe('Message Tom about kit');
  });
});
