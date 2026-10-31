import { describe, expect, it } from 'vitest';
import { DEFAULT_ECON, DEFAULT_WEIGHTS, SEED_OPTIONS } from '../data/seed';
import type { KitOption, Weights } from '../model/types';
import { canMerge, CLOSE_CALL, costAutoScore, mergeOptions, rank, robustness, score } from './decide';
import { bomTotal, fxSensitivity, ladder, landed, MARGIN_FLAG, net, summary, to990 } from './econ';
import { backward, daysToLaunch, gate, makeStages, rippleDays, spreadDue, STAGES } from './pipeline';

const FX = 450;
const byCode = (c: string) => SEED_OPTIONS.find((o) => o.code === c)!;

describe('seed', () => {
  it('has A–D as options and E as the Teacher Box modifier, every price an estimate', () => {
    expect(SEED_OPTIONS.map((o) => o.code)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(SEED_OPTIONS.filter((o) => o.isTeacherBox).map((o) => o.code)).toEqual(['E']);
    expect(SEED_OPTIONS.flatMap((o) => o.bom).every((l) => l.isEstimate && l.checkedAt === '2026-10-30')).toBe(true);
  });

  it('BOM totals match the spec at 450 ₸ = $1', () => {
    expect(bomTotal(byCode('A').bom, FX).kzt).toBeCloseTo(3.3 * FX, 6); // $3.30 → 1,485 ₸
    expect(bomTotal(byCode('B').bom, FX).kzt).toBeCloseTo(19.8 * FX, 6);
    expect(bomTotal(byCode('C').bom, FX).kzt).toBeCloseTo(20.1 * FX, 6);
    expect(bomTotal(byCode('D').bom, FX).kzt).toBeCloseTo(23.2 * FX, 6);
    expect(bomTotal(byCode('E').bom, FX).kzt).toBe(35000); // spares + batteries + crate + guide
    expect(bomTotal([{ name: 'x', qty: 1, unitCost: 0, currency: 'KZT', isEstimate: true }], FX).incomplete).toBe(true);
  });
});

describe('decision matrix', () => {
  it('default weights give D ~73, B ~72, A ~66, C ~54 (the spec’s seeds), E not ranked', () => {
    const r = rank(SEED_OPTIONS, DEFAULT_WEIGHTS);
    expect(r.map((x) => x.option.code)).toEqual(['D', 'B', 'A', 'C']);
    expect(r.map((x) => Math.round(x.score))).toEqual([73, 72, 66, 54]);
    expect(r[0].score - r[1].score).toBeLessThan(CLOSE_CALL); // "Close call"
    // the stacked bar parts add up to the score
    expect(r[0].parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(r[0].score, 10);
  });

  it('ties break by rural suitability, then cost, deterministically', () => {
    const mk = (code: string, rural: number, cost: number): KitOption => ({ ...byCode('A'), id: code, code, scores: { ...byCode('A').scores, rural: { value: rural }, cost: { value: cost } } });
    const onlyOther = { cost: 0, durability: 1, learningDepth: 0, scalability: 0, rural: 0, teacherEffort: 0, uniqueness: 0 } as Weights;
    expect(rank([mk('X', 3, 5), mk('Y', 4, 1), mk('Z', 4, 2)], onlyOther).map((r) => r.option.code)).toEqual(['Z', 'Y', 'X']);
    expect(score(byCode('A'), { ...onlyOther, durability: 0 })).toBe(0); // all weights zero
  });

  it('robustness is a share between 0 and 1 and repeatable', () => {
    const a = robustness(SEED_OPTIONS, DEFAULT_WEIGHTS);
    expect(a).toBeGreaterThan(0.3);
    expect(a).toBeLessThan(1);
    expect(robustness(SEED_OPTIONS, DEFAULT_WEIGHTS)).toBe(a);
    const t0 = performance.now();
    robustness(SEED_OPTIONS, DEFAULT_WEIGHTS);
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('cost auto-score thresholds and merge for a shared controller', () => {
    expect([2999, 5000, 9000, 15000, 25000].map(costAutoScore)).toEqual([5, 4, 3, 2, 1]);
    expect(canMerge(byCode('B'), byCode('D'))).toBe(true);
    expect(canMerge(byCode('A'), byCode('D'))).toBe(false);
    const m = mergeOptions(byCode('D'), byCode('B'), new Date('2026-11-01T00:00:00Z'));
    expect(m.code).toBe('D+B');
    expect(m.source).toBe('merge');
    expect(m.bom.some((l) => l.name.includes('HC-SR04'))).toBe(true);
    expect(m.bom.filter((l) => /esp32/i.test(l.name))).toHaveLength(1); // one controller
    expect(Object.values(m.scores).every((s) => s.aiEstimate)).toBe(true);
  });
});

describe('unit economics', () => {
  it('landed cost applies defect and duty (16 %)', () => {
    const e = { ...DEFAULT_ECON, freightKZT: 100, defectPct: 5 };
    expect(landed(byCode('A'), e, FX)).toBeCloseTo((1485 + 100) * 1.05 * 1.16, 6);
  });

  it('net per channel: Kaspi fee 12.5 % and 1,699 ₸ delivery on B2C only', () => {
    const L = 1000;
    expect(net(4990, 'b2c', L, DEFAULT_ECON)).toBeCloseTo(4990 * 0.875 - 1699 - L, 6);
    expect(net(3500, 'b2b', L, DEFAULT_ECON)).toBe(2500);
    expect(net(4990, 'b2c', L, { ...DEFAULT_ECON, unitsPerOrder: 2 })).toBeCloseTo(4990 * 0.875 - 849.5 - L, 6);
  });

  it('price ladder rules, x,990 rounding and the 30 % flag', () => {
    expect([4375, 4990, 24875].map(to990)).toEqual([4990, 4990, 24990]);
    const a = ladder(byCode('A'), SEED_OPTIONS, DEFAULT_ECON, FX);
    expect(a.landed).toBeCloseTo(1485 * 1.16, 6);
    const grant = a.tiers.find((t) => t.id === 'grant')!;
    expect(grant.ladder).toBe(Math.round(a.landed * 1.5));
    expect(grant.price).toBe(2500); // the option's own target wins
    // Qagaz B2C: 4,990 × 0.875 − 1,699 − 1,722.6 ≈ 945 → 19 % → amber
    const b2c = a.tiers.find((t) => t.id === 'b2c')!;
    expect(b2c.margin).toBeLessThan(MARGIN_FLAG);
    expect(b2c.flag).toBe(true);
    expect(a.tiers.find((t) => t.id === 'b2b')!.flag).toBe(false);
  });

  it('Teacher Box tier appears when toggled; break-even and first-batch cash', () => {
    const b = { ...byCode('B'), sellAsTeacherBox: true, manufacturing: { ...byCode('B').manufacturing, fixedCostsKZT: 500000 } };
    const t = ladder(b, SEED_OPTIONS, DEFAULT_ECON, FX).tiers.find((x) => x.id === 'teacherBox')!;
    expect(t.price).toBe(229000);
    expect(t.net).toBeCloseTo(229000 - (6 * landed(b, DEFAULT_ECON, FX) + 12 * landed(byCode('A'), DEFAULT_ECON, FX) + 35000), 6);
    const s = summary(b, DEFAULT_ECON, FX);
    expect(s.breakEven).toBe(Math.ceil(500000 / (19900 - s.landed)));
    expect(s.firstBatchCash).toBeCloseTo(100 * s.landed + 500000, 6);
  });

  it('fx sensitivity: margin falls as the tenge weakens', () => {
    const rows = fxSensitivity(byCode('B'), DEFAULT_ECON);
    expect(rows.map((r) => r.fx)).toEqual([420, 430, 440, 450, 460, 470, 480, 490, 500, 510, 520]);
    expect(rows[0].b2b).toBeGreaterThan(rows.at(-1)!.b2b);
  });
});

describe('pipeline', () => {
  it('forward: 11 stages back to back from the start', () => {
    const s = makeStages('2026-11-02');
    expect(s).toHaveLength(11);
    expect(s[0]).toMatchObject({ kind: 'research', start: '2026-11-02', end: '2026-11-15' });
    expect(s[1].start).toBe('2026-11-16');
    for (let i = 1; i < s.length; i++) expect(s[i].start > s[i - 1].end).toBe(true);
    expect(s.find((x) => x.kind === 'certification')!.days).toBe(45);
    // checklist items are spread evenly; the last one is on the stage end
    expect(s[0].checklist.map((c) => c.due)).toEqual(spreadDue('2026-11-02', '2026-11-15', 3));
    expect(s[0].checklist.at(-1)!.due).toBe('2026-11-15');
  });

  it('backward: warns when the start is in the past, compresses to fit, or gives the earliest launch', () => {
    const full = daysToLaunch(STAGES.map((x) => x.days)); // 221 days to the end of Launch
    expect(full).toBe(221);
    const ok = backward('2027-09-01', '2026-11-02', false);
    expect(ok.shortBy).toBe(0);
    const tight = backward('2027-05-01', '2026-11-02', false);
    expect(tight.shortBy).toBeGreaterThan(0);
    const fit = backward('2027-05-01', '2026-11-02', true);
    expect(fit.compressed).toBe(true);
    expect(fit.earliestLaunch).toBeUndefined();
    expect(daysToLaunch(fit.days)).toBe(181); // Nov 2 → May 1 inclusive
    expect(fit.days.every((d, i) => d >= Math.ceil(STAGES[i].days * 0.5))).toBe(true);
    const impossible = backward('2027-01-01', '2026-11-02', true);
    expect(impossible.earliestLaunch).toBe('2027-02-22'); // 50 % of every stage up to Launch = 113 days
  });

  it('stage gate needs required items and deliverable links (or an override)', () => {
    const [s] = makeStages('2026-11-02');
    expect(gate(s).ok).toBe(false);
    const done = { ...s, checklist: s.checklist.map((c) => ({ ...c, done: true })), deliverables: s.deliverables.map((d) => ({ ...d, link: 'https://x' })) };
    expect(gate(done)).toEqual({ ok: true, missing: [] });
  });

  it('changing a stage length ripples the later stages', () => {
    const s = makeStages('2026-11-02');
    const r = rippleDays(s, 0, 20);
    expect(r[0].end).toBe('2026-11-21');
    expect(r[1].start).toBe('2026-11-22');
    expect(r[1].checklist[0].id).toBe(s[1].checklist[0].id);
  });
});

describe('Idea Forge (Claude Bridge)', async () => {
  const { checkAnswer } = await import('../../../core/bridge/bridge');
  const { critiqueJob, generateJob, optionFromIdea } = await import('../bridge');
  const constraints = { grades: [1, 6] as [number, number], screenFree: true, offlineOnly: true, materials: ['cardboard'], maxCostKZT: 10000 };
  const idea = {
    name: 'Yurt Sorter',
    nameKk: null,
    nameRu: null,
    concept: 'A cardboard sorting arm.',
    grades: [2, 4],
    keyComponents: [{ name: 'SG90 servo', qty: 2, approxUSD: 2.6 }],
    approxUnitCostUSD: 5,
    manufacturing: 'Local print shop',
    learningOutcomes: [{ grade: 2, outcome: 'Sorting by colour' }],
    estimatedScores: { cost: 4, durability: 2, learningDepth: 3, scalability: 4, rural: 5, teacherEffort: 4, uniqueness: 4 },
    biggestRisk: 'Servo jitter',
    firstExperiment: 'Build one with 3 kids',
  };

  it('generate decodes into the schema; an idea becomes an option marked AI estimate', () => {
    const job = generateJob('sorting', constraints, DEFAULT_WEIGHTS, SEED_OPTIONS, FX);
    expect(job.prompt).toContain('"maxCostUSD": 22.22');
    const r = checkAnswer(job, JSON.stringify({ ideas: [idea] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = optionFromIdea(r.data.ideas[0], 'AI-1');
    expect(o.source).toBe('ai');
    expect(Object.values(o.scores).every((s) => s.aiEstimate)).toBe(true);
    expect(o.bom[0]).toMatchObject({ qty: 2, unitCost: 1.3, currency: 'USD', isEstimate: true });
    expect(checkAnswer(job, JSON.stringify({ ideas: [{ ...idea, estimatedScores: { ...idea.estimatedScores, cost: 7 } }] })).ok).toBe(false);
  });

  it('critique decodes and must name the target option', () => {
    const job = critiqueJob(byCode('B'), DEFAULT_WEIGHTS, SEED_OPTIONS, FX, 8910);
    const answer = { optionId: 'B', strengths: ['Offline editor'], weaknesses: ['Cheap phones'], criterionNotes: [{ criterion: 'rural', suggestedScore: 3, reason: 'Needs a phone' }], killerQuestions: ['?'], cheapestTestThisWeek: 'Try 3 phones', unknownsToConfirm: ['EMC'] };
    expect(checkAnswer(job, JSON.stringify(answer)).ok).toBe(true);
    expect(checkAnswer(job, JSON.stringify({ ...answer, optionId: 'D' }))).toEqual({ ok: false, problems: ['optionId must be "B"'] });
  });
});
