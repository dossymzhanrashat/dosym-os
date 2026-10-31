import type { ReminderDraft } from '../../../core/planner/reminderEngine';
import { almatyAt } from '../../../core/planner/time';
import type { PlannerItem, PlannerItemProvider } from '../../../core/planner/types';
import { planTaskItemId } from '../engine/plan';
import { radarReminders } from '../engine/reminders';
import { deadlineAt, describeDeadline } from '../engine/time';
import type { Opportunity } from '../model/types';
import { oppsTable } from './db';

/*
 * RadarPlannerProvider (SPEC § 4.6): every deadline of a Watching, Preparing or Submitted item
 * (Submitted: event and decision only) and every backward-planned step, as generated Planner
 * items. Steps are due 08:00 Almaty with a reminder then. Deadline reminders come from the Radar
 * ladder below, so the Planner's own critical-deadline ladder is not added on top.
 */

const ACTIVE = new Set(['watching', 'preparing', 'submitted']);
const at0800 = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return almatyAt(y, m - 1, d, 8 * 60).toISOString();
};

async function activeOpps(): Promise<Opportunity[]> {
  return (await oppsTable.toArray()).filter((o) => !o.deletedAt && !o.cancelled && ACTIVE.has(o.status));
}

export const radarPlannerProvider: PlannerItemProvider = {
  async plannerItems(range) {
    const items: PlannerItem[] = [];
    for (const o of await activeOpps()) {
      for (const d of o.deadlines) {
        if (o.status === 'submitted' && d.type !== 'event' && d.type !== 'decision') continue;
        const due = deadlineAt(d);
        if (due < range.start || due >= range.end) continue;
        items.push({
          id: `gen:radar:${o.id}:${d.id}`,
          title: `${o.name} · ${d.type}${d.status === 'confirmed' ? '' : ' (est.)'}`,
          notes: describeDeadline(d),
          dueDate: due.toISOString(),
          kind: d.type === 'event' ? 'event' : 'deadline',
          source: 'radar',
          sourceRef: `/radar/o/${encodeURIComponent(o.id)}`,
          priority: o.status === 'preparing' ? 3 : 1,
          importance: o.status === 'preparing' ? 'important' : 'normal',
          reminders: [],
          done: false,
          updatedAt: o.updatedAt,
        });
      }
      for (const t of o.plan?.tasks ?? []) {
        const due = at0800(t.day);
        if (new Date(due) < range.start || new Date(due) >= range.end) continue;
        items.push({
          id: planTaskItemId(o.id, t.id),
          title: `${t.title} · ${o.name}`,
          dueDate: due,
          kind: 'task',
          source: 'radar',
          sourceRef: `/radar/o/${encodeURIComponent(o.id)}`,
          priority: 2,
          importance: 'important',
          reminders: [{ offsetMinutes: 0 }],
          done: false,
          updatedAt: o.updatedAt,
        });
      }
    }
    return items;
  },
};

export async function radarReminderSource(now: Date, days: number): Promise<ReminderDraft[]> {
  return radarReminders(await activeOpps(), now, days, import.meta.env.BASE_URL);
}
