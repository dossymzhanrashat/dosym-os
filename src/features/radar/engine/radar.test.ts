import { describe, expect, it } from 'vitest';
import publicFeed from '../../../../public/data/opportunities.json';
import seed from '../../../../seed/radar-part-a.json';
import { EXTRAS, extrasFor } from '../data/extras';
import { feedSchema } from '../model/schema';
import type { Feed, Opportunity, RadarChange } from '../model/types';
import { acceptAllSet, applyChange, changeId, fromFeed, ingest } from './changes';
import { ageOn, fit, verdict } from './fit';
import { makePlan, progress, requirementKind } from './plan';
import { radarReminders, RADAR_CAP } from './reminders';
import { daysLeft, describeDeadline, effectiveStatus, safeDayKey, zonedToUtc } from './time';

const SEED = seed as Feed;
const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-31T06:00:00Z'); // 11:00 Almaty
const byId = (id: string) => SEED.opportunities.find((o) => o.id === id)!;

describe('seed and feed file', () => {
  it('passes the feed schema and has an extras row for every opportunity', () => {
    expect(feedSchema.safeParse(SEED).success).toBe(true);
    expect(SEED.opportunities.length).toBe(55);
    for (const o of SEED.opportunities) expect(EXTRAS[o.id], o.id).toBeDefined();
  });

  it('imports [TO CONFIRM] rows as estimated with low confidence; confirmed ones are high', () => {
    const conrad = fromFeed(byId('conrad-2026-27'), NOW, 'seed');
    expect(conrad.deadlines[0]).toMatchObject({ status: 'confirmed', confidence: 'high' });
    const ssp = fromFeed(byId('ssp-2027'), NOW, 'seed');
    expect(ssp.deadlines[0]).toMatchObject({ status: 'estimated', confidence: 'low' });
    const toConfirm = SEED.opportunities.filter((o) => /TO CONFIRM/.test(`${o.eligibility} ${o.cost}`));
    expect(toConfirm.length).toBeGreaterThan(5);
  });

  it('the public feed file starts as the same seed', () => {
    expect(publicFeed).toEqual(SEED);
  });
});

describe('time zones', () => {
  const conrad = { date: '2027-01-07T23:59', tz: 'America/Chicago' };

  it('Jan 7, 23:59 CT shows as Jan 8, 10:59 Almaty and counts days to the earlier day', () => {
    expect(zonedToUtc(conrad.date, conrad.tz).toISOString()).toBe('2027-01-08T05:59:00.000Z');
    expect(describeDeadline(conrad)).toBe('Jan 7, 23:59 CT = Jan 8, 10:59 Almaty');
    expect(safeDayKey(conrad)).toBe('2027-01-07');
    expect(daysLeft(conrad, at('2027-01-06T06:00:00Z'))).toBe(1); // Jan 6 in Almaty → 1 day, not 2
  });

  it('handles no time, DST and Almaty itself', () => {
    expect(describeDeadline({ date: '2027-01-15', tz: 'Asia/Almaty' })).toBe('Jan 15 (time not stated)');
    expect(zonedToUtc('2027-03-15T12:00', 'America/New_York').toISOString()).toBe('2027-03-15T16:00:00.000Z'); // EDT
    expect(zonedToUtc('2027-01-15T12:00', 'America/New_York').toISOString()).toBe('2027-01-15T17:00:00.000Z'); // EST
    expect(describeDeadline({ date: '2027-01-25', tz: 'America/Los_Angeles' })).toBe('Jan 25 (time not stated) = Jan 26, 12:59 Almaty');
  });

  it('a confirmed date goes stale after 14 days unchecked', () => {
    expect(effectiveStatus({ status: 'confirmed', lastVerified: '2026-10-30' }, at('2026-11-10T00:00:00Z'))).toBe('confirmed');
    expect(effectiveStatus({ status: 'confirmed', lastVerified: '2026-10-30' }, at('2026-11-14T01:00:00Z'))).toBe('stale');
  });
});

describe('backward planning', () => {
  const conrad = fromFeed(byId('conrad-2026-27'), NOW, 'seed', 'preparing');

  it('reads requirement kinds', () => {
    expect(['Innovation Brief', '3–5 min video', 'Public team website', '2 teacher recommendations', 'Proof-based take-home exam', 'Transcript'].map(requirementKind)).toEqual([
      'essay',
      'video',
      'website',
      'rec',
      'problemSet',
      'transcript',
    ]);
  });

  it('Conrad in Preparing counts back from Jan 7 with no compression', () => {
    const plan = conrad.plan!;
    expect(plan.deadlineId).toBe('submission');
    expect(plan.compressed).toBeUndefined();
    const day = (id: string) => plan.tasks.find((t) => t.id === id)?.day;
    expect(day('team')).toBe('2026-12-10'); // D-28
    expect(day('essay-draft')).toBe('2026-12-17'); // D-21
    expect(day('video-record')).toBe('2026-12-28'); // D-10
    expect(day('final-check')).toBe('2027-01-05');
    expect(day('submit')).toBe('2027-01-06');
  });

  it('compresses into the days left and says so', () => {
    const late = makePlan(conrad, at('2026-12-30T06:00:00Z'))!;
    expect(late.compressed).toEqual({ days: 8, insteadOf: 28 });
    expect(late.tasks[0].day).toBe('2026-12-30');
    expect(late.tasks.at(-1)!.day).toBe('2027-01-06');
    const days = late.tasks.map((t) => t.day);
    expect([...days].sort()).toEqual(days); // order kept
  });

  it('weights essays, recs and problem sets twice in progress', () => {
    const p = progress([
      { id: 'a', title: 'Essay', kind: 'essay', done: true },
      { id: 'b', title: 'Form', kind: 'form', done: false },
    ]);
    expect(p).toEqual({ done: 1, total: 2, share: 2 / 3 });
  });
});

describe('change cards', () => {
  const diamond = fromFeed(byId('diamond-2027'), NOW, 'seed', 'preparing');
  const opps = new Map<string, Opportunity>([[diamond.id, diamond]]);
  const feed: Feed = {
    generatedAt: '2026-11-01T01:00:00Z',
    opportunities: [
      { ...byId('diamond-2027'), deadlines: [{ type: 'submission', date: '2027-01-21T17:00', tz: 'America/New_York', status: 'confirmed', sourceUrl: 'https://horn.udel.edu/x' }] },
      { ...byId('rsi-2027'), id: 'new-thing-2027', name: 'New Thing' },
    ],
    changes: [
      { id: 'diamond-2027', field: 'deadlines[submission].date', old: '2027-01-14T17:00', new: '2027-01-21T17:00', sourceUrl: 'https://horn.udel.edu/x', confidence: 'high' },
      { id: 'diamond-2027', field: 'cost', old: null, new: '$100 per team', sourceUrl: null, confidence: 'low' },
      { id: 'diamond-2027', field: 'name', old: 'x', new: diamond.name, sourceUrl: null, confidence: 'high' }, // already true
    ],
  };
  const today = at('2026-11-01T02:00:00Z');

  it('turns the feed into pending cards, skipping diffs already applied, plus a card for a new opportunity', () => {
    const r = ingest(feed, opps, new Map(), today);
    expect(r.add.map((c) => c.field).sort()).toEqual(['cost', 'deadlines[submission].date', 'new']);
    expect(r.add.every((c) => c.state === 'pending')).toBe(true);
    expect(acceptAllSet(r.add).map((c) => c.field).sort()).toEqual(['deadlines[submission].date']); // low and the new one left out
  });

  it('a rejected diff stays hidden for 30 days, and pending cards expire after 7', () => {
    const id = changeId('diamond-2027', 'cost', '$100 per team');
    const rejected: RadarChange = { ...ingest(feed, opps, new Map(), today).add.find((c) => c.id === id)!, state: 'rejected', decidedAt: '2026-11-01T03:00:00Z' };
    const again = ingest({ ...feed, generatedAt: '2026-11-20T01:00:00Z' }, opps, new Map([[id, rejected]]), at('2026-11-20T02:00:00Z'));
    expect(again.add.some((c) => c.id === id) || again.reopen.some((c) => c.id === id)).toBe(false);
    const later = ingest({ ...feed, generatedAt: '2026-12-05T01:00:00Z' }, opps, new Map([[id, rejected]]), at('2026-12-05T02:00:00Z'));
    expect(later.reopen.map((c) => c.id)).toEqual([id]);
    const pending = ingest(feed, opps, new Map(), today).add[0];
    const exp = ingest({ ...feed, changes: [], opportunities: [] }, opps, new Map([[pending.id, pending]]), at('2026-11-09T02:00:00Z'));
    expect(exp.expire.map((c) => c.state)).toEqual(['expired']);
  });

  it('accepting a moved deadline updates it, records History and shifts undone plan steps by the same days', () => {
    const card = ingest(feed, opps, new Map(), today).add.find((c) => c.field === 'deadlines[submission].date')!;
    const done = new Set(['team']);
    const before = diamond.plan!.tasks;
    const { opp, shiftedDays } = applyChange(diamond, card, feed.opportunities[0], (t) => done.has(t), today);
    expect(shiftedDays).toBe(7);
    expect(opp.deadlines[0]).toMatchObject({ date: '2027-01-21T17:00', status: 'confirmed', lastVerified: '2026-11-01T01:00:00Z' });
    expect(opp.history.at(-1)).toMatchObject({ field: 'deadlines[submission].date', old: '2027-01-14T17:00', new: '2027-01-21T17:00' });
    for (const t of opp.plan!.tasks) {
      const b = before.find((x) => x.id === t.id)!;
      expect(t.day === b.day).toBe(done.has(t.id));
    }
  });
});

describe('eligibility and fit', () => {
  const yygs = fromFeed(byId('yygs-2027'), NOW, 'seed');
  const x = extrasFor('yygs-2027');

  it('YYGS: Check without a birth date, Not eligible outside 16–18 on 18 Jul 2027', () => {
    expect(verdict(yygs, x, {}, NOW).kind).toBe('check');
    expect(verdict(yygs, x, { birthDate: '2010-08-01', usGrade: 11 }, NOW).kind).toBe('eligible'); // 16 on the day
    const young = verdict(yygs, x, { birthDate: '2011-08-01', usGrade: 10 }, NOW);
    expect(young).toEqual({ kind: 'notEligible', reason: 'Age 15 on 2027-07-18; needs 16+.' });
    expect(ageOn('2009-07-19', '2027-07-18')).toBe(17);
  });

  it('caps the fit of a not-eligible item at 10 and rates FrostPure items higher', () => {
    expect(fit(yygs, x, { birthDate: '2011-08-01', usGrade: 10 }, NOW).total).toBeLessThanOrEqual(10);
    const conrad = fromFeed(byId('conrad-2026-27'), NOW, 'seed');
    const lumiere = fromFeed(byId('lumiere-winter-2026'), NOW, 'seed');
    expect(fit(conrad, extrasFor(conrad.id), {}, NOW).total).toBeGreaterThan(fit(lumiere, extrasFor(lumiere.id), {}, NOW).total);
  });
});

describe('reminders', () => {
  const base = '/dosym-os/';
  const conrad = fromFeed(byId('conrad-2026-27'), NOW, 'seed', 'preparing');

  it('Preparing gets T-30/14/7/3/1, day-of 08:00 and 3 h before, in Almaty time', () => {
    const r = radarReminders([conrad], at('2026-12-07T00:00:00Z'), 40, base).filter((x) => x.id.includes(':submission:'));
    expect(r.map((x) => x.id.split(':').pop())).toEqual(['t30', 't14', 't7', 't3', 't1', 'd0', 'h3']);
    expect(r[0].fireAt).toBe('2026-12-08T03:00:00.000Z'); // Dec 8, 08:00 Almaty = Jan 7 − 30
    expect(r.at(-1)!.fireAt).toBe('2027-01-08T02:59:00.000Z'); // 3 h before 10:59 Almaty
    expect(r[2].body).toBe('Due in 7 days (check date) (Jan 7, 23:59 CT = Jan 8, 10:59 Almaty). 0 of 6 items done.'); // last checked Oct 30 → stale by Dec
    const fresh = { ...conrad, deadlines: conrad.deadlines.map((d) => ({ ...d, lastVerified: '2026-12-30' })) };
    expect(radarReminders([fresh], at('2026-12-31T00:00:00Z'), 10, base).find((x) => x.id.endsWith(':t7'))!.body).toBe('Due in 7 days (Jan 7, 23:59 CT = Jan 8, 10:59 Almaty). 0 of 6 items done.');
    expect(r[0].url).toBe('/dosym-os/radar/o/conrad-2026-27');
  });

  it('Watching gets only T-14 and T-3; estimated dates say (est.); never more than 24', () => {
    const ssp = fromFeed(byId('ssp-2027'), NOW, 'seed');
    const r = radarReminders([ssp], at('2027-01-01T00:00:00Z'), 30, base);
    expect(r.map((x) => x.id.split(':').pop())).toEqual(['t14', 't3']);
    expect(r[0].body).toContain('(est.)');
    const all = SEED.opportunities.map((o) => fromFeed(o, NOW, 'seed', 'preparing'));
    expect(radarReminders(all, NOW, 400, base).length).toBe(RADAR_CAP);
  });
});

describe('feed filters', async () => {
  const { DEFAULT_FILTERS, filterFeed } = await import('./filter');
  const all = SEED.opportunities.map((o) => fromFeed(o, NOW, 'seed'));

  it('sorts by next deadline and combines filters with AND', () => {
    const rows = filterFeed(all, DEFAULT_FILTERS, {}, NOW);
    expect(rows.slice(0, 2).map((r) => [r.opp.id, r.days])).toEqual([
      ['himcm-2026', 4], // Nov 4 NY (= Nov 5 Almaty): counts to the earlier day
      ['amc-2026-27', 5],
    ]);
    expect(rows.at(-1)!.days).toBeUndefined(); // rolling items last
    const frostFree = filterFeed(all, { ...DEFAULT_FILTERS, frostpure: true, cost: 'free' }, {}, NOW);
    expect(frostFree.length).toBeGreaterThan(0);
    expect(frostFree.every((r) => extrasFor(r.opp.id).tags.includes('frostpure') && /^free/i.test(r.opp.cost ?? ''))).toBe(true);
    const soon = filterFeed(all, { ...DEFAULT_FILTERS, window: 30 }, {}, NOW);
    expect(soon.every((r) => r.days !== undefined && r.days <= 30)).toBe(true);
  });

  it('eligible-only hides items that fail with the profile', () => {
    const profile = { birthDate: '2011-08-01', usGrade: 10 };
    const ids = filterFeed(all, { ...DEFAULT_FILTERS, eligibleOnly: true }, profile, NOW).map((r) => r.opp.id);
    expect(ids).not.toContain('yygs-2027');
    expect(ids).not.toContain('imagine-cup-2027');
    expect(ids).toContain('conrad-2026-27');
  });
});
