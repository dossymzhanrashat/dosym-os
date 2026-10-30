import type { PlannerItem } from './types';
import { anchorOf, entriesInRange, type PlannerEntry } from './entries';
import { DAY, MINUTE, almatyAt, almatyDayKey, almatyParts, fmtTime, inQuietHours } from './time';

/*
 * Turns planner items into reminder rows for the next 14 days (SPEC.md › Notification rules).
 * Pure: the same items and `now` always give the same rows, so every device computes the same set.
 *
 *   Morning plan        07:00 school days, 09:00 other days (only when something is planned)
 *   Important plan      the item's own offsets (Quick Add gives 30 min before by default)
 *   Critical deadline   T-7, T-3, T-1 at 18:00 and day-of 09:00, alarm
 *   Test moment         exact time + 10 min before, alarm
 *   Snooze              at snoozedUntil
 *   Weekly review       Sunday 19:00
 *   Quiet hours 22:30–06:30: only alarms. Daily cap 6 non-critical. Extras fold into the morning plan.
 */

export interface ReminderDraft {
  id: string;
  plannerItemId: string | null;
  fireAt: string;
  title: string;
  body: string;
  url: string;
  alarm: boolean;
}

export interface ReminderOptions {
  now: Date;
  /** App base path, e.g. "/dosym-os/". */
  base: string;
  /** Weekdays (0 = Sunday) that get the 07:00 morning plan. */
  schoolDays?: number[];
  days?: number;
}

export const DAILY_CAP = 6;
const DEFAULT_SCHOOL_DAYS = [1, 2, 3, 4, 5];

interface Candidate extends ReminderDraft {
  critical: boolean;
  entry: PlannerEntry;
}

const KIND_LABEL: Record<PlannerItem['kind'], string> = {
  task: 'Task',
  event: 'Plan',
  deadline: 'Deadline',
  review: 'Review',
  practice: 'Practice',
  testMoment: 'Test moment',
};

function itemUrl(base: string, e: PlannerEntry): string {
  if (e.sourceRef?.startsWith('/')) return `${base}${e.sourceRef.slice(1)}`; // generated item → its module page
  return `${base}planner/item/${e.baseId}${e.occurrence ? `?on=${e.occurrence}` : ''}`;
}

function relative(fireAt: Date, at: Date): string {
  const min = Math.round((at.getTime() - fireAt.getTime()) / MINUTE);
  if (min <= 0) return 'now';
  if (min < 60) return `in ${min} min`;
  if (min < 24 * 60) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / (24 * 60))} days`;
}

function candidatesFor(e: PlannerEntry, base: string): Candidate[] {
  const out: Candidate[] = [];
  const anchor = anchorOf(e);
  const critical = e.importance === 'critical';
  const add = (tag: string, fireAt: Date, alarm: boolean, body: string) =>
    out.push({
      id: `${e.id}:${tag}:${fireAt.toISOString()}`,
      plannerItemId: e.baseId,
      fireAt: fireAt.toISOString(),
      title: e.title,
      body,
      url: itemUrl(base, e),
      alarm,
      critical,
      entry: e,
    });

  if (anchor) {
    const at = new Date(anchor);
    const what = `${KIND_LABEL[e.kind]} at ${fmtTime(at)}`;
    for (const r of e.reminders) {
      const fire = new Date(at.getTime() - r.offsetMinutes * MINUTE);
      add(`r${r.offsetMinutes}`, fire, r.alarm ?? false, `${what} · ${relative(fire, at)}`);
    }
    if (e.kind === 'testMoment' && e.start) {
      add('t10', new Date(at.getTime() - 10 * MINUTE), true, `${what} · in 10 min`);
      add('t0', at, true, `${what} · now`);
    }
    if (critical) {
      const { y, m, d } = almatyParts(new Date(e.dueDate ?? anchor));
      for (const n of [7, 3, 1]) add(`d${n}`, almatyAt(y, m, d - n, 18 * 60), true, `Deadline in ${n} day${n > 1 ? 's' : ''}`);
      add('d0', almatyAt(y, m, d, 9 * 60), true, `Deadline today at ${fmtTime(e.dueDate ?? anchor)}`);
    }
  }
  if (e.snoozedUntil) add('snooze', new Date(e.snoozedUntil), critical, 'Snoozed reminder');
  return out;
}

export function computeReminders(items: PlannerItem[], opts: ReminderOptions): ReminderDraft[] {
  const { now, base } = opts;
  const days = opts.days ?? 14;
  const schoolDays = opts.schoolDays?.length ? opts.schoolDays : DEFAULT_SCHOOL_DAYS;
  const windowEnd = new Date(now.getTime() + days * DAY);

  // Critical deadlines up to a week past the window still send their T-7 inside it.
  const entries = entriesInRange(items, new Date(now.getTime() - DAY), new Date(windowEnd.getTime() + 8 * DAY)).filter((e) => !e.done);

  const seen = new Set<string>();
  const candidates = entries
    .flatMap((e) => candidatesFor(e, base))
    .filter((c) => {
      const t = new Date(c.fireAt);
      if (t <= now || t > windowEnd || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt));

  // Quiet hours and the daily cap: what does not go out folds into a morning plan.
  const folded = new Map<string, Candidate[]>(); // Almaty day key → items for that morning
  const fold = (key: string, c: Candidate) => folded.set(key, [...(folded.get(key) ?? []), c]);
  const perDay = new Map<string, number>();
  const kept: Candidate[] = [];
  for (const c of candidates) {
    const at = new Date(c.fireAt);
    if (!c.alarm && inQuietHours(at)) {
      // 22:30–24:00 → next morning; 00:00–06:30 → this morning.
      const morningOf = almatyParts(at).minutes >= 22 * 60 + 30 ? new Date(at.getTime() + DAY) : at;
      fold(almatyDayKey(morningOf), c);
      continue;
    }
    if (!c.alarm && !c.critical) {
      const key = almatyDayKey(at);
      const n = perDay.get(key) ?? 0;
      if (n >= DAILY_CAP) {
        fold(key, c);
        continue;
      }
      perDay.set(key, n + 1);
    }
    kept.push(c);
  }

  const drafts: ReminderDraft[] = kept.map(({ critical: _c, entry: _e, ...d }) => d);

  // Morning plan for each Almaty day in the window.
  const byDay = new Map<string, PlannerEntry[]>();
  for (const e of entries) {
    const a = anchorOf(e);
    if (!a) continue;
    const key = almatyDayKey(new Date(a));
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const { y, m, d } = almatyParts(now);
  for (let i = 0; i <= days; i++) {
    const noon = almatyAt(y, m, d + i, 12 * 60);
    const key = almatyDayKey(noon);
    const p = almatyParts(noon);
    const fireAt = almatyAt(p.y, p.m, p.d, schoolDays.includes(p.weekday) ? 7 * 60 : 9 * 60);
    const today = byDay.get(key) ?? [];
    const extra = (folded.get(key) ?? []).filter((c) => !today.some((e) => e.id === c.entry.id));

    if (p.weekday === 0) {
      const review = almatyAt(p.y, p.m, p.d, 19 * 60);
      if (review > now && review <= windowEnd) {
        drafts.push({
          id: `review:${key}`,
          plannerItemId: null,
          fireAt: review.toISOString(),
          title: 'Weekly review',
          body: 'Done vs slipped, and three focus goals for next week',
          url: `${base}planner/review`,
          alarm: false,
        });
      }
    }

    if (fireAt <= now || fireAt > windowEnd || (today.length === 0 && extra.length === 0)) continue;

    const lines = today.slice(0, 3).map((e) => (e.start ? `${fmtTime(e.start)} ${e.title}` : e.title));
    if (today.length > 3) lines.push(`+${today.length - 3} more`);
    if (extra.length) lines.push(`Also: ${[...new Set(extra.map((c) => c.title))].join(', ')}`);
    drafts.push({
      id: `morning:${key}`,
      plannerItemId: null,
      fireAt: fireAt.toISOString(),
      title: today.length ? `Today: ${today.length} planned` : 'Today',
      body: lines.join(' · '),
      url: base,
      alarm: false,
    });
  }

  return drafts.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
}
