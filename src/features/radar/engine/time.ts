import { almatyAt, almatyDayKey, DAY } from '../../../core/planner/time';
import type { FeedDeadline, RadarDeadline } from '../model/types';

/*
 * Deadline time zones (SPEC § 4.6): the stored date is the organiser's local time in `tz`; it is
 * shown and scheduled in Asia/Almaty. If converting moves it to another day, both dates are shown,
 * and "days left" counts to the earlier of the two days, so Dosym never sees a day more than he has.
 * A deadline with no time is 23:59 in its own zone, flagged "time not stated".
 */

type WithDate = Pick<FeedDeadline, 'date' | 'tz'>;

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock parts of an instant in a time zone. */
function partsIn(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

export const hasTime = (d: WithDate) => d.date.includes('T');

/** The instant of "YYYY-MM-DD[THH:mm]" in an IANA zone (no time → 23:59). */
export function zonedToUtc(local: string, tz: string): Date {
  const [day, time = '23:59'] = local.split('T');
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, h, min);
  let guess = wanted;
  // Two passes settle the zone offset, including on DST-change days.
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    guess += wanted - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  }
  return new Date(guess);
}

export const deadlineAt = (d: WithDate) => zonedToUtc(d.date, d.tz);

/** The deadline's day as the organiser writes it, and as it falls in Almaty; the earlier one counts. */
export function safeDayKey(d: WithDate): string {
  const source = d.date.slice(0, 10);
  const almaty = almatyDayKey(deadlineAt(d));
  return source < almaty ? source : almaty;
}

const keyNoon = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return almatyAt(y, m - 1, d, 12 * 60);
};

/** Whole days from today (Almaty) to the deadline's earlier day. 0 = due today, negative = passed. */
export function daysLeft(d: WithDate, now: Date): number {
  return Math.round((keyNoon(safeDayKey(d)).getTime() - keyNoon(almatyDayKey(now)).getTime()) / DAY);
}

export const isUpcoming = (d: WithDate, now: Date) => deadlineAt(d).getTime() > now.getTime();

const zoneShort = (at: Date, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortGeneric' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
};

const dayFmt = (tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' });
const monthDay = (at: Date, tz: string) => {
  // "Jan 7" (month first, like the spec's examples)
  const p = dayFmt(tz).formatToParts(at);
  return `${p.find((x) => x.type === 'month')?.value} ${p.find((x) => x.type === 'day')?.value}`;
};
const hhmm = (at: Date, tz: string) => {
  const p = partsIn(at, tz);
  return `${pad(p.h)}:${pad(p.min)}`;
};

/**
 * "Jan 7, 23:59 CT = Jan 8, 10:59 Almaty"; "Jan 15, 23:59 Almaty"; with no time stated:
 * "Jan 25 (time not stated) = Jan 26, 12:59 Almaty".
 */
export function describeDeadline(d: WithDate): string {
  const at = deadlineAt(d);
  const almaty = `${monthDay(at, 'Asia/Almaty')}, ${hhmm(at, 'Asia/Almaty')} Almaty`;
  if (d.tz === 'Asia/Almaty') return hasTime(d) ? almaty : `${monthDay(at, d.tz)} (time not stated)`;
  const source = hasTime(d) ? `${monthDay(at, d.tz)}, ${hhmm(at, d.tz)} ${zoneShort(at, d.tz)}` : `${monthDay(at, d.tz)} (time not stated)`;
  return `${source} = ${almaty}`;
}

/** Short label for chips and timelines: "Jan 7". */
export const shortDay = (d: WithDate) => monthDay(deadlineAt(d), d.tz);

/** The deadline's local date written back in the feed format, shifted by whole days. */
export function shiftLocal(local: string, days: number): string {
  const [day, time] = local.split('T');
  const [y, m, dd] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + days));
  const key = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  return time ? `${key}T${time}` : key;
}

/** Whole days between two Almaty day keys. */
export const dayDiff = (from: string, to: string) => Math.round((keyNoon(to).getTime() - keyNoon(from).getTime()) / DAY);
export const addDayKey = (key: string, n: number) => almatyDayKey(new Date(keyNoon(key).getTime() + n * DAY));

/** Today's main deadline status: "stale" once a confirmed date is 14+ days unchecked (SPEC § 4.4). */
export function effectiveStatus(d: Pick<RadarDeadline, 'status' | 'lastVerified'>, now: Date): RadarDeadline['status'] {
  if (d.status !== 'confirmed') return d.status;
  if (!d.lastVerified) return 'stale';
  return now.getTime() - Date.parse(d.lastVerified) > 14 * DAY ? 'stale' : 'confirmed';
}
