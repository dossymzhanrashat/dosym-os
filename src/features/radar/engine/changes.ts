import type { Confidence, DeadlineType, Feed, FeedChange, FeedOpportunity, Opportunity, RadarChange, RadarDeadline } from '../model/types';
import { makePlan, requirementsFrom, shiftPlan } from './plan';
import { deadlineAt, safeDayKey, dayDiff } from './time';
import { extrasFor } from '../data/extras';

/*
 * Feed → change cards → accepted values (SPEC § 4.5, WEB EDITION).
 * Nothing in the feed is applied automatically: each entry of `changes` (and each opportunity the
 * app has never seen) becomes a pending card. Accept writes the new value, records History and
 * shifts undone plan steps if the main deadline moved; Reject hides the same diff for 30 days;
 * pending cards expire after 7 days.
 *
 * `field` vocabulary (agreed 31 Oct 2026; see public/data/opportunities.format.md):
 *   name · url · category · cost · aid · eligibility · requirements (new = items joined by "; ")
 *   deadlines[<type>].date · deadlines[<type>].status · deadlines[<type>] (added: new = date; removed: new = null)
 *   cancelled (new = "true")
 */

export const NEW_FIELD = 'new';
export const EXPIRE_DAYS = 7;
export const REJECT_QUIET_DAYS = 30;
const DAY_MS = 86_400_000;

export const changeId = (oppId: string, field: string, value: string | null | undefined) => `${oppId}|${field}|${value ?? ''}`;

const confidenceOf = (status: RadarDeadline['status']): Confidence => (status === 'confirmed' ? 'high' : 'low');

export function deadlinesFrom(list: FeedOpportunity['deadlines'], lastVerified?: string): RadarDeadline[] {
  const seen = new Map<string, number>();
  return list.map((d) => {
    const n = (seen.get(d.type) ?? 0) + 1;
    seen.set(d.type, n);
    return {
      id: n === 1 ? d.type : `${d.type}-${n}`,
      type: d.type,
      date: d.date,
      tz: d.tz,
      status: d.status,
      confidence: confidenceOf(d.status),
      sourceUrl: d.sourceUrl ?? undefined,
      lastVerified: lastVerified ?? undefined,
    };
  });
}

/** A local opportunity from a feed entry (seed or an accepted new one). Team items get team steps. */
export function fromFeed(f: FeedOpportunity, now: Date, createdBy: Opportunity['createdBy'], status: Opportunity['status'] = 'watching'): Opportunity {
  const team = extrasFor(f.id).team === 'team';
  const titles = [...f.requirements, ...(team ? ['Team formed', 'Coach/advisor confirmed'] : [])];
  const o: Opportunity = {
    id: f.id,
    name: f.name,
    category: f.category,
    url: f.url,
    deadlines: deadlinesFrom(f.deadlines, f.lastVerified ?? undefined),
    requirements: requirementsFrom(titles),
    cost: f.cost ?? undefined,
    aid: f.aid ?? undefined,
    eligibility: f.eligibility,
    lastVerified: f.lastVerified ?? undefined,
    status,
    notes: '',
    history: [],
    createdBy,
    updatedAt: now.toISOString(),
  };
  if (status === 'preparing') o.plan = makePlan(o, now);
  return o;
}

/** Current value of a field, as the feed would write it (to drop diffs already applied). */
export function currentValue(o: Opportunity, field: string): string | null | undefined {
  const m = field.match(/^deadlines\[(\w+)\](?:\.(date|status))?$/);
  if (m) {
    const d = o.deadlines.find((x) => x.type === m[1]);
    if (!m[2]) return d ? d.date : null;
    return d ? (m[2] === 'date' ? d.date : d.status) : null;
  }
  switch (field) {
    case 'name':
      return o.name;
    case 'url':
      return o.url;
    case 'category':
      return o.category;
    case 'cost':
      return o.cost ?? null;
    case 'aid':
      return o.aid ?? null;
    case 'eligibility':
      return o.eligibility;
    case 'requirements':
      return o.requirements.map((r) => r.title).join('; ');
    case 'cancelled':
      return o.cancelled ? 'true' : null;
  }
  return undefined;
}

export interface IngestResult {
  add: RadarChange[];
  expire: RadarChange[];
  /** Previously rejected diffs whose 30 quiet days are over and that the feed still reports. */
  reopen: RadarChange[];
}

/** Pending cards for a feed. Pure: the same feed and state give the same rows on every device. */
export function ingest(feed: Feed, opps: Map<string, Opportunity>, existing: Map<string, RadarChange>, now: Date): IngestResult {
  const iso = now.toISOString();
  const add: RadarChange[] = [];
  const reopen: RadarChange[] = [];
  const consider = (c: RadarChange) => {
    const prev = existing.get(c.id);
    if (!prev) return add.push(c);
    if (prev.state === 'rejected' && prev.decidedAt && now.getTime() - Date.parse(prev.decidedAt) > REJECT_QUIET_DAYS * DAY_MS && Date.parse(feed.generatedAt) > Date.parse(prev.decidedAt))
      reopen.push({ ...c, updatedAt: iso });
  };
  const fresh = now.getTime() - Date.parse(feed.generatedAt) <= EXPIRE_DAYS * DAY_MS;

  if (fresh) {
    for (const ch of feed.changes) {
      const o = opps.get(ch.id);
      if (!o || o.deletedAt) continue;
      if (currentValue(o, ch.field) === ch.new) continue; // already applied (another device, or by hand)
      consider(toRow(ch, feed.generatedAt, iso));
    }
    for (const f of feed.opportunities) {
      if (opps.has(f.id)) continue;
      consider({
        id: changeId(f.id, NEW_FIELD, f.name),
        oppId: f.id,
        field: NEW_FIELD,
        new: f.name,
        sourceUrl: f.url || undefined,
        confidence: f.deadlines.some((d) => d.status === 'confirmed') ? 'high' : 'low',
        fetchedAt: feed.generatedAt,
        state: 'pending',
        opportunity: f,
        updatedAt: iso,
      });
    }
  }

  const expire = [...existing.values()]
    .filter((c) => c.state === 'pending' && now.getTime() - Date.parse(c.fetchedAt) > EXPIRE_DAYS * DAY_MS)
    .map((c) => ({ ...c, state: 'expired' as const, decidedAt: iso, updatedAt: iso }));
  return { add, expire, reopen };
}

function toRow(ch: FeedChange, fetchedAt: string, iso: string): RadarChange {
  return {
    id: changeId(ch.id, ch.field, ch.new),
    oppId: ch.id,
    field: ch.field,
    old: ch.old ?? undefined,
    new: ch.new ?? undefined,
    sourceUrl: ch.sourceUrl ?? undefined,
    confidence: ch.confidence,
    fetchedAt,
    state: 'pending',
    updatedAt: iso,
  };
}

export interface Applied {
  opp: Opportunity;
  /** Days the plan's main deadline moved (undone steps were shifted by this). */
  shiftedDays?: number;
}

/**
 * Applies an accepted change. `feedOpp` (the same opportunity in the feed) supplies the time zone
 * and source of an added deadline; `isDone` tells which plan steps are ticked (they stay put).
 */
export function applyChange(o: Opportunity, c: RadarChange, feedOpp: FeedOpportunity | undefined, isDone: (taskId: string) => boolean, now: Date): Applied {
  const iso = now.toISOString();
  const next: Opportunity = { ...o, deadlines: [...o.deadlines], requirements: [...o.requirements], updatedAt: iso, lastVerified: c.fetchedAt };
  next.history = [...o.history, { at: iso, field: c.field, old: c.old ?? null, new: c.new ?? null, sourceUrl: c.sourceUrl }];
  let shiftedDays: number | undefined;

  const m = c.field.match(/^deadlines\[(\w+)\](?:\.(date|status))?$/);
  if (m) {
    const type = m[1] as DeadlineType;
    const idx = next.deadlines.findIndex((d) => d.type === type && (c.old == null || m[2] !== 'date' || d.date === c.old));
    const at = idx >= 0 ? idx : next.deadlines.findIndex((d) => d.type === type);
    const fromFeedDl = feedOpp?.deadlines.find((d) => d.type === type && (!c.new || d.date === c.new));
    if (m[2] === 'date' && at >= 0 && c.new) {
      const before = next.deadlines[at];
      const status = fromFeedDl?.status ?? (c.confidence === 'high' ? 'confirmed' : 'estimated');
      next.deadlines[at] = {
        ...before,
        date: c.new,
        tz: fromFeedDl?.tz ?? before.tz,
        status,
        confidence: c.confidence,
        sourceUrl: c.sourceUrl ?? before.sourceUrl,
        lastVerified: c.fetchedAt,
        manual: false,
      };
      if (o.plan?.deadlineId === before.id) {
        shiftedDays = dayDiff(safeDayKey(before), safeDayKey(next.deadlines[at]));
        if (shiftedDays) next.plan = shiftPlan(o.plan, shiftedDays, isDone);
      }
    } else if (m[2] === 'status' && at >= 0 && c.new) {
      const s = c.new as RadarDeadline['status'];
      next.deadlines[at] = { ...next.deadlines[at], status: s, confidence: s === 'confirmed' ? c.confidence : next.deadlines[at].confidence, lastVerified: c.fetchedAt };
    } else if (!m[2] && c.new) {
      const n = next.deadlines.filter((d) => d.type === type).length + 1;
      next.deadlines.push({
        id: n === 1 ? type : `${type}-${n}`,
        type,
        date: c.new,
        tz: fromFeedDl?.tz ?? next.deadlines[0]?.tz ?? 'Asia/Almaty',
        status: fromFeedDl?.status ?? (c.confidence === 'high' ? 'confirmed' : 'estimated'),
        confidence: c.confidence,
        sourceUrl: c.sourceUrl ?? fromFeedDl?.sourceUrl ?? undefined,
        lastVerified: c.fetchedAt,
      });
      next.deadlines.sort((a, b) => deadlineAt(a).getTime() - deadlineAt(b).getTime());
    } else if (!m[2] && !c.new && at >= 0) {
      next.deadlines.splice(at, 1);
    }
    return { opp: next, shiftedDays };
  }

  switch (c.field) {
    case 'name':
      if (c.new) next.name = c.new;
      break;
    case 'url':
      next.url = c.new ?? '';
      break;
    case 'category':
      if (c.new) next.category = c.new as Opportunity['category'];
      break;
    case 'cost':
      next.cost = c.new ?? undefined;
      break;
    case 'aid':
      next.aid = c.new ?? undefined;
      break;
    case 'eligibility':
      next.eligibility = c.new ?? '';
      break;
    case 'requirements': {
      const titles = feedOpp?.requirements.length ? feedOpp.requirements : (c.new ?? '').split(';').map((s) => s.trim()).filter(Boolean);
      const keep = new Map(o.requirements.map((r) => [r.title.toLowerCase(), r]));
      next.requirements = requirementsFrom(titles).map((r, i) => {
        const prev = keep.get(r.title.toLowerCase());
        return prev ? { ...prev, id: `r${i + 1}` } : r;
      });
      // Team steps added by the app stay.
      for (const r of o.requirements) if (r.kind === 'team' && !next.requirements.some((x) => x.title === r.title)) next.requirements.push({ ...r, id: `r${next.requirements.length + 1}` });
      break;
    }
    case 'cancelled':
      next.cancelled = c.new === 'true';
      if (next.cancelled && (next.status === 'watching' || next.status === 'preparing')) next.status = 'hidden';
      break;
  }
  return { opp: next, shiftedDays };
}

/** "Diamond Challenge · Submission date" — what a card is about. */
export function changeTitle(c: RadarChange, o?: Opportunity): string {
  const name = o?.name ?? c.opportunity?.name ?? c.oppId;
  if (c.field === NEW_FIELD) return `New: ${name}`;
  const m = c.field.match(/^deadlines\[(\w+)\](?:\.(date|status))?$/);
  if (m) {
    const t = m[1][0].toUpperCase() + m[1].slice(1);
    return `${name} · ${t} ${m[2] === 'status' ? 'date status' : m[2] === 'date' ? 'date' : c.new ? 'deadline added' : 'deadline removed'}`;
  }
  const label: Record<string, string> = { name: 'Name', url: 'Official page', category: 'Category', cost: 'Cost', aid: 'Aid', eligibility: 'Eligibility', requirements: 'Requirements', cancelled: 'Cancelled' };
  return `${name} · ${label[c.field] ?? c.field}`;
}

/** "Accept all high-confidence" never touches medium or low ones (SPEC § 4.3), nor new opportunities, which deserve a look. */
export const acceptAllSet = (changes: RadarChange[]) => changes.filter((c) => c.state === 'pending' && c.confidence === 'high' && c.field !== NEW_FIELD);
