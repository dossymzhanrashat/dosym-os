import { extrasFor, type Format } from '../data/extras';
import type { EligibilityProfile, OppCategory, Opportunity } from '../model/types';
import { fit, verdict } from './fit';
import { nextDeadline } from './plan';
import { daysLeft, deadlineAt } from './time';

/*
 * Discovery Feed filters (SPEC § 4.3): every chosen filter must pass (AND). Saved per device.
 * Sort: next deadline first (no deadline last), then fit.
 */

export interface FeedFilters {
  categories: OppCategory[];
  window: 'any' | 7 | 30 | 90 | 'cycle';
  cost: 'any' | 'free' | 'aid';
  minFit: 0 | 50 | 70;
  format: 'any' | Format;
  team: 'any' | 'solo' | 'team';
  frostpure: boolean;
  eligibleOnly: boolean;
  showHidden: boolean;
  q: string;
}

export const DEFAULT_FILTERS: FeedFilters = { categories: [], window: 'any', cost: 'any', minFit: 0, format: 'any', team: 'any', frostpure: false, eligibleOnly: false, showHidden: false, q: '' };

/** End of the 2026–27 cycle for the "this cycle" window. */
export const CYCLE_END = '2027-08-31T23:59:00Z';

const isFree = (o: Opportunity) => !!o.cost && /^free\b/i.test(o.cost.trim());

export interface FeedRow {
  opp: Opportunity;
  fit: number;
  days?: number;
}

export function filterFeed(opps: Opportunity[], f: FeedFilters, profile: EligibilityProfile, now: Date): FeedRow[] {
  const q = f.q.trim().toLowerCase();
  const rows: FeedRow[] = [];
  for (const o of opps) {
    if (o.deletedAt) continue;
    if (o.status === 'hidden' ? !f.showHidden : f.showHidden) continue;
    const x = extrasFor(o.id);
    const next = nextDeadline(o, now);
    const days = next ? daysLeft(next, now) : undefined;
    if (f.categories.length && !f.categories.includes(o.category)) continue;
    if (f.window !== 'any') {
      if (!next) continue;
      if (f.window === 'cycle' ? deadlineAt(next).toISOString() > CYCLE_END : days! > f.window) continue;
    }
    if (f.cost === 'free' && !isFree(o)) continue;
    if (f.cost === 'aid' && !isFree(o) && !o.aid) continue;
    if (f.format !== 'any' && x.format !== f.format) continue;
    if (f.team === 'solo' && x.team === 'team') continue;
    if (f.team === 'team' && x.team === 'solo') continue;
    if (f.frostpure && !x.tags.includes('frostpure')) continue;
    if (f.eligibleOnly && verdict(o, x, profile, now).kind === 'notEligible') continue;
    const score = fit(o, x, profile, now).total;
    if (score < f.minFit) continue;
    if (q && !`${o.name} ${o.eligibility} ${o.category}`.toLowerCase().includes(q)) continue;
    rows.push({ opp: o, fit: score, days });
  }
  return rows.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9) || b.fit - a.fit || a.opp.name.localeCompare(b.opp.name));
}
