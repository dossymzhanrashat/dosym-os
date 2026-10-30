// Date helpers. Calendar pages use the device's local time (the user lives in Almaty); the
// reminder rules (quiet hours, 07:00 morning plan, 18:00 deadline warnings) use Asia/Almaty
// explicitly so they stay right even on a laptop set to another zone.

/** Kazakhstan has one zone, UTC+5, with no daylight saving (since 1 March 2024). */
export const ALMATY_OFFSET_MIN = 300;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a "YYYY-MM-DD" key. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday of the week containing d (weeks start on Monday in Kazakhstan). */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** Whole calendar days from a to b (both taken at local midnight; DST-safe). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Local date at the given minute of the day. */
export function atMinutes(day: Date, minutes: number): Date {
  const r = startOfDay(day);
  r.setMinutes(minutes);
  return r;
}

/** "08:30" → 510. */
export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fmtHHMM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtTime = (iso: string | Date) => timeFmt.format(new Date(iso));

// ---------- Asia/Almaty ----------

export interface AlmatyParts {
  y: number;
  m: number; // 0–11
  d: number;
  weekday: number; // 0 = Sunday
  minutes: number; // minute of the day
}

export function almatyParts(at: Date): AlmatyParts {
  const t = new Date(at.getTime() + ALMATY_OFFSET_MIN * MINUTE);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth(),
    d: t.getUTCDate(),
    weekday: t.getUTCDay(),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

/** The instant of an Almaty wall-clock time. Day overflow (d = 32, d = 0) rolls over. */
export function almatyAt(y: number, m: number, d: number, minutes: number): Date {
  return new Date(Date.UTC(y, m, d, 0, minutes) - ALMATY_OFFSET_MIN * MINUTE);
}

export function almatyDayKey(at: Date): string {
  const p = almatyParts(at);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
}

/** Quiet hours 22:30–06:30 Asia/Almaty. */
export function inQuietHours(at: Date): boolean {
  const { minutes } = almatyParts(at);
  return minutes >= 22 * 60 + 30 || minutes < 6 * 60 + 30;
}
