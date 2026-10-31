import { useMemo } from 'react';
import { db } from '../../../core/db/db';
import { saveLocal } from '../../../core/db/sync';
import { useLive } from '../../../core/db/useLive';
import { saveSetting, useSetting } from '../../../core/planner/store';
import type { BomItem, BuildStep, Competition, DeviceSettings, FrostSettings, MediaAsset, Run, Sample } from '../model/types';
import { assetSync, assetsTable, bomSync, bomTable, compSync, compsTable, runSync, runsTable, stepSync, stepsTable } from './db';
import { DEFAULT_DEVICE, DEFAULT_SETTINGS, PHASES, SEED_ASSETS, SEED_BOM, SEED_COMPS, SEED_STEPS } from './seed';

// Reading and changing FrostPure data. Every write goes through saveLocal(), so it syncs.

const SEEDED = 'frostpure:seeded';
const SETTINGS = 'frostpure:settings';
const DEVICE = 'frostpure:device';

export async function seedIfNeeded(): Promise<void> {
  if ((await db.settings.get(SEEDED))?.value === true || (await bomTable.count()) > 0) return;
  for (const b of SEED_BOM) await saveLocal(bomSync, b);
  for (const s of SEED_STEPS) await saveLocal(stepSync, s);
  for (const a of SEED_ASSETS) await saveLocal(assetSync, a);
  for (const c of SEED_COMPS) await saveLocal(compSync, c);
  await saveSetting(SEEDED, true);
}

// ---------- Live data ----------

export interface FrostData {
  loaded: boolean;
  assets: MediaAsset[];
  bom: BomItem[];
  steps: BuildStep[];
  runs: Run[];
  comps: Competition[];
}

const EMPTY: FrostData = { loaded: false, assets: [], bom: [], steps: [], runs: [], comps: [] };
const alive = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

export function useFrostData(): FrostData {
  return useLive(
    async () => ({
      loaded: true,
      assets: alive(await assetsTable.toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      bom: alive(await bomTable.toArray()).sort((a, b) => a.order - b.order),
      steps: alive(await stepsTable.toArray()).sort((a, b) => a.order - b.order),
      runs: alive(await runsTable.toArray()).sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt)),
      comps: alive(await compsTable.toArray()),
    }),
    [],
    EMPTY,
  );
}

export const useBomMap = (bom: BomItem[]) => useMemo(() => new Map(bom.map((b) => [b.id, b])), [bom]);

export function useFrostSettings(): FrostSettings {
  const saved = useSetting<Partial<FrostSettings>>(SETTINGS, {});
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...saved }), [saved]);
}
export const saveFrostSettings = (s: FrostSettings) => saveSetting(SETTINGS, s);

export function useDevice(): DeviceSettings {
  const saved = useSetting<Partial<DeviceSettings>>(DEVICE, {});
  return useMemo(() => ({ ...DEFAULT_DEVICE, ...saved }), [saved]);
}
export const saveDevice = (d: DeviceSettings) => saveSetting(DEVICE, d);

const stamp = <T extends { updatedAt: string }>(row: T): T => ({ ...row, updatedAt: new Date().toISOString() });

// ---------- Writes ----------

export const saveBom = (b: BomItem) => saveLocal(bomSync, stamp(b));
export const saveStep = (s: BuildStep) => saveLocal(stepSync, stamp(s));
export const saveAsset = (a: MediaAsset) => saveLocal(assetSync, stamp(a));
export const saveRun = (r: Run) => saveLocal(runSync, stamp(r));
export const saveComp = (c: Competition) => saveLocal(compSync, stamp(c));

export async function removeRow<T extends { updatedAt: string; deletedAt?: string }>(save: (r: T) => Promise<void>, row: T): Promise<void> {
  await save({ ...row, deletedAt: new Date().toISOString() });
}

export function newAsset(kind: MediaAsset['kind'], title: string, extra: Partial<MediaAsset> = {}): MediaAsset {
  const iso = new Date().toISOString();
  return { id: crypto.randomUUID(), title, kind, tags: [], notes: '', pinned: false, versions: [], photos: [], chapters: [], linkedBomIds: [], linkedStepIds: [], linkedRunIds: [], createdAt: iso, updatedAt: iso, ...extra };
}

/** A new version is max(number) + 1 and becomes current. */
export function addVersion(a: MediaAsset, v: { note: string; url?: string; byteSize?: number; durationSec?: number }): MediaAsset {
  const number = Math.max(0, ...a.versions.map((x) => x.number)) + 1;
  const version = { id: crypto.randomUUID(), number, createdAt: new Date().toISOString(), ...v };
  return { ...a, versions: [...a.versions, version], currentVersionId: version.id };
}

/** Deleting the current version moves "current" to the newest remaining one. */
export function deleteVersion(a: MediaAsset, versionId: string): MediaAsset {
  const versions = a.versions.filter((v) => v.id !== versionId);
  const current = a.currentVersionId === versionId ? [...versions].sort((x, y) => y.number - x.number)[0]?.id : a.currentVersionId;
  return { ...a, versions, currentVersionId: current };
}

export const currentVersion = (a: MediaAsset) => a.versions.find((v) => v.id === a.currentVersionId) ?? [...a.versions].sort((x, y) => y.number - x.number)[0];

export function newRun(fields: Partial<Run> = {}): Run {
  const iso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'New run',
    rig: 'lab',
    status: 'planned',
    feedSalinityGL: 4,
    feedVolumeL: 15,
    plannedAmbientC: -10,
    plannedFreezeHours: 16,
    targetFrozenPct: 65,
    drainRule: { kind: 'targetIce', value: 65 },
    sweatEnabled: false,
    variable: 'salinity',
    hypothesis: '',
    tdsK: 0.64,
    phases: PHASES.map((p) => ({ id: p.id, timerMin: p.timerMin, checklist: p.checklist.map((text, i) => ({ id: `${p.id}-${i + 1}`, text, done: false })) })),
    samples: [],
    moments: [],
    notes: '',
    createdAt: iso,
    updatedAt: iso,
    ...fields,
  };
}

export async function addSample(run: Run, s: Omit<Sample, 'id'>): Promise<void> {
  await saveRun({ ...run, samples: [...run.samples, { ...s, id: crypto.randomUUID() }].sort((a, b) => a.at.localeCompare(b.at)) });
}
