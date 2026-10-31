import type { ReminderDraft } from '../../../core/planner/reminderEngine';
import { almatyAt, MINUTE } from '../../../core/planner/time';
import type { PlannerItem, PlannerItemProvider } from '../../../core/planner/types';
import { deadlineAt } from '../../radar/engine/time';
import type { Run } from '../model/types';
import { bomTable, compsTable, runsTable } from './db';
import { PHASES } from './seed';

/*
 * FrostPurePlannerProvider (SPEC Module 2 › Planner integration): competition milestones and the
 * Conrad dates Radar does not already hold, run test moments (kind testMoment: the Planner sends
 * them at the exact time with a 10-minute warning), and parcels due (09:00 on the expected day).
 * Run-sheet timers go out as their own push reminder when they end.
 */

const FIXED = '2026-11-01T00:00:00.000Z';
/** Conrad's Activation, Innovation and Summit dates already come from Radar ("conrad-2026-27"). */
const IN_RADAR = new Set(['comp-conrad-2026-27:activation', 'comp-conrad-2026-27:innovation', 'comp-conrad-2026-27:summit']);

const at = (key: string, minutes: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return almatyAt(y, m - 1, d, minutes).toISOString();
};

const item = (id: string, title: string, fields: Partial<PlannerItem>): PlannerItem => ({
  id: `gen:frostpure:${id}`,
  title,
  kind: 'task',
  source: 'frostpure',
  sourceRef: '/frostpure',
  priority: 2,
  importance: 'important',
  reminders: [],
  done: false,
  updatedAt: FIXED,
  ...fields,
});

export function momentTime(run: Run, m: Run['moments'][number]): Date | undefined {
  if (m.kind === 'at' && m.at) return new Date(m.at);
  if (m.kind === 'afterStart' && run.startedAt && m.afterMin !== undefined) return new Date(Date.parse(run.startedAt) + m.afterMin * MINUTE);
  return undefined;
}

export const frostPlannerProvider: PlannerItemProvider = {
  async plannerItems(range) {
    const out: PlannerItem[] = [];
    const inRange = (iso: string) => new Date(iso) >= range.start && new Date(iso) < range.end;

    for (const c of await compsTable.toArray()) {
      if (c.deletedAt || c.status === 'watching') continue;
      for (const ms of c.milestones) {
        const due = at(ms.day, 9 * 60);
        if (inRange(due))
          out.push(item(`ms:${c.id}:${ms.id}`, `${ms.title} · ${c.name}`, { dueDate: due, done: !!ms.doneAt, completedAt: ms.doneAt, sourceRef: `/frostpure/compete/${encodeURIComponent(c.id)}`, reminders: [{ offsetMinutes: 0 }] }));
      }
      for (const p of c.phases) {
        if (!p.deadline || IN_RADAR.has(`${c.id}:${p.id}`)) continue;
        const due = deadlineAt(p.deadline).toISOString();
        if (inRange(due)) out.push(item(`phase:${c.id}:${p.id}`, `${c.name} · ${p.name}`, { kind: 'event', dueDate: due, start: due, sourceRef: `/frostpure/compete/${encodeURIComponent(c.id)}`, priority: 1, importance: 'normal' }));
      }
    }

    for (const r of await runsTable.toArray()) {
      if (r.deletedAt || r.status === 'done' || r.status === 'aborted') continue;
      for (const m of r.moments) {
        const when = momentTime(r, m);
        if (!when || !inRange(when.toISOString())) continue;
        out.push(
          item(`moment:${r.id}:${m.id}`, `${m.title} · ${r.name}`, {
            kind: 'testMoment',
            start: when.toISOString(),
            notes: m.instruction,
            done: !!m.doneAt,
            completedAt: m.doneAt,
            sourceRef: `/frostpure/run/${r.id}`,
            priority: 3,
          }),
        );
      }
    }

    for (const b of await bomTable.toArray()) {
      if (b.deletedAt || b.status !== 'ordered' || !b.expectedAt) continue;
      const due = at(b.expectedAt, 9 * 60);
      if (inRange(due)) out.push(item(`parcel:${b.id}`, `Parcel due: ${b.name}`, { dueDate: due, sourceRef: '/frostpure/build', importance: 'normal', priority: 1, reminders: [{ offsetMinutes: 0 }] }));
    }
    return out;
  },
};

/** A push when a run-sheet timer ends, even with the page closed. */
export async function frostReminderSource(now: Date, days: number): Promise<ReminderDraft[]> {
  const end = now.getTime() + days * 86_400_000;
  const out: ReminderDraft[] = [];
  for (const r of await runsTable.toArray()) {
    if (r.deletedAt || r.status !== 'running') continue;
    for (const p of r.phases) {
      if (!p.timerEndsAt || p.doneAt) continue;
      const t = Date.parse(p.timerEndsAt);
      if (t <= now.getTime() || t > end) continue;
      out.push({
        id: `frostpure:timer:${r.id}:${p.id}:${p.timerEndsAt}`,
        plannerItemId: null,
        fireAt: p.timerEndsAt,
        title: `${PHASES.find((x) => x.id === p.id)?.label ?? p.id} timer done`,
        body: r.name,
        url: `${import.meta.env.BASE_URL}frostpure/run/${r.id}`,
        alarm: true,
      });
    }
  }
  return out;
}
