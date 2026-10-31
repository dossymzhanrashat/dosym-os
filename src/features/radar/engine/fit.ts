import type { Extras } from '../data/extras';
import type { EligibilityProfile, Opportunity } from '../model/types';
import { mainDeadline } from './plan';
import { safeDayKey } from './time';

/*
 * Eligibility verdict (SPEC § 4.3) and fit score (§ 4.7).
 *   Eligible      every structured rule passes with the profile
 *   Check         a rule needs a profile field that is missing, or only text rules exist
 *   Not eligible  a rule fails; the failed rule is named
 * fit = 0.30·skillMatch + 0.20·projectReuse + 0.20·weight + 0.15·feasibility + 0.15·timing
 */

export type Verdict = { kind: 'eligible' | 'check' | 'notEligible'; reason?: string };

/** Whole years of age on a day. */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function verdict(o: Pick<Opportunity, 'deadlines' | 'eligibility'>, x: Extras, p: EligibilityProfile, now: Date): Verdict {
  const r = x.rules;
  if (!r) return /must|only|require|nominat|need/i.test(o.eligibility) ? { kind: 'check', reason: 'Read the rule: it is not one the app can check.' } : { kind: 'eligible' };
  const missing: string[] = [];

  if (r.minAge !== undefined || r.maxAge !== undefined) {
    const main = mainDeadline(o, now);
    const day = r.ageOn ?? (main ? safeDayKey(main) : undefined);
    if (!p.birthDate) missing.push('birth date');
    else if (day) {
      const age = ageOn(p.birthDate, day);
      const when = r.ageOn ? `on ${day}` : 'at the deadline';
      if (r.minAge !== undefined && age < r.minAge) return { kind: 'notEligible', reason: `Age ${age} ${when}; needs ${r.minAge}+.` };
      if (r.maxAge !== undefined && age > r.maxAge) return { kind: 'notEligible', reason: `Age ${age} ${when}; must be ${r.maxAge} or under.` };
    }
  }
  if (r.birthYears) {
    if (!p.birthDate) missing.push('birth date');
    else {
      const y = Number(p.birthDate.slice(0, 4));
      if (y < r.birthYears[0] || y > r.birthYears[1]) return { kind: 'notEligible', reason: `Born ${y}; must be born ${r.birthYears[0]}–${r.birthYears[1]}.` };
    }
  }
  if (r.grades) {
    if (p.usGrade === undefined) missing.push('grade');
    else if (!r.grades.includes(p.usGrade)) return { kind: 'notEligible', reason: `Grade ${p.usGrade}; open to grades ${r.grades[0]}–${r.grades[r.grades.length - 1]}.` };
  }
  if (missing.length) return { kind: 'check', reason: `Add your ${[...new Set(missing)].join(' and ')} in Radar settings.` };
  return { kind: 'eligible' };
}

/** Profile tags (SPEC § 4.7): robotics, physics, CS, math modelling, water, entrepreneurship, writing. */
const PROFILE_TAGS = ['robotics', 'physics', 'cs', 'mathModeling', 'math', 'water', 'entrepreneurship', 'writing', 'research'];

const isFree = (cost?: string) => !!cost && /^free\b/i.test(cost.trim());

export interface FitParts {
  skillMatch: number;
  projectReuse: number;
  weight: number;
  feasibility: number;
  timing: number;
  total: number;
}

export function fit(o: Pick<Opportunity, 'deadlines' | 'eligibility' | 'cost' | 'aid'>, x: Extras, p: EligibilityProfile, now: Date): FitParts {
  const overlap = x.tags.filter((t) => PROFILE_TAGS.includes(t)).length;
  const skillMatch = Math.min(100, overlap * 40);
  const projectReuse = x.tags.includes('frostpure') ? 100 : x.tags.includes('robotics') || x.tags.includes('tagylym') ? 60 : 20;
  const v = verdict(o, x, p, now);
  let feasibility = 100;
  if (v.kind === 'check') feasibility -= 30;
  if (x.tags.includes('visa')) feasibility -= 20;
  if (!isFree(o.cost) && o.cost && !o.aid) feasibility -= 15;
  if (x.format !== 'online') feasibility -= 10;
  // Timing: results before my "results-by" date; without that date or a known decision day it counts in full.
  const decision = o.deadlines.find((d) => d.type === 'decision');
  const timing = p.resultsBy && decision ? (safeDayKey(decision) <= p.resultsBy ? 100 : 40) : 100;
  let total = Math.round(0.3 * skillMatch + 0.2 * projectReuse + 0.2 * x.weight + 0.15 * Math.max(0, feasibility) + 0.15 * timing);
  if (v.kind === 'notEligible') total = Math.min(total, 10);
  return { skillMatch, projectReuse, weight: x.weight, feasibility: Math.max(0, feasibility), timing, total };
}
