import { almatyDayKey } from '../../../core/planner/time';
import { addDayKey, dayDiff, safeDayKey } from '../../radar/engine/time';
import type { BomItem, BuildStep, Competition, CompPhase, Run } from '../model/types';

/*
 * Compete and Build helpers (SPEC Module 2 › 2 and 5).
 *   wordCount            what the Brief word counters count
 *   bomTotals            have / ordered / need and the money still to spend (₸, approximate)
 *   stepUnlocked         a build step is open once all its parts are "have"
 *   guidedPath           "What to do this week": at most 3 tasks, computed locally and deterministic:
 *                        latestStart = deadline − 7-day buffer − Σ remaining effort along the
 *                        dependency chain (2 h of work per day); sort by slack, then judging weight,
 *                        then how many other tasks it unblocks.
 */

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

export interface BomTotals {
  have: number;
  ordered: number;
  need: number;
  stillToBuyKZT: number; // need items
  orderedKZT: number;
  totalKZT: number; // every priced item
}

export function bomTotals(items: BomItem[]): BomTotals {
  const live = items.filter((i) => !i.deletedAt);
  const sum = (list: BomItem[]) => list.reduce((s, i) => s + (i.unitPriceKZT ?? 0) * i.qty, 0);
  return {
    have: live.filter((i) => i.status === 'have').length,
    ordered: live.filter((i) => i.status === 'ordered').length,
    need: live.filter((i) => i.status === 'need').length,
    stillToBuyKZT: sum(live.filter((i) => i.status === 'need')),
    orderedKZT: sum(live.filter((i) => i.status === 'ordered')),
    totalKZT: sum(live),
  };
}

export const nextStatus = (s: BomItem['status']): BomItem['status'] => (s === 'need' ? 'ordered' : s === 'ordered' ? 'have' : 'need');

export function stepUnlocked(step: BuildStep, bom: Map<string, BomItem>): { open: boolean; missing: BomItem[] } {
  const missing = step.requiredBomIds.map((id) => bom.get(id)).filter((i): i is BomItem => !!i && !i.deletedAt && i.status !== 'have');
  return { open: missing.length === 0, missing };
}

/** "Brief 4/10 sections": a section counts once it has words and is within its limit. */
export function briefProgress(phase: CompPhase): { done: number; total: number; words: number; limit: number } {
  const brief = phase.requirements.filter((r) => r.kind === 'brief');
  const words = brief.reduce((s, r) => s + wordCount(r.text ?? ''), 0);
  return {
    done: brief.filter((r) => r.doneAt || (wordCount(r.text ?? '') > 0 && wordCount(r.text ?? '') <= (r.wordLimit ?? Infinity))).length,
    total: brief.length,
    words,
    limit: brief.reduce((s, r) => s + (r.wordLimit ?? 0), 0),
  };
}

/** The next phase with an upcoming deadline that is not done. */
export function currentPhase(c: Competition, now: Date): CompPhase | undefined {
  const today = almatyDayKey(now);
  return c.phases.find((p) => !p.doneAt && p.deadline && safeDayKey(p.deadline) >= today);
}

export interface WeekTask {
  id: string;
  title: string;
  reason: string;
  slack: number; // days
  link: string;
}

const HOURS_PER_DAY = 2;
const BUFFER_DAYS = 7;
const RUN_HOURS = 6;

interface Node {
  id: string;
  title: string;
  deadline: string; // Almaty day
  hours: number;
  weight: number;
  deps: string[];
  link: string;
  reason: (slack: number) => string;
}

export function guidedPath(comps: Competition[], steps: BuildStep[], runs: Run[], bom: Map<string, BomItem>, now: Date, max = 3): WeekTask[] {
  const today = almatyDayKey(now);
  const doneRuns = runs.filter((r) => !r.deletedAt && r.status === 'done').length;
  const nodes = new Map<string, Node>();
  const conrad = comps.find((c) => c.id === 'comp-conrad-2026-27' && !c.deletedAt);
  const labDay = conrad?.milestones.find((m) => m.id === 'lab-runs' && !m.doneAt)?.day;

  // Build steps lead to the lab runs.
  const openSteps = steps.filter((s) => !s.deletedAt && !s.doneAt).sort((a, b) => a.order - b.order);
  openSteps.forEach((s, i) => {
    const lock = stepUnlocked(s, bom);
    nodes.set(`step:${s.id}`, {
      id: `step:${s.id}`,
      title: `Build: ${s.title}`,
      deadline: labDay ?? addDayKey(today, 30),
      hours: s.estMinutes / 60,
      weight: 20,
      deps: i > 0 ? [`step:${openSteps[i - 1].id}`] : [],
      link: '/frostpure/build',
      reason: (slack) => (lock.open ? `Next build step; the lab runs depend on it (${slack} days of slack).` : `Order the missing parts first: ${lock.missing.map((m) => m.name).slice(0, 2).join(', ')}.`),
    });
  });

  // Runs still needed (Key Metrics wants 3).
  const runsNeeded = Math.max(0, 3 - doneRuns);
  for (let k = 0; k < runsNeeded; k++) {
    const id = `run:${doneRuns + k + 1}`;
    nodes.set(id, {
      id,
      title: `Lab run ${doneRuns + k + 1} of 3`,
      deadline: labDay ?? addDayKey(today, 30),
      hours: RUN_HOURS,
      weight: 30,
      deps: [k > 0 ? `run:${doneRuns + k}` : openSteps.length ? `step:${openSteps[openSteps.length - 1].id}` : ''].filter(Boolean),
      link: '/frostpure/lab',
      reason: () => `Key Metrics needs data from 3 runs; ${runsNeeded} still to do.`,
    });
  }

  // Open requirements of each competition's current phase.
  for (const c of comps) {
    if (c.deletedAt || c.status === 'watching' || c.status === 'done') continue;
    const phase = currentPhase(c, now);
    if (!phase?.deadline) continue;
    const deadline = safeDayKey(phase.deadline);
    for (const r of phase.requirements) {
      if (r.doneAt) continue;
      const words = wordCount(r.text ?? '');
      if (r.kind === 'brief' && words > 0 && words <= (r.wordLimit ?? Infinity)) continue; // drafted
      const runDep = r.dependsOn.find((d) => d.startsWith('runs:'));
      const needRuns = runDep ? Math.max(0, Number(runDep.slice(5)) - doneRuns) : 0;
      const deps = r.dependsOn.filter((d) => !d.startsWith('runs:')).map((d) => `req:${c.id}:${d}`);
      if (needRuns > 0) deps.push(`run:${doneRuns + needRuns}`);
      nodes.set(`req:${c.id}:${r.id}`, {
        id: `req:${c.id}:${r.id}`,
        title: r.kind === 'brief' ? `Brief: ${r.title}` : r.title,
        deadline,
        hours: r.estHours,
        weight: r.weight,
        deps,
        link: `/frostpure/compete/${encodeURIComponent(c.id)}`,
        reason: (slack) =>
          r.kind === 'brief'
            ? `${r.title} is ${r.wordLimit} words${needRuns ? ` and needs data from ${runDep!.slice(5)} runs. ${needRuns} run${needRuns === 1 ? '' : 's'} left` : ''}. Start by ${addDayKey(today, Math.max(0, slack))}.`
            : `${c.name} ${phase.name}: ${slack} days of slack.`,
      });
    }
  }

  // Effort along each dependency chain (memoised), then latest start and slack.
  const chain = new Map<string, number>();
  const effort = (id: string, seen = new Set<string>()): number => {
    if (chain.has(id)) return chain.get(id)!;
    const n = nodes.get(id);
    if (!n || seen.has(id)) return 0;
    seen.add(id);
    const e = n.hours + Math.max(0, ...n.deps.map((d) => effort(d, seen)));
    chain.set(id, e);
    return e;
  };
  const blocking = (id: string) => [...nodes.values()].filter((n) => n.deps.includes(id)).length;
  const ready = (n: Node) => n.deps.every((d) => !nodes.has(d)); // nothing it waits for is still open

  return [...nodes.values()]
    .filter(ready)
    .map((n) => {
      const latestStart = addDayKey(n.deadline, -BUFFER_DAYS - Math.ceil(effort(n.id) / HOURS_PER_DAY));
      const slack = dayDiff(today, latestStart);
      return { n, slack };
    })
    .sort((a, b) => a.slack - b.slack || b.n.weight - a.n.weight || blocking(b.n.id) - blocking(a.n.id) || a.n.id.localeCompare(b.n.id))
    .slice(0, max)
    .map(({ n, slack }) => ({ id: n.id, title: n.title, reason: n.reason(slack), slack, link: n.link }));
}
