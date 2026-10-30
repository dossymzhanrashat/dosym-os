import { almatyAt, almatyDayKey, almatyParts, HOUR } from '../../../core/planner/time';

// English "days" run 04:00 → 04:00 Asia/Almaty, so a review at 01:30 counts for the day before.

export const DAY_BOUNDARY_MIN = 4 * 60;

/** Study day of an instant, as "YYYY-MM-DD". */
export function studyDay(at: Date): string {
  return almatyDayKey(new Date(at.getTime() - DAY_BOUNDARY_MIN * 60_000));
}

/** 04:00 Almaty that starts the study day containing `at`. */
export function studyDayStart(at: Date): Date {
  const p = almatyParts(new Date(at.getTime() - DAY_BOUNDARY_MIN * 60_000));
  return almatyAt(p.y, p.m, p.d, DAY_BOUNDARY_MIN);
}

/** 04:00 Almaty that ends the study day containing `at` (= start of tomorrow). */
export function studyDayEnd(at: Date): Date {
  return new Date(studyDayStart(at).getTime() + 24 * HOUR);
}
