import type { Importance, PlannerKind, PlannerSource, Recurrence } from './types';
import { addDays, atMinutes, fmtHHMM, startOfDay } from './time';

/*
 * Quick Add natural language, parsed in the browser (SPEC.md › Pages › Quick Add).
 * Example: "IELTS mock Sat 10:00 2h !important" → Saturday 10:00–12:00, important.
 * Understood pieces are removed from the title and listed in `matched` (shown as chips).
 *
 *   dates     today · tomorrow/tmr · mon…sun · next fri · 12 Nov · Nov 12 · 12.11 · 12/11 · 2026-11-12 · in 3 days
 *   times     10:00 · 9am · 7:30pm · at 18 · 10:00-12:00
 *   length    2h · 90m · 1h30 · 1.5h
 *   flags     ! or !important · !! or !critical · #english #frostpure #tagylym #radar
 *   kind      "deadline" (kept in the title) or "due" (removed) → deadline
 *   repeat    daily · weekly · monthly · every day · every 2 weeks · every mon,wed
 */

export interface QuickAddResult {
  title: string;
  start?: Date;
  end?: Date;
  dueDate?: Date;
  kind: PlannerKind;
  importance: Importance;
  source: PlannerSource;
  recurrence?: Recurrence;
  matched: string[];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAY_RE = '(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)';
const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const weekdayOf = (word: string) => WEEKDAY_INDEX[word.toLowerCase().slice(0, 3)];

const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Clock time from parts like ("7", "30", "pm"); undefined when out of range. */
function toMinutes(h: string, m: string | undefined, ampm: string | undefined): number | undefined {
  let hour = Number(h);
  const min = m ? Number(m) : 0;
  if (ampm) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (hour > 24 || min > 59) return undefined;
  return Math.min(hour * 60 + min, 24 * 60);
}

/** Next day on or after `from` (strictly after when `skipToday`) with that weekday. */
function nextWeekday(from: Date, weekday: number, skipToday = false): Date {
  let diff = (weekday - from.getDay() + 7) % 7;
  if (diff === 0 && skipToday) diff = 7;
  return addDays(startOfDay(from), diff);
}

/** Day + month without a year: this year, or next year if it already passed. */
function upcoming(now: Date, month: number, day: number, year?: number): Date | undefined {
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
  let y = year ?? now.getFullYear();
  if (y < 100) y += 2000;
  let d = new Date(y, month, day);
  if (d.getMonth() !== month) return undefined; // e.g. 31 Feb
  if (year === undefined && d < startOfDay(now)) d = new Date(y + 1, month, day);
  return d;
}

export function parseQuickAdd(input: string, now = new Date()): QuickAddResult {
  let text = ` ${input} `;
  const matched: string[] = [];
  /** Finds the first match, removes it from the text and returns its groups. */
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(text);
    if (m) text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    return m;
  };

  // Importance
  let importance: Importance = 'normal';
  if (take(/\s(?:!!|!critical|!crit)(?=\s)/i)) importance = 'critical';
  else if (take(/\s(?:!important|!imp|!)(?=\s)/i)) importance = 'important';
  if (importance !== 'normal') matched.push(importance === 'critical' ? 'Critical' : 'Important');

  // Module
  let source: PlannerSource = 'user';
  const mod = take(/\s#(english|frostpure|tagylym|radar)(?=\s)/i);
  if (mod) {
    source = mod[1].toLowerCase() as PlannerSource;
    matched.push(mod[1][0].toUpperCase() + mod[1].slice(1).toLowerCase());
  }

  // Repeat
  let recurrence: Recurrence | undefined;
  const everyDays = take(new RegExp(`\\severy\\s+(${WEEKDAY_RE}(?:\\s*(?:,|and|&)\\s*${WEEKDAY_RE})*)(?=\\s)`, 'i'));
  if (everyDays) {
    const days = [...everyDays[1].matchAll(new RegExp(WEEKDAY_RE, 'gi'))].map((m) => weekdayOf(m[0]));
    recurrence = { freq: 'weekly', interval: 1, byWeekday: [...new Set(days)].sort() };
  } else {
    const every = take(/\s(?:every\s+(?:(\d+|other)\s+)?(day|week|month)s?|(daily|weekly|monthly))(?=\s)/i);
    if (every) {
      const unit = (every[2] ?? every[3]).toLowerCase();
      const freq = unit.startsWith('d') ? 'daily' : unit.startsWith('w') ? 'weekly' : 'monthly';
      const n = every[1]?.toLowerCase() === 'other' ? 2 : Number(every[1] ?? 1);
      recurrence = { freq, interval: Math.max(1, n) };
    }
  }
  if (recurrence) {
    const names = recurrence.byWeekday?.map((d) => Object.keys(WEEKDAY_INDEX)[d][0].toUpperCase() + Object.keys(WEEKDAY_INDEX)[d].slice(1));
    const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[recurrence.freq];
    matched.push(names ? `Every ${names.join(', ')}` : recurrence.interval > 1 ? `Every ${recurrence.interval} ${unit}s` : `Every ${unit}`);
  }

  // Time range, then a single time
  let startMin: number | undefined;
  let endMin: number | undefined;
  // Needs a colon or am/pm on one side, so "pages 10-12" stays in the title.
  const rangeRe = /\s(?:from\s+|at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s)/i;
  const r = rangeRe.exec(text);
  if (r && (r[2] || r[3] || r[5] || r[6])) {
    take(rangeRe);
    startMin = toMinutes(r[1], r[2], r[3] ?? r[6]);
    endMin = toMinutes(r[4], r[5], r[6]);
  }
  if (startMin === undefined) {
    const t =
      take(/\s(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?(?=\s)/i) ??
      take(/\s(?:at\s+)?(\d{1,2})()\s*(am|pm)(?=\s)/i) ??
      take(/\sat\s+(\d{1,2})()()(?=\s)/i);
    if (t) startMin = toMinutes(t[1], t[2] || undefined, t[3] || undefined);
  }

  // Length
  let duration: number | undefined;
  const hours = take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?(?:\s*(\d+)\s*m(?:in)?|(\d{2}))?(?=\s)/i);
  if (hours) duration = Math.round(Number(hours[1]) * 60) + Number(hours[2] ?? hours[3] ?? 0);
  else {
    const mins = take(/\s(?:for\s+)?(\d+)\s*m(?:in(?:ute)?s?)?(?=\s)/i);
    if (mins) duration = Number(mins[1]);
  }

  // Deadline words
  let kind: PlannerKind | undefined;
  if (/\sdeadline(?=\s)/i.test(text)) kind = 'deadline';
  if (take(/\sdue(?=\s)/i)) kind = 'deadline';

  // Date
  let date: Date | undefined;
  const pre = '\\s(?:on\\s+|by\\s+)?';
  let m: RegExpExecArray | null;
  if ((m = take(/\s(?:on\s+|by\s+)?(\d{4})-(\d{2})-(\d{2})(?=\s)/))) date = upcoming(now, Number(m[2]) - 1, Number(m[3]), Number(m[1]));
  else if ((m = take(/\s(?:on\s+|by\s+)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/)))
    date = upcoming(now, Number(m[2]) - 1, Number(m[1]), m[3] ? Number(m[3]) : undefined);
  else if ((m = take(new RegExp(`${pre}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?=\\s)`, 'i'))))
    date = upcoming(now, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), Number(m[1]));
  else if ((m = take(new RegExp(`${pre}${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'i'))))
    date = upcoming(now, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), Number(m[2]));
  else if (take(/\s(?:today)(?=\s)/i)) date = startOfDay(now);
  else if (take(/\s(?:tomorrow|tmrw?)(?=\s)/i)) date = addDays(startOfDay(now), 1);
  else if ((m = take(/\sin\s+(\d+)\s+(day|week)s?(?=\s)/i))) date = addDays(startOfDay(now), Number(m[1]) * (m[2].toLowerCase() === 'week' ? 7 : 1));
  else if ((m = take(new RegExp(`${pre}(next\\s+)?${WEEKDAY_RE}(?=\\s)`, 'i')))) date = nextWeekday(now, weekdayOf(m[2]), !!m[1]);

  // A weekly repeat with no date starts on its first matching day.
  if (!date && recurrence?.byWeekday) {
    date = recurrence.byWeekday.map((d) => nextWeekday(now, d)).sort((a, b) => a.getTime() - b.getTime())[0];
  }

  const title = text.replace(/\s+/g, ' ').trim().replace(/^[,.;:–-]\s*|\s*[,.;:–-]$/g, '') || 'Untitled';
  const result: QuickAddResult = { title, kind: kind ?? 'task', importance, source, recurrence, matched };

  if (startMin !== undefined) {
    const day = date ?? (startMin > now.getHours() * 60 + now.getMinutes() ? startOfDay(now) : addDays(startOfDay(now), 1));
    const start = atMinutes(day, startMin);
    let end = endMin !== undefined ? atMinutes(day, endMin) : new Date(start.getTime() + (duration ?? 60) * 60_000);
    if (end <= start) end = addDays(end, 1);
    matched.unshift(dayLabel.format(start), `${fmtHHMM(startMin)}–${fmtHHMM(end.getHours() * 60 + end.getMinutes())}`);
    if (kind === 'deadline') result.dueDate = start;
    else {
      result.kind = 'event';
      result.start = start;
      result.end = end;
    }
  } else if (date) {
    result.dueDate = atMinutes(date, 23 * 60 + 59);
    matched.unshift(dayLabel.format(date));
  }
  if (result.kind === 'deadline') matched.push('Deadline');
  return result;
}
