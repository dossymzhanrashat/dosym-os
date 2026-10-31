import type { ReminderDraft } from '../../../core/planner/reminderEngine';
import { DAY, almatyAt, almatyParts, parseHHMM } from '../../../core/planner/time';
import type { PlannerItem, PlannerItemProvider } from '../../../core/planner/types';
import { ADMIN_DEADLINES, MOCKS, newCap } from '../srs/phase';
import { forecast } from '../srs/queue';
import { studyDay } from '../srs/studyDay';
import { cardsTable, logsTable, notesTable, useItTable } from './db';
import { loadEnglishSettings, medianSeconds, minimumDayDays, todayPlan, type EnglishData } from './store';

/*
 * EnglishPlannerProvider (SPEC § 10.4): a daily "Vocab 15 min" item (done when the minimum day is
 * met), the mock weeks, the 31 Jan / 1 Mar admin deadlines, the test day, and a Sunday "Use-it
 * feedback" item while sentences wait for Claude. Quota sessions come with the Practice engine.
 * Plus the morning review notification (SPEC § 10.3): 07:15, only when cards are due, never in
 * quiet hours (22:30–07:00) or school hours on weekdays, skipped once today's minimum day is done.
 */

const FIXED_UPDATED = '2026-10-26T00:00:00.000Z';

/** Local date at a clock time (the user lives in Almaty; the Planner shows device time). */
const localAt = (key: string, hhmm: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(parseHHMM(hhmm) / 60), parseHHMM(hhmm) % 60).toISOString();
};

const base = (id: string, title: string, fields: Partial<PlannerItem>): PlannerItem => ({
  id: `gen:english:${id}`,
  title,
  kind: 'deadline',
  source: 'english',
  sourceRef: '/english',
  priority: 1,
  importance: 'important',
  reminders: [],
  done: false,
  updatedAt: FIXED_UPDATED,
  ...fields,
});

export const englishPlannerProvider: PlannerItemProvider = {
  async plannerItems(range) {
    const settings = await loadEnglishSettings();
    const logs = (await logsTable.toArray()).filter((l) => !l.deletedAt);
    const done = await minimumDayDays(logs);
    const items: PlannerItem[] = [
      base('vocab', 'Vocab 15 min', {
        kind: 'review',
        sourceRef: '/english/review',
        importance: 'normal',
        dueDate: localAt('2026-10-26', '23:59'),
        recurrence: { freq: 'daily', interval: 1 },
        completions: [...done],
      }),
      ...MOCKS.map((m) =>
        base(`mock:${m.date}`, m.target === 'diagnostic' ? 'IELTS mock week (diagnostic)' : `IELTS mock week · target ${m.target}`, {
          dueDate: localAt(m.date, '23:59'),
        }),
      ),
      ...ADMIN_DEADLINES.map((a) => base(`admin:${a.id}`, a.title, { importance: 'critical', priority: 3, dueDate: localAt(a.date, '23:59') })),
      base('test', 'IELTS test day', { importance: 'critical', priority: 3, dueDate: localAt(settings.testDate, '09:00') }),
    ];
    // Weekly Use-it batch through the Claude Bridge, on Sunday with the weekly review, only when sentences wait.
    const waiting = (await useItTable.toArray()).filter((a) => !a.deletedAt && !a.feedback).length;
    if (waiting) {
      const p = almatyParts(new Date());
      const sunday = studyDay(almatyAt(p.y, p.m, p.d + ((7 - p.weekday) % 7), 12 * 60));
      items.push(
        base(`use-it:${sunday}`, `Use-it feedback from Claude · ${waiting} ${waiting === 1 ? 'sentence' : 'sentences'}`, {
          kind: 'review',
          sourceRef: '/english/use-it',
          importance: 'normal',
          dueDate: localAt(sunday, '18:00'),
        }),
      );
    }
    return items.filter((i) => i.recurrence || (new Date(i.dueDate!) >= range.start && new Date(i.dueDate!) < range.end));
  },
};

// ---------- Morning review notification ----------

const QUIET_START = 22 * 60 + 30;
const QUIET_END = 7 * 60;

/** Moves a time out of quiet hours and weekday school hours (Almaty) to the next allowed minute. */
export function nextAllowed(at: Date, school: { start: string; end: string }): Date {
  let t = at;
  for (let i = 0; i < 4; i++) {
    const p = almatyParts(t);
    if (p.minutes >= QUIET_START) t = almatyAt(p.y, p.m, p.d + 1, QUIET_END);
    else if (p.minutes < QUIET_END) t = almatyAt(p.y, p.m, p.d, QUIET_END);
    else if (p.weekday >= 1 && p.weekday <= 5 && p.minutes >= parseHHMM(school.start) && p.minutes < parseHHMM(school.end))
      t = almatyAt(p.y, p.m, p.d, parseHHMM(school.end));
    else return t;
  }
  return t;
}

export async function englishReminders(now: Date, days: number): Promise<ReminderDraft[]> {
  const settings = await loadEnglishSettings();
  const notes = (await notesTable.toArray()).filter((n) => !n.deletedAt);
  const cards = (await cardsTable.toArray()).filter((c) => !c.deletedAt);
  const logs = (await logsTable.toArray()).filter((l) => !l.deletedAt);
  if (!cards.length) return [];
  const noteMap = new Map(notes.map((n) => [n.id, n]));
  const data: EnglishData = { loaded: true, notes, cards, logs, noteMap, cardsByNote: new Map() };
  const doneDays = await minimumDayDays(logs);
  const fc = forecast(cards, now, days + 1);
  const secs = medianSeconds(logs);
  const out: ReminderDraft[] = [];
  const { y, m, d } = almatyParts(now);

  for (let i = 0; i <= days; i++) {
    const fire = nextAllowed(almatyAt(y, m, d + i, parseHHMM(settings.morningReview)), settings.schoolQuiet);
    if (fire <= now || fire.getTime() > now.getTime() + days * DAY) continue;
    const day = studyDay(fire);
    if (doneDays.has(day)) continue; // smart skip: minimum day already done
    const due =
      day === studyDay(now)
        ? todayPlan(data, settings, now).queue.order.length
        : (fc.find((f) => f.day === day)?.count ?? 0) + newCap(day, 0, settings.newPerDay).cap;
    if (due <= 0) continue;
    out.push({
      id: `english:review:${day}`,
      plannerItemId: null,
      fireAt: fire.toISOString(),
      title: 'English reviews',
      body: `${due} due · ~${Math.max(1, Math.round((due * secs) / 60))} min`,
      url: `${import.meta.env.BASE_URL}english/review`,
      alarm: false,
    });
  }
  return out;
}
