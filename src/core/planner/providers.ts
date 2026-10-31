import { db } from '../db/db';
import { DAY } from './time';
import type { PlannerItem, PlannerItemProvider } from './types';

/*
 * Module items are generated, not copied (SPEC › Planning rules). Each module registers a
 * PlannerItemProvider; the Planner, Today, reminders and the badge read its items next to the
 * user's own. Generated ids start with "gen:" and are never stored as planner rows; ticking one
 * done is remembered in the synced setting below.
 */

const providers: PlannerItemProvider[] = [];
export const GENERATED_DONE = 'planner:generatedDone';

export function registerPlannerProvider(p: PlannerItemProvider): void {
  if (providers.includes(p)) return;
  providers.push(p);
  // Modules start after the first paint; touching this row re-runs live Planner queries.
  void db.meta.put({ key: 'planner:providers', value: providers.length });
}

export const isGenerated = (id: string) => id.startsWith('gen:');

/** A generated repeat (daily vocab) is done by its module and never "overdue" or "slipped". */
export const isGeneratedRepeat = (e: Pick<PlannerItem, 'id' | 'recurrence'> & { baseId?: string }) => isGenerated(e.baseId ?? e.id) && !!e.recurrence;

/** All generated items from roughly two months back to a year ahead, with "done" ticks applied. */
export async function generatedItems(now = new Date()): Promise<PlannerItem[]> {
  const range = { start: new Date(now.getTime() - 60 * DAY), end: new Date(now.getTime() + 400 * DAY) };
  await db.meta.get('planner:providers'); // read, so live queries re-run when a module registers
  const done = ((await db.settings.get(GENERATED_DONE))?.value ?? {}) as Record<string, string>;
  const lists = await Promise.all(providers.map((p) => p.plannerItems(range)));
  return lists.flat().map((i) => (!i.recurrence && done[i.id] ? { ...i, done: true, completedAt: done[i.id] } : i));
}
