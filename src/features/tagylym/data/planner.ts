import { almatyAt } from '../../../core/planner/time';
import type { PlannerItem, PlannerItemProvider } from '../../../core/planner/types';
import { stageTitle } from '../engine/pipeline';
import { optionsTable, projectsTable } from './db';

/*
 * KitStudioPlannerProvider (SPEC Module 3): each checklist item of the active project is a task
 * due 09:00 Almaty on its day (reminder then), and each stage end is a milestone with a reminder
 * two days before. Every item links back to its stage on the pipeline board.
 */

const at = (key: string, minutes: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return almatyAt(y, m - 1, d, minutes).toISOString();
};

export const tagylymPlannerProvider: PlannerItemProvider = {
  async plannerItems(range) {
    const out: PlannerItem[] = [];
    const inRange = (iso: string) => new Date(iso) >= range.start && new Date(iso) < range.end;
    for (const p of await projectsTable.toArray()) {
      if (p.deletedAt || p.archived) continue;
      const kit = (await optionsTable.get(p.optionId))?.name ?? 'Kit';
      for (const s of p.stages) {
        const link = `/tagylym/pipeline?stage=${s.kind}`;
        for (const c of s.checklist) {
          const due = at(c.due, 9 * 60);
          if (!inRange(due)) continue;
          out.push({
            id: `gen:tagylym:${p.id}:${s.kind}:${c.id}`,
            title: `${kit} · ${c.text}`,
            notes: `${stageTitle(s.kind)} stage`,
            dueDate: due,
            kind: 'task',
            source: 'tagylym',
            sourceRef: link,
            priority: c.required ? 2 : 1,
            importance: 'normal',
            reminders: [{ offsetMinutes: 0 }],
            done: c.done,
            updatedAt: p.updatedAt,
          });
        }
        const end = at(s.end, 18 * 60);
        if (s.kind !== 'sales' && inRange(end))
          out.push({
            id: `gen:tagylym:${p.id}:${s.kind}:end`,
            title: `${kit} · ${stageTitle(s.kind)} ends`,
            notes: `${s.checklist.filter((c) => !c.done).length} of ${s.checklist.length} items left`,
            dueDate: end,
            kind: 'deadline',
            source: 'tagylym',
            sourceRef: link,
            priority: 2,
            importance: 'important',
            reminders: [{ offsetMinutes: 2 * 24 * 60 }],
            done: s.state === 'done',
            updatedAt: p.updatedAt,
          });
      }
    }
    return out;
  },
};
