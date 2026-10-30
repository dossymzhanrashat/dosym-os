import { db, getMeta, setMeta } from '../db/db';
import { supabase } from '../db/supabase';
import { onSynced } from '../db/sync';
import { computeReminders, type ReminderDraft } from './reminderEngine';
import { allPlannerItems, FIXED_BLOCKS, schoolDays } from './store';
import type { FixedBlock } from './types';

/*
 * After each sync, upload the next 14 days of reminders to Supabase `reminders`, where the
 * send-reminders Edge Function (every 5 min) pushes them to the phone. Rows no longer wanted
 * (item done, moved or deleted) are removed while still unsent.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFRESH_MS = 30 * 60_000; // re-upload unchanged reminders at most every 30 min

/** Extra reminders a module computes itself (English morning review). */
type ReminderSource = (now: Date, days: number) => Promise<ReminderDraft[]>;
const sources: ReminderSource[] = [];
export function registerReminderSource(fn: ReminderSource): void {
  if (!sources.includes(fn)) sources.push(fn);
}

export async function localReminders(now = new Date(), days = 14): Promise<ReminderDraft[]> {
  const items = await allPlannerItems();
  const blocks = ((await db.settings.get(FIXED_BLOCKS))?.value as FixedBlock[] | undefined) ?? [];
  const planner = computeReminders(items, { now, base: import.meta.env.BASE_URL, schoolDays: schoolDays(blocks), days });
  const extra = (await Promise.all(sources.map((fn) => fn(now, days)))).flat();
  return [...planner, ...extra].sort((a, b) => a.fireAt.localeCompare(b.fireAt));
}

export async function uploadReminders(): Promise<void> {
  const drafts = await localReminders();
  const signature = drafts.map((d) => `${d.id}|${d.title}|${d.body}|${d.alarm}`).join('\n');
  const last = await getMeta<{ signature: string; at: number }>('reminders:uploaded');
  if (last?.signature === signature && Date.now() - last.at < REFRESH_MS) return;

  const nowIso = new Date().toISOString();
  const { data: existing, error } = await supabase.from('reminders').select('id').is('sent_at', null).gt('fire_at', nowIso);
  if (error) throw new Error(error.message);

  const wanted = new Set(drafts.map((d) => d.id));
  const stale = existing.map((r) => r.id as string).filter((id) => !wanted.has(id));
  for (let i = 0; i < stale.length; i += 100) {
    const { error: delError } = await supabase.from('reminders').delete().in('id', stale.slice(i, i + 100)).is('sent_at', null);
    if (delError) throw new Error(delError.message);
  }

  const rows = drafts.map((d) => ({
    id: d.id,
    planner_item_id: d.plannerItemId && UUID.test(d.plannerItemId) ? d.plannerItemId : null, // generated items have text ids
    fire_at: d.fireAt,
    title: d.title,
    body: d.body,
    url: d.url,
    alarm: d.alarm,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error: upError } = await supabase.from('reminders').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,id' });
    if (upError) throw new Error(upError.message);
  }
  await setMeta('reminders:uploaded', { signature, at: Date.now() });
}

onSynced(uploadReminders);
