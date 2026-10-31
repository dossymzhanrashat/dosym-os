import type { Run, Sample, SamplePoint } from '../model/types';

/*
 * The physics the lab uses (SPEC Module 2 › 3. Experiment lab), all pure and unit-tested.
 *   Salt rejection   R  = 1 − C_ice / C_feed
 *   Recovery         Y  = V_clean / V_feed
 *   Brine factor     CF = C_brine / C_feed
 *   Mass balance     C_feed·V_feed ≈ C_ice·V_clean + C_brine·V_brine + C_sweat·V_sweat (flag > 15 %)
 *   EC → TDS         TDS (mg/L) ≈ k · EC (µS/cm), default k = 0.64
 *   Temperature      EC25 = EC_T / (1 + 0.02·(T − 25))
 *   Ice depth        deepest probe below −0.3 °C; f_ice = depth / water depth
 *   Heat removed     Q = m·(c_w·ΔT + L_f), c_w ≈ 4.19 kJ/kg·K, L_f ≈ 334 kJ/kg
 * Handheld samples override Pi samples of the same point within ±15 min. C_ice is the
 * volume-weighted mean of all "clean" samples. Missing data gives "needs sample", never 0;
 * impossible data (C_ice > C_feed, volumes ≤ 0) gives "check data", never a negative %.
 */

export const DEFAULT_K = 0.64;
export const MASS_BALANCE_LIMIT = 0.15;
const OVERRIDE_MS = 15 * 60_000;

/** EC at 25 °C from EC at temperature T. */
export const ec25 = (ecMS: number, tempC?: number) => (tempC === undefined ? ecMS : ecMS / (1 + 0.02 * (tempC - 25)));

/** Concentration in g/L of a sample: measured TDS, or EC (temperature-compensated) × k. */
export function concentrationGL(s: Pick<Sample, 'tdsMgL' | 'ecMS' | 'tempC'>, k = DEFAULT_K): number | undefined {
  if (s.tdsMgL !== undefined) return s.tdsMgL / 1000;
  if (s.ecMS !== undefined) return k * ec25(s.ecMS, s.tempC); // mS/cm × 1000 = µS/cm; × k = mg/L; ÷ 1000 = g/L
  return undefined;
}

/** EC estimate for a salt solution in g/L (inverse of the TDS rule, at 25 °C). */
export const ecForSalinity = (gL: number, k = DEFAULT_K) => gL / k; // mS/cm

/** Samples that count: a Pi sample is dropped when a handheld one of the same point is within ±15 min. */
export function effectiveSamples(samples: Sample[]): Sample[] {
  const hand = samples.filter((s) => s.source === 'handheld');
  return samples.filter((s) => s.source === 'handheld' || !hand.some((h) => h.point === s.point && Math.abs(Date.parse(h.at) - Date.parse(s.at)) <= OVERRIDE_MS));
}

interface PointStats {
  c?: number; // g/L (volume-weighted where volumes exist)
  v: number; // L, sum of volumes
}

function point(samples: Sample[], p: SamplePoint, k: number): PointStats {
  const list = samples.filter((s) => s.point === p);
  const withC = list.map((s) => ({ c: concentrationGL(s, k), v: s.volumeL })).filter((x) => x.c !== undefined) as { c: number; v?: number }[];
  const v = list.reduce((sum, s) => sum + (s.volumeL ?? 0), 0);
  if (!withC.length) return { v };
  const weighted = withC.filter((x) => x.v !== undefined && x.v > 0);
  const c = weighted.length ? weighted.reduce((s, x) => s + x.c * x.v!, 0) / weighted.reduce((s, x) => s + x.v!, 0) : withC.reduce((s, x) => s + x.c, 0) / withC.length;
  return { c, v };
}

export type Value = { ok: true; value: number } | { ok: false; reason: 'needs sample' | 'check data' };
const ok = (value: number): Value => ({ ok: true, value });
const needs: Value = { ok: false, reason: 'needs sample' };
const bad: Value = { ok: false, reason: 'check data' };

export interface Results {
  rejection: Value; // R, 0–1
  recovery: Value; // Y, 0–1
  concentrationFactor: Value; // CF
  massBalanceError: Value; // 0–1
  massBalanceFlag: boolean; // > 15 %
  whPerL: Value;
  freezeRateCmH: Value;
  cFeed?: number;
  cIce?: number;
  cBrine?: number;
  vClean: number;
}

export function computeResults(run: Pick<Run, 'samples' | 'feedVolumeL' | 'tdsK' | 'energyWh' | 'iceThicknessCm' | 'freezeHoursActual'>): Results {
  const k = run.tdsK || DEFAULT_K;
  const s = effectiveSamples(run.samples);
  const feed = point(s, 'feed', k);
  const clean = point(s, 'clean', k);
  const brine = point(s, 'brine', k);
  const sweat = point(s, 'sweat', k);
  const vFeed = run.feedVolumeL;

  let rejection: Value = needs;
  if (feed.c !== undefined && clean.c !== undefined) rejection = feed.c <= 0 || clean.c < 0 || clean.c > feed.c ? bad : ok(1 - clean.c / feed.c);

  const recovery: Value = clean.v <= 0 ? needs : vFeed > 0 && clean.v <= vFeed ? ok(clean.v / vFeed) : bad;

  let concentrationFactor: Value = needs;
  if (feed.c !== undefined && brine.c !== undefined) concentrationFactor = feed.c > 0 ? ok(brine.c / feed.c) : bad;

  let massBalanceError: Value = needs;
  if (feed.c !== undefined && clean.c !== undefined && brine.c !== undefined && vFeed > 0 && clean.v > 0 && brine.v > 0) {
    const inSalt = feed.c * vFeed;
    const outSalt = clean.c * clean.v + brine.c * brine.v + (sweat.c ?? 0) * sweat.v;
    massBalanceError = inSalt > 0 ? ok(Math.abs(inSalt - outSalt) / inSalt) : bad;
  }

  let whPerL: Value = needs;
  if (run.energyWh !== undefined) whPerL = clean.v > 0 && run.energyWh >= 0 ? ok(run.energyWh / clean.v) : bad;

  let freezeRateCmH: Value = needs;
  if (run.iceThicknessCm !== undefined && run.freezeHoursActual !== undefined) freezeRateCmH = run.freezeHoursActual > 0 && run.iceThicknessCm >= 0 ? ok(run.iceThicknessCm / run.freezeHoursActual) : bad;

  return {
    rejection,
    recovery,
    concentrationFactor,
    massBalanceError,
    massBalanceFlag: massBalanceError.ok && massBalanceError.value > MASS_BALANCE_LIMIT,
    whPerL,
    freezeRateCmH,
    cFeed: feed.c,
    cIce: clean.c,
    cBrine: brine.c,
    vClean: clean.v,
  };
}

/** Ice depth from the probe string: the deepest probe at or below the threshold (default −0.3 °C). */
export function iceDepthCm(temps: Record<string, number | null | undefined>, probes: { key: string; depthCm?: number }[], thresholdC = -0.3): number | undefined {
  let depth: number | undefined;
  let measured = false;
  for (const p of probes) {
    const t = temps[p.key];
    if (p.depthCm === undefined || t === null || t === undefined) continue;
    measured = true;
    if (t <= thresholdC && (depth === undefined || p.depthCm > depth)) depth = p.depthCm;
  }
  return depth ?? (measured ? 0 : undefined);
}

export const iceFraction = (depthCm: number, waterDepthCm: number) => (waterDepthCm > 0 ? Math.min(1, Math.max(0, depthCm / waterDepthCm)) : undefined);

/** Theoretical heat to cool water by ΔT and freeze it, in kJ. */
export const heatRemovedKJ = (massKg: number, deltaT: number) => massKg * (4.19 * deltaT + 334);

/** Least-squares line EC = slope·volts + offset from 2+ calibration points (handheld meter as reference). */
export function fitCalibration(points: { volts: number; ecMS: number }[]): { slope: number; offset: number } | undefined {
  if (points.length < 2) return undefined;
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.volts, 0);
  const sy = points.reduce((s, p) => s + p.ecMS, 0);
  const sxx = points.reduce((s, p) => s + p.volts * p.volts, 0);
  const sxy = points.reduce((s, p) => s + p.volts * p.ecMS, 0);
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-12) return undefined;
  const slope = (n * sxy - sx * sy) / d;
  return { slope, offset: (sy - slope * sx) / n };
}

export const pct = (v: Value) => (v.ok ? `${Math.round(v.value * 100)}%` : v.reason);
