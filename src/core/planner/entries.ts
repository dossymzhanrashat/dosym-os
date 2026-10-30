import type { PlannerItem } from './types';
import { addDays, dayKey, daysBetween, fromDayKey, startOfDay, startOfWeek } from './time';

/**
 * What the calendar shows: a stored item, or one occurrence of a repeating item. Occurrences get
 * the id "<item id>@<YYYY-MM-DD>" and point back to the stored item through baseId.
 */
export interface PlannerEntry extends PlannerItem {
  baseId: string;
  occurrence?: string; // YYYY-MM-DD of this occurrence
}

/** The time an item hangs on: its start, or else its due date. */
export function anchorOf(item: Pick<PlannerItem, 'start' | 'dueDate'>): string | undefined {
  return item.start ?? item.dueDate;
}

function matchesRule(item: PlannerItem, anchorDay: Date, day: Date): boolean {
  const r = item.recurrence!;
  const interval = Math.max(1, r.interval);
  switch (r.freq) {
    case 'daily':
      return daysBetween(anchorDay, day) % interval === 0;
    case 'weekly': {
      const weeks = Math.round(daysBetween(startOfWeek(anchorDay), startOfWeek(day)) / 7);
      const days = r.byWeekday?.length ? r.byWeekday : [anchorDay.getDay()];
      return weeks % interval === 0 && days.includes(day.getDay());
    }
    case 'monthly': {
      const months = (day.getFullYear() - anchorDay.getFullYear()) * 12 + day.getMonth() - anchorDay.getMonth();
      return months % interval === 0 && day.getDate() === anchorDay.getDate();
    }
  }
}

/** Moves an ISO time by whole days, keeping the local clock time. */
function shiftDays(iso: string | undefined, days: number): string | undefined {
  return iso === undefined ? undefined : addDays(new Date(iso), days).toISOString();
}

/** Entries of one item that touch [rangeStart, rangeEnd). Items with no start or due date have none. */
export function expandItem(item: PlannerItem, rangeStart: Date, rangeEnd: Date): PlannerEntry[] {
  if (item.deletedAt) return [];
  const anchor = anchorOf(item);
  if (!anchor) return [];
  const anchorDate = new Date(anchor);

  if (!item.recurrence) {
    const from = anchorDate.getTime();
    const to = item.end ? new Date(item.end).getTime() : from;
    const touches = from < rangeEnd.getTime() && (to > rangeStart.getTime() || from >= rangeStart.getTime());
    return touches ? [{ ...item, baseId: item.id }] : [];
  }

  const anchorDay = startOfDay(anchorDate);
  const until = item.recurrence.until ? new Date(item.recurrence.until) : null;
  const out: PlannerEntry[] = [];
  let day = startOfDay(rangeStart) < anchorDay ? anchorDay : startOfDay(rangeStart);
  for (; day < rangeEnd; day = addDays(day, 1)) {
    if (until && day > until) break;
    const key = dayKey(day);
    if (item.exceptions?.includes(key) || !matchesRule(item, anchorDay, day)) continue;
    const shift = daysBetween(anchorDay, day);
    const done = item.completions?.includes(key) ?? false;
    out.push({
      ...item,
      id: `${item.id}@${key}`,
      baseId: item.id,
      occurrence: key,
      start: shiftDays(item.start, shift),
      end: shiftDays(item.end, shift),
      dueDate: shiftDays(item.dueDate, shift),
      done,
      completedAt: done ? item.completedAt : undefined,
      // A snooze belongs to the occurrence on the day it was snoozed to.
      snoozedUntil: item.snoozedUntil && dayKey(new Date(item.snoozedUntil)) === key ? item.snoozedUntil : undefined,
    });
  }
  return out;
}

export function entriesInRange(items: PlannerItem[], rangeStart: Date, rangeEnd: Date): PlannerEntry[] {
  return items
    .flatMap((i) => expandItem(i, rangeStart, rangeEnd))
    .sort((a, b) => (anchorOf(a) ?? '').localeCompare(anchorOf(b) ?? ''));
}

/** Day key an entry belongs to in the calendar. */
export function entryDayKey(e: PlannerEntry): string | undefined {
  const a = anchorOf(e);
  return a ? dayKey(new Date(a)) : undefined;
}

export function durationMinutes(e: Pick<PlannerItem, 'start' | 'end'>): number {
  if (!e.start || !e.end) return 0;
  return Math.max(0, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60_000);
}

/** Entry id → the stored item and (for repeats) the occurrence day. */
export function splitEntryId(id: string): { baseId: string; occurrence?: string } {
  const [baseId, occurrence] = id.split('@');
  return { baseId, occurrence };
}

/** Rebuilds the entry for a given occurrence day ("?on=YYYY-MM-DD" on the item page). */
export function entryFor(item: PlannerItem, occurrence?: string): PlannerEntry | undefined {
  if (!item.recurrence || !occurrence) return { ...item, baseId: item.id };
  const day = fromDayKey(occurrence);
  return expandItem(item, day, addDays(day, 1))[0];
}
