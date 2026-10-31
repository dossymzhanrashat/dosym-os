import { useMemo } from 'react';
import { db, getMeta, setMeta } from '../../../core/db/db';
import { saveLocal } from '../../../core/db/sync';
import { useLive } from '../../../core/db/useLive';
import { GENERATED_DONE } from '../../../core/planner/providers';
import { saveSetting, useSetting } from '../../../core/planner/store';
import { acceptAllSet, applyChange, fromFeed, ingest, NEW_FIELD } from '../engine/changes';
import { makePlan, planTaskItemId } from '../engine/plan';
import { feedSchema } from '../model/schema';
import type { EligibilityProfile, Feed, Opportunity, PipelineStatus, RadarChange, RadarPlan, ResultOutcome } from '../model/types';
import { changeSync, changesTable, oppSync, oppsTable } from './db';

/*
 * Reading and changing Radar data. Every write goes through saveLocal(), so it syncs.
 * The feed (public/data/opportunities.json) is fetched on open and when the page becomes visible;
 * its changes become pending cards and nothing is applied until the user accepts it.
 */

export const FEED_URL = `${import.meta.env.BASE_URL}data/opportunities.json`;
const SEEDED = 'radar:seeded';
const PROFILE = 'radar:profile';
const LAST_FEED = 'radar:lastFeed';
/** Seed rows carry this fixed time, so a second device seeding before its first sync never overwrites edits. */
const SEED_TIME = '2026-10-30T00:00:00.000Z';
/** Decided with the user on 31 Oct 2026: team Ayaz is past the Activation Stage. */
const SEED_PREPARING = new Set(['conrad-2026-27']);

const NO_OPPS: Opportunity[] = [];
const NO_CHANGES: RadarChange[] = [];
const NO_PROFILE: EligibilityProfile = {};

// ---------- Live data ----------

export interface RadarData {
  loaded: boolean;
  opps: Opportunity[];
  changes: RadarChange[];
  done: Record<string, string>; // generated Planner ticks (plan steps)
}

export function useRadarData(): RadarData {
  const raw = useLive(
    async () => ({
      loaded: true,
      opps: (await oppsTable.toArray()).filter((o) => !o.deletedAt),
      changes: (await changesTable.toArray()).filter((c) => !c.deletedAt),
      done: (((await db.settings.get(GENERATED_DONE))?.value ?? {}) as Record<string, string>) || {},
    }),
    [],
    { loaded: false, opps: NO_OPPS, changes: NO_CHANGES, done: {} },
  );
  return raw;
}

export const usePending = (changes: RadarChange[]) => useMemo(() => changes.filter((c) => c.state === 'pending').sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt)), [changes]);

export function useProfile(): EligibilityProfile {
  return useSetting(PROFILE, NO_PROFILE);
}
export async function loadProfile(): Promise<EligibilityProfile> {
  return ((await db.settings.get(PROFILE))?.value ?? {}) as EligibilityProfile;
}
export const saveProfile = (p: EligibilityProfile) => saveSetting(PROFILE, p);

export interface LastFeed {
  generatedAt?: string;
  fetchedAt?: string;
  error?: string;
}
export function useLastFeed(): LastFeed {
  return useLive(async () => (await getMeta<LastFeed>(LAST_FEED)) ?? {}, [], {});
}

// ---------- Seed ----------

/** First open: Part A becomes the local list (SPEC § 4.13); Conrad starts in Preparing. */
export async function seedIfNeeded(now = new Date()): Promise<number> {
  if ((await oppsTable.count()) > 0 || (await db.settings.get(SEEDED))?.value === true) return 0;
  const feed = feedSchema.parse((await import('../../../../seed/radar-part-a.json')).default) as Feed;
  for (const f of feed.opportunities) {
    const o = fromFeed(f, now, 'seed', SEED_PREPARING.has(f.id) ? 'preparing' : 'watching');
    await saveLocal(oppSync, { ...o, updatedAt: SEED_TIME, plan: o.plan && { ...o.plan, createdAt: SEED_TIME } });
  }
  await saveSetting(SEEDED, true);
  return feed.opportunities.length;
}

// ---------- Feed ----------

/** Turns a feed into pending cards (and expires old ones). Returns how many new cards. */
export async function ingestFeed(feed: Feed, now = new Date()): Promise<number> {
  await seedIfNeeded(now);
  const opps = new Map((await oppsTable.toArray()).map((o) => [o.id, o]));
  const existing = new Map((await changesTable.toArray()).map((c) => [c.id, c]));
  const r = ingest(feed, opps, existing, now);
  for (const c of [...r.add, ...r.reopen, ...r.expire]) await saveLocal(changeSync, c);
  await setMeta(LAST_FEED, { generatedAt: feed.generatedAt, fetchedAt: now.toISOString() } satisfies LastFeed);
  await setMeta('radar:feed', feed); // the latest feed, for accepting deadline adds (tz, source)
  return r.add.length + r.reopen.length;
}

let lastFetch = 0;
/** Fetches the daily feed (at most every 10 min unless forced). Offline: Radar keeps working from local data. */
export async function refreshFeed(force = false): Promise<void> {
  if (!force && Date.now() - lastFetch < 10 * 60_000) return;
  lastFetch = Date.now();
  try {
    const res = await fetch(FEED_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = feedSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error(`the feed file does not match its format (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message})`);
    await ingestFeed(parsed.data);
  } catch (e) {
    await seedIfNeeded();
    const prev = (await getMeta<LastFeed>(LAST_FEED)) ?? {};
    await setMeta(LAST_FEED, { ...prev, error: e instanceof Error ? e.message : String(e) } satisfies LastFeed);
  }
}

/** Fallback: a feed file chosen by hand. Returns new cards, or throws what is wrong. */
export async function uploadFeed(text: string): Promise<number> {
  const parsed = feedSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return ingestFeed(parsed.data);
}

// ---------- Change cards ----------

const isDoneFn = async (oppId: string) => {
  const done = ((await db.settings.get(GENERATED_DONE))?.value ?? {}) as Record<string, string>;
  return (taskId: string) => !!done[planTaskItemId(oppId, taskId)];
};

/** Accept: writes the value, History and lastVerified; shifts undone plan steps. Returns a note for the user. */
export async function acceptChange(c: RadarChange, now = new Date()): Promise<string> {
  const iso = now.toISOString();
  let note = '';
  if (c.field === NEW_FIELD) {
    if (!c.opportunity) throw new Error('This card has no opportunity data.');
    await saveLocal(oppSync, fromFeed(c.opportunity, now, 'radar'));
    note = `${c.opportunity.name} added to Watching.`;
  } else {
    const o = await oppsTable.get(c.oppId);
    if (!o) throw new Error('This opportunity is not in your list any more.');
    const feed = await getMeta<Feed>('radar:feed');
    const { opp, shiftedDays } = applyChange(o, c, feed?.opportunities.find((f) => f.id === o.id), await isDoneFn(o.id), now);
    await saveLocal(oppSync, opp);
    if (shiftedDays) {
      const moved = opp.plan!.tasks.filter((t) => o.plan!.tasks.find((b) => b.id === t.id)?.day !== t.day).length;
      note = `${moved} planned step${moved === 1 ? '' : 's'} moved by ${Math.abs(shiftedDays)} day${Math.abs(shiftedDays) === 1 ? '' : 's'} ${shiftedDays > 0 ? 'later' : 'earlier'}.`;
    }
  }
  await saveLocal(changeSync, { ...c, state: 'accepted', decidedAt: iso, updatedAt: iso });
  return note;
}

export async function rejectChange(c: RadarChange, now = new Date()): Promise<void> {
  const iso = now.toISOString();
  await saveLocal(changeSync, { ...c, state: 'rejected', decidedAt: iso, updatedAt: iso });
}

export async function acceptAllHigh(changes: RadarChange[]): Promise<number> {
  const list = acceptAllSet(changes);
  for (const c of list) await acceptChange(c);
  return list.length;
}

// ---------- Pipeline and detail ----------

async function save(o: Opportunity, patch: Partial<Opportunity>): Promise<Opportunity> {
  const next = { ...o, ...patch, updatedAt: new Date().toISOString() };
  await saveLocal(oppSync, next);
  return next;
}

/** Moves an opportunity. Preparing builds the backward plan; the result says if it was compressed. */
export async function moveTo(
  o: Opportunity,
  status: PipelineStatus,
  extra: { confirmationNumber?: string; result?: ResultOutcome } = {},
  now = new Date(),
): Promise<{ plan?: RadarPlan; noDeadline?: boolean }> {
  const patch: Partial<Opportunity> = { status, ...extra };
  let plan: RadarPlan | undefined;
  if (status === 'preparing' && o.status !== 'preparing') {
    plan = makePlan(o, now);
    patch.plan = plan;
  }
  if (status === 'watching' || status === 'hidden') patch.plan = undefined; // its Planner steps go away
  const history = { at: now.toISOString(), field: 'status', old: o.status, new: status };
  await save(o, { ...patch, history: [...o.history, history] });
  return { plan, noDeadline: status === 'preparing' && !plan };
}

export async function toggleRequirement(o: Opportunity, reqId: string): Promise<void> {
  await save(o, { requirements: o.requirements.map((r) => (r.id === reqId ? { ...r, done: !r.done } : r)) });
}

export async function addRequirement(o: Opportunity, title: string): Promise<void> {
  const { requirementKind } = await import('../engine/plan');
  await save(o, { requirements: [...o.requirements, { id: `r${Date.now().toString(36)}`, title, kind: requirementKind(title), done: false }] });
}

export async function saveNotes(o: Opportunity, notes: string): Promise<void> {
  await save(o, { notes });
}

/** Ticks a plan step done (the Planner shows it as a generated task). */
export async function setStepDone(oppId: string, taskId: string, done: boolean): Promise<void> {
  const ticks = { ...(((await db.settings.get(GENERATED_DONE))?.value ?? {}) as Record<string, string>) };
  const id = planTaskItemId(oppId, taskId);
  if (done) ticks[id] = new Date().toISOString();
  else delete ticks[id];
  await saveSetting(GENERATED_DONE, ticks);
}
