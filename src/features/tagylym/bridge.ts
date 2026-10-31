import { z } from 'zod';
import { answerFormat, optText, type BridgeJob } from '../../core/bridge/bridge';
import { saveSetting } from '../../core/planner/store';
import { db } from '../../core/db/db';
import { CRITERIA } from './data/seed';
import type { KitOption, Weights } from './model/types';

/*
 * Idea Forge through the Claude Bridge (SPEC Module 3 › Brainstorm assistant; /ai/brainstorm is
 * replaced by a copy/paste round trip). Generate proposes new kits; Critique judges one option
 * against the criteria. Answers are checked with zod; ideas and critiques are kept until used.
 */

const ROLE =
  'You design low-cost robotics kits for grades 1–6 in Kazakhstan, for rural schools, in Kazakh and Russian. Be concrete. Label every price approximate. Never invent certifications — say what must be confirmed with an accredited lab.';

const crit = z.enum(['cost', 'durability', 'learningDepth', 'scalability', 'rural', 'teacherEffort', 'uniqueness']);
const s15 = z.number().int().min(1).max(5);

export const ideaSchema = z.object({
  name: z.string().trim().min(1),
  nameKk: optText(),
  nameRu: optText(),
  concept: z.string().trim().min(1),
  grades: z.tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)]),
  keyComponents: z.array(z.object({ name: z.string().min(1), qty: z.number().positive(), approxUSD: z.number().min(0) })).min(1),
  approxUnitCostUSD: z.number().min(0),
  manufacturing: z.string(),
  learningOutcomes: z.array(z.object({ grade: z.number().int().min(1).max(6), outcome: z.string() })),
  estimatedScores: z.object({ cost: s15, durability: s15, learningDepth: s15, scalability: s15, rural: s15, teacherEffort: s15, uniqueness: s15 }),
  biggestRisk: z.string(),
  firstExperiment: z.string(),
});
export const generateSchema = z.object({ ideas: z.array(ideaSchema).min(1).max(6) });
export type Idea = z.infer<typeof ideaSchema>;
export type Generate = z.infer<typeof generateSchema>;

export const critiqueSchema = z.object({
  optionId: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  criterionNotes: z.array(z.object({ criterion: crit, suggestedScore: s15, reason: z.string() })),
  killerQuestions: z.array(z.string()),
  cheapestTestThisWeek: z.string(),
  unknownsToConfirm: z.array(z.string()),
});
export type Critique = z.infer<typeof critiqueSchema>;

export interface Constraints {
  maxCostKZT?: number;
  grades: [number, number];
  screenFree: boolean;
  offlineOnly: boolean;
  materials: string[];
}

export const IDEAS = 'tagylym:ideas';
export const CRITIQUES = 'tagylym:critiques';

const summary = (o: KitOption) => ({ id: o.code, name: o.name, grades: [o.gradeMin, o.gradeMax], summary: o.concept.slice(0, 220), controller: o.controller ?? 'none' });

export function generateJob(prompt: string, c: Constraints, weights: Weights, options: KitOption[], fx: number, count = 3): BridgeJob<Generate> {
  const request = {
    mode: 'generate',
    idea: prompt || null,
    constraints: { ...c, maxCostKZT: c.maxCostKZT ?? null, maxCostUSD: c.maxCostKZT ? Math.round((c.maxCostKZT / fx) * 100) / 100 : null },
    criteria: CRITERIA.map((x) => ({ id: x.id, weight: weights[x.id], meaning: x.hint || x.label })),
    existingOptions: options.filter((o) => !o.isTeacherBox).map(summary),
    count,
  };
  return {
    id: 'tagylym.forge.generate',
    title: 'Idea Forge · Generate',
    intro: `Claude proposes ${count} new kit ideas within your constraints, with approximate parts, cost, learning outcomes and estimated scores. Add any of them as an option.`,
    prompt: [
      `# ${ROLE}`,
      `## Task\nPropose ${count} new low-cost robotics kit ideas that are clearly different from the existing options. Score each against the criteria 1–5 (cost and teacher effort: 5 = cheapest / least effort). Prices in USD, approximate (1 USD ≈ ${fx} ₸).`,
      `## Request\n${JSON.stringify(request, null, 1)}`,
      answerFormat(generateSchema, {
        ideas: [
          {
            name: 'Kite Sensor',
            nameKk: null,
            nameRu: null,
            concept: '…',
            grades: [3, 5],
            keyComponents: [{ name: 'TT gear motor', qty: 1, approxUSD: 0.9 }],
            approxUnitCostUSD: 6.5,
            manufacturing: '…',
            learningOutcomes: [{ grade: 3, outcome: '…' }],
            estimatedScores: { cost: 4, durability: 3, learningDepth: 3, scalability: 4, rural: 5, teacherEffort: 4, uniqueness: 4 },
            biggestRisk: '…',
            firstExperiment: '…',
          },
        ],
      }),
    ].join('\n\n'),
    schema: generateSchema,
    describe: (d) => `${d.ideas.length} idea${d.ideas.length === 1 ? '' : 's'}: ${d.ideas.map((i) => i.name).join(', ')}`,
    save: async (d) => {
      const prev = ((await db.settings.get(IDEAS))?.value ?? []) as (Idea & { id: string })[];
      await saveSetting(IDEAS, [...d.ideas.map((i) => ({ ...i, id: crypto.randomUUID() })), ...prev].slice(0, 30));
      return `${d.ideas.length} ideas saved below. Add the ones you like as options.`;
    },
  };
}

export function critiqueJob(target: KitOption, weights: Weights, options: KitOption[], fx: number, bomKZT: number): BridgeJob<Critique> {
  const request = {
    mode: 'critique',
    targetOptionId: target.code,
    target: {
      ...summary(target),
      concept: target.concept,
      bomApproxKZT: Math.round(bomKZT),
      bomApproxUSD: Math.round((bomKZT / fx) * 100) / 100,
      bom: target.bom.map((l) => ({ name: l.name, qty: l.qty })),
      lessons: target.lessonCount,
      risks: target.risks,
      currentScores: Object.fromEntries(CRITERIA.map((c) => [c.id, target.scores[c.id].value])),
    },
    criteria: CRITERIA.map((x) => ({ id: x.id, weight: weights[x.id], meaning: x.hint || x.label })),
    otherOptions: options.filter((o) => o.id !== target.id && !o.isTeacherBox).map(summary),
  };
  return {
    id: `tagylym.forge.critique.${target.id}`,
    title: `Idea Forge · Critique ${target.name}`,
    intro: 'Claude judges this option against your criteria: strengths, weaknesses, suggested score changes (you accept each one), the questions that could kill it, and the cheapest test this week.',
    prompt: [
      `# ${ROLE}`,
      `## Task\nCritique the target option honestly. For criterionNotes, include only criteria where you would change the current score, with a one-sentence reason. Set optionId to "${target.code}".`,
      `## Request\n${JSON.stringify(request, null, 1)}`,
      answerFormat(critiqueSchema, {
        optionId: target.code,
        strengths: ['…'],
        weaknesses: ['…'],
        criterionNotes: [{ criterion: 'rural', suggestedScore: 4, reason: '…' }],
        killerQuestions: ['…'],
        cheapestTestThisWeek: '…',
        unknownsToConfirm: ['…'],
      }),
    ].join('\n\n'),
    schema: critiqueSchema,
    check: (d) => (d.optionId === target.code ? [] : [`optionId must be "${target.code}"`]),
    describe: (d) => `${d.strengths.length} strengths, ${d.weaknesses.length} weaknesses, ${d.criterionNotes.length} suggested score change${d.criterionNotes.length === 1 ? '' : 's'}`,
    save: async (d) => {
      const prev = ((await db.settings.get(CRITIQUES))?.value ?? {}) as Record<string, Critique & { at: string }>;
      await saveSetting(CRITIQUES, { ...prev, [target.id]: { ...d, at: new Date().toISOString() } });
      return 'Critique saved below. Accept the score changes you agree with.';
    },
  };
}

/** An idea as a new option: scores marked "AI estimate" until edited; parts priced as estimates. */
export function optionFromIdea(idea: Idea, code: string): KitOption {
  const iso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    code,
    name: idea.name,
    nameKk: idea.nameKk,
    nameRu: idea.nameRu,
    concept: `${idea.concept}\n\nBiggest risk: ${idea.biggestRisk}\nFirst experiment: ${idea.firstExperiment}`,
    gradeMin: Math.min(...idea.grades),
    gradeMax: Math.max(...idea.grades),
    outcomes: idea.learningOutcomes.map((l) => ({ grade: l.grade, text: l.outcome })),
    bom: idea.keyComponents.map((k) => ({ name: k.name, qty: k.qty, unitCost: k.qty ? k.approxUSD / k.qty : k.approxUSD, currency: 'USD' as const, isEstimate: true, checkedAt: iso.slice(0, 10) })),
    manufacturing: { method: idea.manufacturing, moq: 100, fixedCostsKZT: 0, supplierNotes: 'From Idea Forge; MOQ to confirm.' },
    packaging: '',
    curriculum: [],
    lessonCount: 0,
    softwareNeeds: '',
    safetyNotes: [{ regulation: 'TR CU 008/2011 (toys)', text: 'Certification route to confirm with an accredited lab.', toConfirm: true }],
    risks: [idea.biggestRisk],
    scores: Object.fromEntries(CRITERIA.map((c) => [c.id, { value: idea.estimatedScores[c.id], aiEstimate: true }])) as KitOption['scores'],
    prices: {},
    status: 'exploring',
    source: 'ai',
    isTeacherBox: false,
    sellAsTeacherBox: false,
    createdAt: iso,
    updatedAt: iso,
  };
}
