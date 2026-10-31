import { almatyDayKey } from '../../../core/planner/time';
import type { Opportunity, PlanTask, RadarDeadline, RadarPlan, Requirement, RequirementKind } from '../model/types';
import { addDayKey, dayDiff, deadlineAt, safeDayKey } from './time';

/*
 * Backward planning (SPEC § 4.6). When an opportunity enters Preparing, its requirements become
 * steps counted back from the main deadline D. If the first step is already in the past, all steps
 * are spread evenly between today and D-1 and the user is told ("Plan compressed: 9 days instead
 * of 28"). Steps are stored on the opportunity, so a moved deadline can shift the undone ones by
 * the same number of days.
 */

const KIND_RULES: [RequirementKind, RegExp][] = [
  ['rec', /recommend|\brecs?\b|reference|letter of support/i],
  ['transcript', /transcript|grades report/i],
  ['problemSet', /problem set|qualifying quiz|take-home exam|interesting test|\bquiz/i],
  ['video', /video|film/i],
  ['website', /website/i],
  ['fee', /\bfee\b|waiver|\baid\b|financ/i],
  ['team', /team formed|coach|advisor confirmed/i],
  ['test', /test scores?|exam\b|\bsat\b|ielts|toefl/i],
  ['essay', /essay|brief|statement|paper|proposal|write-?up|short answer|letter\b|poem/i],
  ['form', /application|registration|register|sign-?up/i],
];

export function requirementKind(title: string): RequirementKind {
  return KIND_RULES.find(([, re]) => re.test(title))?.[0] ?? 'other';
}

export const requirementsFrom = (titles: string[]): Requirement[] =>
  titles.map((title, i) => ({ id: `r${i + 1}`, title, kind: requirementKind(title), done: false }));

/** Checklist progress, weighted 2× for essays, recommendations and problem sets. */
export function progress(reqs: Requirement[]): { done: number; total: number; share: number } {
  const w = (r: Requirement) => (r.kind === 'essay' || r.kind === 'rec' || r.kind === 'problemSet' ? 2 : 1);
  const total = reqs.reduce((s, r) => s + w(r), 0);
  const done = reqs.filter((r) => r.done).reduce((s, r) => s + w(r), 0);
  return { done: reqs.filter((r) => r.done).length, total: reqs.length, share: total ? done / total : 0 };
}

const MAIN_TYPES = ['application', 'submission', 'registration', 'payment'];

/** The deadline a plan counts back from: the next application/submission one, else the next of any type. */
export function mainDeadline(o: Pick<Opportunity, 'deadlines'>, now: Date): RadarDeadline | undefined {
  const upcoming = o.deadlines.filter((d) => deadlineAt(d) > now).sort((a, b) => deadlineAt(a).getTime() - deadlineAt(b).getTime());
  return upcoming.find((d) => MAIN_TYPES.includes(d.type)) ?? upcoming[0];
}

/** The next upcoming deadline of any type. */
export function nextDeadline(o: Pick<Opportunity, 'deadlines'>, now: Date): RadarDeadline | undefined {
  return o.deadlines.filter((d) => deadlineAt(d) > now).sort((a, b) => deadlineAt(a).getTime() - deadlineAt(b).getTime())[0];
}

type Step = { id: string; title: string; offset: number };

const TEMPLATES: Partial<Record<RequirementKind, Step[]>> = {
  rec: [
    { id: 'rec-ask', title: 'Ask recommender (send brief + CV)', offset: 28 },
    { id: 'rec-follow', title: 'Polite follow-up with recommender', offset: 10 },
  ],
  essay: [
    { id: 'essay-outline', title: 'Outline', offset: 24 },
    { id: 'essay-draft', title: 'First draft', offset: 21 },
    { id: 'essay-feedback', title: 'Feedback round', offset: 14 },
    { id: 'essay-final', title: 'Final draft', offset: 5 },
  ],
  transcript: [{ id: 'transcript', title: 'Request transcript from the school office', offset: 21 }],
  video: [
    { id: 'video-script', title: 'Video script', offset: 18 },
    { id: 'video-record', title: 'Record video', offset: 10 },
    { id: 'video-edit', title: 'Edit video', offset: 6 },
  ],
  website: [
    { id: 'web-skeleton', title: 'Website skeleton', offset: 20 },
    { id: 'web-content', title: 'Website content', offset: 8 },
  ],
  problemSet: [
    { id: 'ps-start', title: 'Start the problem set', offset: 42 },
    { id: 'ps-half', title: 'Problem set half done', offset: 21 },
    { id: 'ps-writeup', title: 'Problem set write-up', offset: 7 },
  ],
  fee: [{ id: 'fee', title: 'Fee waiver or aid form', offset: 10 }],
  team: [{ id: 'team', title: 'Confirm team and coach', offset: 28 }],
};

/** Steps for an opportunity's requirements, one set per kind; essay steps name the requirement. */
export function steps(o: Pick<Opportunity, 'requirements' | 'name'>): Step[] {
  const out: Step[] = [];
  const kinds = new Set(o.requirements.filter((r) => !r.done).map((r) => r.kind));
  for (const kind of kinds) {
    const tpl = TEMPLATES[kind];
    if (!tpl) continue;
    const first = o.requirements.find((r) => r.kind === kind)!;
    for (const s of tpl) out.push({ ...s, title: kind === 'essay' ? `${first.title}: ${s.title.toLowerCase()}` : s.title });
  }
  out.push({ id: 'final-check', title: 'Final check (all boxes ticked)', offset: 2 }, { id: 'submit', title: 'Submit (target, before the real deadline)', offset: 1 });
  return out.sort((a, b) => b.offset - a.offset || a.id.localeCompare(b.id));
}

/** The plan for entering Preparing today. Undefined when there is no upcoming deadline. */
export function makePlan(o: Pick<Opportunity, 'deadlines' | 'requirements' | 'name'>, now: Date): RadarPlan | undefined {
  const d = mainDeadline(o, now);
  if (!d) return undefined;
  const dKey = safeDayKey(d);
  const today = almatyDayKey(now);
  const list = steps(o);
  const first = addDayKey(dKey, -list[0].offset);
  let tasks: PlanTask[];
  let compressed: RadarPlan['compressed'];
  if (first >= today) {
    tasks = list.map((s) => ({ ...s, day: addDayKey(dKey, -s.offset) }));
  } else {
    // Spread evenly from today to D-1, keeping the order.
    const last = addDayKey(dKey, -1) < today ? today : addDayKey(dKey, -1);
    const span = dayDiff(today, last);
    tasks = list.map((s, i) => ({ ...s, day: addDayKey(today, list.length > 1 ? Math.round((i * span) / (list.length - 1)) : span) }));
    compressed = { days: Math.max(0, dayDiff(today, dKey)), insteadOf: list[0].offset };
  }
  return { deadlineId: d.id, createdAt: now.toISOString(), compressed, tasks };
}

/** Moving the main deadline shifts every undone step by the same number of days. */
export function shiftPlan(plan: RadarPlan, days: number, isDone: (taskId: string) => boolean): RadarPlan {
  return { ...plan, tasks: plan.tasks.map((t) => (isDone(t.id) ? t : { ...t, day: addDayKey(t.day, days) })) };
}

export const planTaskItemId = (oppId: string, taskId: string) => `gen:radar:task:${oppId}:${taskId}`;
