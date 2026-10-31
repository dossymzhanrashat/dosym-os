import { useMemo } from 'react';
import { db } from '../../../core/db/db';
import { saveLocal } from '../../../core/db/sync';
import { useLive } from '../../../core/db/useLive';
import { saveSetting, useSetting } from '../../../core/planner/store';
import { almatyDayKey } from '../../../core/planner/time';
import { backward, makeStages } from '../engine/pipeline';
import type { DecisionRecord, EconInputs, FxSetting, KitOption, KitProject, Weights } from '../model/types';
import { decisionSync, decisionsTable, optionSync, optionsTable, projectSync, projectsTable } from './db';
import { DEFAULT_ECON, DEFAULT_FX, DEFAULT_WEIGHTS, SEED_OPTIONS } from './seed';

// Reading and changing Tagylym data. Every write goes through saveLocal(), so it syncs.

const SEEDED = 'tagylym:seeded';
const WEIGHTS = 'tagylym:weights';
const PRESETS = 'tagylym:presets';
const FX = 'tagylym:fx';
const ECON = 'tagylym:econ'; // per option id
const AUTO_COST = 'tagylym:autoCost';

export async function seedIfNeeded(): Promise<void> {
  if ((await db.settings.get(SEEDED))?.value === true || (await optionsTable.count()) > 0) return;
  for (const o of SEED_OPTIONS) await saveLocal(optionSync, o);
  await saveSetting(SEEDED, true);
}

export interface TgData {
  loaded: boolean;
  options: KitOption[];
  decisions: DecisionRecord[];
  projects: KitProject[];
}

const alive = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

export function useTgData(): TgData {
  return useLive<TgData>(
    async () => ({
      loaded: true,
      options: alive(await optionsTable.toArray()).sort((a, b) => a.code.localeCompare(b.code)),
      decisions: alive(await decisionsTable.toArray()).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
      projects: alive(await projectsTable.toArray()),
    }),
    [],
    { loaded: false, options: [], decisions: [], projects: [] },
  );
}

export const activeProject = (d: TgData) => d.projects.find((p) => !p.archived);
export const activeDecision = (d: TgData) => d.decisions.find((x) => !x.archived);

export function useWeights(): Weights {
  const saved = useSetting<Partial<Weights>>(WEIGHTS, {});
  return useMemo(() => ({ ...DEFAULT_WEIGHTS, ...saved }), [saved]);
}
export const saveWeights = (w: Weights) => saveSetting(WEIGHTS, w);

const NO_PRESETS: { name: string; weights: Weights }[] = [];
export const useCustomPresets = () => useSetting(PRESETS, NO_PRESETS);
export const saveCustomPresets = (p: { name: string; weights: Weights }[]) => saveSetting(PRESETS, p);

export const useAutoCost = () => useSetting(AUTO_COST, false);
export const saveAutoCost = (on: boolean) => saveSetting(AUTO_COST, on);

export function useFx(): FxSetting {
  const saved = useSetting<Partial<FxSetting>>(FX, {});
  return useMemo(() => ({ ...DEFAULT_FX, ...saved }), [saved]);
}
/** Changing the rate keeps the old one in the history log (SPEC › Edge cases). */
export async function saveFx(current: FxSetting, rate: number): Promise<void> {
  const today = almatyDayKey(new Date());
  await saveSetting(FX, { usdToKzt: rate, updatedAt: today, history: [{ rate: current.usdToKzt, until: today }, ...current.history].slice(0, 20) } satisfies FxSetting);
}

const NO_ECON: Record<string, Partial<EconInputs>> = {};
export function useEcon(optionId: string): EconInputs {
  const all = useSetting(ECON, NO_ECON);
  return useMemo(() => ({ ...DEFAULT_ECON, ...all[optionId] }), [all, optionId]);
}
export async function saveEcon(optionId: string, e: EconInputs): Promise<void> {
  const all = ((await db.settings.get(ECON))?.value ?? {}) as Record<string, Partial<EconInputs>>;
  await saveSetting(ECON, { ...all, [optionId]: e });
}

const stamp = <T extends { updatedAt: string }>(r: T): T => ({ ...r, updatedAt: new Date().toISOString() });
export const saveOption = (o: KitOption) => saveLocal(optionSync, stamp(o));
export const saveProject = (p: KitProject) => saveLocal(projectSync, stamp(p));
export const saveDecision = (d: DecisionRecord) => saveLocal(decisionSync, stamp(d));

export interface SettleInput {
  winner: KitOption;
  runnerUp?: KitOption;
  weights: Weights;
  scores: Record<string, number>;
  robustness: number;
  reason: string;
  mode: 'forward' | 'backward';
  anchor: string; // start (forward) or launch (backward)
  compress: boolean;
}

/** "Settle on one": a DecisionRecord, the winner active, the others parked, a KitProject with 11 stages. */
export async function settle(all: KitOption[], s: SettleInput): Promise<KitProject> {
  if (s.reason.trim().length < 20) throw new Error('Write at least 20 characters on why.');
  const iso = new Date().toISOString();
  const decision: DecisionRecord = {
    id: crypto.randomUUID(),
    winnerId: s.winner.id,
    runnerUpId: s.runnerUp?.id,
    weights: s.weights,
    scores: s.scores,
    robustness: s.robustness,
    reason: s.reason.trim(),
    decidedAt: iso,
    archived: false,
    updatedAt: iso,
  };
  await saveLocal(decisionSync, decision);
  for (const o of all) {
    if (o.deletedAt || o.isTeacherBox) continue;
    const status = o.id === s.winner.id ? 'active' : 'parked';
    if (o.status !== status) await saveOption({ ...o, status });
  }
  const today = almatyDayKey(new Date());
  const plan = s.mode === 'backward' ? backward(s.anchor, today, s.compress) : undefined;
  const project: KitProject = {
    id: crypto.randomUUID(),
    optionId: s.winner.id,
    decisionId: decision.id,
    mode: s.mode,
    anchorDate: s.anchor,
    stages: plan ? makeStages(plan.start, plan.days) : makeStages(s.anchor),
    archived: false,
    updatedAt: iso,
  };
  await saveLocal(projectSync, project);
  return project;
}

/** "Reopen decision": archives the record (and the project, unless its work is kept). */
export async function reopen(d: TgData, keepProject: boolean): Promise<void> {
  const dec = activeDecision(d);
  if (dec) await saveDecision({ ...dec, archived: true });
  const p = activeProject(d);
  if (p && !keepProject) await saveProject({ ...p, archived: true });
  for (const o of d.options) if (!o.isTeacherBox && o.status !== 'exploring') await saveOption({ ...o, status: 'exploring' });
}
