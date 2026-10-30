import { db } from '../db/db';
import { saveLocal } from '../db/sync';
import { plannerTable, settingsTable } from '../db/syncTables';
import { useLive } from '../db/useLive';
import { anchorOf, type PlannerEntry } from './entries';
import { addDays, DAY, HOUR } from './time';
import type { FixedBlock, PlannerItem } from './types';

// Reading and changing planner items. Every write goes through saveLocal(), so it syncs.

export function newItem(fields: Partial<PlannerItem> & { title: string }): PlannerItem {
  return {
    id: crypto.randomUUID(),
    kind: 'task',
    source: 'user',
    priority: 0,
    importance: 'normal',
    reminders: [],
    done: false,
    updatedAt: new Date().toISOString(),
    ...fields,
  };
}

export async function saveItem(item: PlannerItem): Promise<void> {
  await saveLocal(plannerTable, { ...item, updatedAt: new Date().toISOString() });
}

export async function updateItem(id: string, change: (item: PlannerItem) => PlannerItem): Promise<void> {
  const item = await db.plannerItems.get(id);
  if (item) await saveItem(change(item));
}

/** All items that are not deleted, live. */
export function usePlannerItems(): PlannerItem[] {
  return useLive(() => db.plannerItems.filter((i) => !i.deletedAt).toArray(), [], []);
}

export function usePlannerItem(id: string | undefined): PlannerItem | null | undefined {
  // undefined = still loading, null = not found
  return useLive(async () => (id ? ((await db.plannerItems.get(id)) ?? null) : null), [id], undefined);
}

const shiftDay = (iso: string | undefined, days: number) => (iso ? addDays(new Date(iso), days).toISOString() : undefined);

export async function setDone(entry: PlannerEntry, done: boolean): Promise<void> {
  const completedAt = done ? new Date().toISOString() : undefined;
  await updateItem(entry.baseId, (item) => {
    if (!entry.occurrence) return { ...item, done, completedAt, snoozedUntil: undefined };
    const rest = (item.completions ?? []).filter((d) => d !== entry.occurrence);
    return { ...item, completions: done ? [...rest, entry.occurrence] : rest, completedAt };
  });
}

/** "Snooze 1 h": remind again in an hour (the plan itself keeps its time). */
export async function snooze(entry: PlannerEntry, ms = HOUR): Promise<void> {
  await updateItem(entry.baseId, (item) => ({ ...item, snoozedUntil: new Date(Date.now() + ms).toISOString() }));
}

/** Takes one day out of a repeat and saves it as a one-off item with new times. */
async function detachOccurrence(entry: PlannerEntry, times: Pick<PlannerItem, 'start' | 'end' | 'dueDate'>): Promise<void> {
  await updateItem(entry.baseId, (item) => ({ ...item, exceptions: [...(item.exceptions ?? []), entry.occurrence!] }));
  const { baseId: _b, occurrence: _o, id: _i, recurrence: _r, completions: _c, exceptions: _e, ...copy } = entry;
  await saveItem(newItem({ ...copy, ...times, done: false, snoozedUntil: undefined }));
}

/** "Tomorrow" / "push to tomorrow". A repeat skips today's occurrence and gets a one-off copy instead. */
export async function pushToTomorrow(entry: PlannerEntry, days = 1): Promise<void> {
  if (entry.occurrence) {
    await detachOccurrence(entry, { start: shiftDay(entry.start, days), end: shiftDay(entry.end, days), dueDate: shiftDay(entry.dueDate, days) });
    return;
  }
  await updateItem(entry.baseId, (item) => ({
    ...item,
    start: shiftDay(item.start, days),
    end: shiftDay(item.end, days),
    dueDate: shiftDay(item.dueDate, days) ?? (item.start ? undefined : addDays(new Date(), days).toISOString()),
    snoozedUntil: undefined,
  }));
}

/** Delete an item, or only this day of a repeating one. Soft delete, so it syncs. */
export async function deleteEntry(entry: PlannerEntry): Promise<void> {
  await updateItem(entry.baseId, (item) =>
    entry.occurrence
      ? { ...item, exceptions: [...(item.exceptions ?? []), entry.occurrence] }
      : { ...item, deletedAt: new Date().toISOString() },
  );
}

/** Moves or resizes a timed item (drag in Day/Week). Without `end`, keeps its length. */
export async function moveTo(entry: PlannerEntry, start: Date, end?: Date): Promise<void> {
  const length = entry.start && entry.end ? new Date(entry.end).getTime() - new Date(entry.start).getTime() : HOUR;
  const times = { start: start.toISOString(), end: (end ?? new Date(start.getTime() + length)).toISOString(), dueDate: entry.dueDate };
  if (entry.occurrence) await detachOccurrence(entry, times);
  else await updateItem(entry.baseId, (item) => ({ ...item, start: times.start, end: times.end }));
}

/** Back-planning: draft T-21, review T-10, submit T-2 before a deadline (only steps still ahead). */
export function backPlanSteps(deadline: PlannerItem, now = new Date()): PlannerItem[] {
  const due = anchorOf(deadline);
  if (!due) return [];
  const dueAt = new Date(due);
  return [
    { label: 'Draft', days: 21 },
    { label: 'Review', days: 10 },
    { label: 'Submit', days: 2 },
  ]
    .map(({ label, days }) => ({ label, at: new Date(dueAt.getTime() - days * DAY) }))
    .filter((s) => s.at > now)
    .map((s) =>
      newItem({
        title: `${s.label}: ${deadline.title}`,
        kind: 'task',
        source: deadline.source,
        sourceRef: `planner:${deadline.id}`,
        importance: deadline.importance === 'critical' ? 'important' : deadline.importance,
        dueDate: s.at.toISOString(),
      }),
    );
}

/** "Split into steps": one task per line, due by the parent's time. */
export function splitSteps(parent: PlannerEntry, lines: string[]): PlannerItem[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) =>
      newItem({
        title: text,
        kind: 'task',
        source: parent.source,
        sourceRef: `planner:${parent.baseId}`,
        dueDate: parent.dueDate ?? parent.start,
      }),
    );
}

export async function saveMany(items: PlannerItem[]): Promise<void> {
  for (const i of items) await saveItem(i);
}

// ---------- Synced settings ----------

export function useSetting<T>(id: string, fallback: T): T {
  return useLive(async () => {
    const row = await db.settings.get(id);
    return row && !row.deletedAt ? (row.value as T) : fallback;
  }, [id], fallback);
}

export async function saveSetting(id: string, value: unknown): Promise<void> {
  await saveLocal(settingsTable, { id, value, updatedAt: new Date().toISOString() });
}

export const FIXED_BLOCKS = 'fixedBlocks';
export function useFixedBlocks(): FixedBlock[] {
  return useSetting<FixedBlock[]>(FIXED_BLOCKS, []);
}

/** Weekdays with the 07:00 morning plan: days of a block named "School", else Monday–Friday. */
export function schoolDays(blocks: FixedBlock[]): number[] {
  const school = blocks.filter((b) => /school|мектеп|школ/i.test(b.label));
  return school.length ? [...new Set(school.flatMap((b) => b.days))] : [1, 2, 3, 4, 5];
}
