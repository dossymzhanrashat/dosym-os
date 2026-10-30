import { plannerItemSchema } from '../planner/schema';
import type { PlannerItem } from '../planner/types';
import type { SettingRow } from './db';

/*
 * How each local Dexie table maps to its Supabase table (camelCase ↔ snake_case).
 * Undefined becomes null on the way up, so clearing a field on one device clears it everywhere.
 * Rows coming down are checked with zod; a row that fails is skipped, never saved.
 */

type Remote = Record<string, unknown>;

export interface SyncTableDef<L extends { updatedAt: string } = { updatedAt: string }> {
  /** Dexie table name. */
  local: string;
  /** Supabase table name. */
  remote: string;
  /** Columns of the unique key used for upsert (user_id is filled in by the database). */
  onConflict: string;
  key(row: L): string;
  toRemote(row: L): Remote;
  fromRemote(row: Remote): L | null;
}

const orNull = <T>(v: T | undefined) => (v === undefined ? null : v);
/** Postgres returns "2026-11-02T05:00:00+00:00"; keep the browser's "…Z" form so values compare equal. */
const isoOrUndef = (v: unknown) => (typeof v === 'string' ? new Date(v).toISOString() : undefined);
const orUndef = <T>(v: T | null | undefined) => (v === null ? undefined : v);

export const plannerTable: SyncTableDef<PlannerItem> = {
  local: 'plannerItems',
  remote: 'planner_items',
  onConflict: 'id',
  key: (i) => i.id,
  toRemote: (i) => ({
    id: i.id,
    title: i.title,
    notes: orNull(i.notes),
    start_at: orNull(i.start),
    end_at: orNull(i.end),
    due_date: orNull(i.dueDate),
    kind: i.kind,
    source: i.source,
    source_ref: orNull(i.sourceRef),
    priority: i.priority,
    importance: i.importance,
    reminders: i.reminders,
    recurrence: orNull(i.recurrence),
    done: i.done,
    completed_at: orNull(i.completedAt),
    completions: orNull(i.completions),
    exceptions: orNull(i.exceptions),
    snoozed_until: orNull(i.snoozedUntil),
    checklist: orNull(i.checklist),
    links: orNull(i.links),
    updated_at: i.updatedAt,
    deleted_at: orNull(i.deletedAt),
  }),
  fromRemote: (r) => {
    const candidate = {
      id: r.id,
      title: r.title,
      notes: orUndef(r.notes),
      start: isoOrUndef(r.start_at),
      end: isoOrUndef(r.end_at),
      dueDate: isoOrUndef(r.due_date),
      kind: r.kind,
      source: r.source,
      sourceRef: orUndef(r.source_ref),
      priority: r.priority,
      importance: r.importance,
      reminders: r.reminders ?? [],
      recurrence: orUndef(r.recurrence),
      done: r.done,
      completedAt: isoOrUndef(r.completed_at),
      updatedAt: isoOrUndef(r.updated_at),
      deletedAt: isoOrUndef(r.deleted_at),
      completions: orUndef(r.completions),
      exceptions: orUndef(r.exceptions),
      snoozedUntil: isoOrUndef(r.snoozed_until),
      checklist: orUndef(r.checklist),
      links: orUndef(r.links),
    };
    const parsed = plannerItemSchema.safeParse(candidate);
    if (!parsed.success) {
      console.warn('[sync] skipped invalid planner item', r.id, parsed.error.issues);
      return null;
    }
    // zod drops undefined keys; keep the object shape plain.
    return parsed.data as PlannerItem;
  },
};

export const settingsTable: SyncTableDef<SettingRow> = {
  local: 'settings',
  remote: 'settings',
  onConflict: 'user_id,id',
  key: (s) => s.id,
  toRemote: (s) => ({ id: s.id, value: s.value ?? null, updated_at: s.updatedAt, deleted_at: orNull(s.deletedAt) }),
  fromRemote: (r) =>
    typeof r.id === 'string' && typeof r.updated_at === 'string'
      ? { id: r.id, value: r.value, updatedAt: new Date(r.updated_at).toISOString(), deletedAt: isoOrUndef(r.deleted_at) }
      : null,
};

/**
 * Last write wins: should a row from the server replace the local copy?
 * Not when the local copy (or a change still waiting to be pushed) is as new or newer.
 */
export function remoteWins(remoteUpdatedAt: string, localUpdatedAt?: string, pendingUpdatedAt?: string): boolean {
  if (localUpdatedAt && localUpdatedAt >= remoteUpdatedAt) return false;
  if (pendingUpdatedAt && pendingUpdatedAt >= remoteUpdatedAt) return false;
  return true;
}
