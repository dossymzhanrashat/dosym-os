import type { TelemetryRow } from '../model/types';

/*
 * What the 3D tank shows at timeline position t (0–1) (SPEC Module 2 › 4 Timeline).
 * Phases: Fill · Freeze · Drain · Sweat · Harvest. Without run data a 20 s demo cycle is used and
 * the view says "illustration"; with telemetry, t maps to the run's real time: ice from
 * ice_depth_cm, brine tint from EC1, valves from `valves`.
 *   iceH = f_ice · waterH, brineH = waterH − iceH; brine tint = CF mapped over 1…4
 */

export const PHASES = [
  { id: 'fill', label: 'Fill', from: 0, to: 0.1 },
  { id: 'freeze', label: 'Freeze', from: 0.1, to: 0.6 },
  { id: 'drain', label: 'Drain', from: 0.6, to: 0.75 },
  { id: 'sweat', label: 'Sweat', from: 0.75, to: 0.85 },
  { id: 'harvest', label: 'Harvest', from: 0.85, to: 1 },
] as const;
export type PhaseId = (typeof PHASES)[number]['id'];

export interface TankState {
  phase: PhaseId;
  water: number; // liquid + ice level, 0–1 of the tank height
  ice: number; // ice fraction of the water column, 0–1 (grows from the top)
  brine: number; // brine left under the ice, 0–1 of the tank height
  tint: number; // brine saltiness 0–1 (CF 1…4)
  saltFall: number; // 0–1, how far salt dots have sunk
  v2Open: boolean; // drain
  v3: 'brine' | 'clean';
  clean: number; // clean store fill 0–1
  reading?: { ts: string; iceCm?: number; ec1?: number; temps?: Record<string, number | null>; phase?: string };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x);

export function phaseAt(t: number): PhaseId {
  return (PHASES.find((p) => t < p.to) ?? PHASES[PHASES.length - 1]).id;
}

/** The demo curve ("illustration"). */
export function demoState(t: number, targetIce = 0.65): TankState {
  const fill = ease(seg(t, 0, 0.1));
  const freeze = ease(seg(t, 0.1, 0.6));
  const drain = ease(seg(t, 0.6, 0.75));
  const sweat = seg(t, 0.75, 0.85);
  const harvest = ease(seg(t, 0.85, 1));
  const full = 0.85; // water fills 85 % of the tank
  const ice = targetIce * freeze;
  const liquidUnder = full * (1 - ice);
  const cf = 1 + 3 * freeze; // brine gets saltier as ice grows
  const phase = phaseAt(t);
  return {
    phase,
    water: full * fill,
    ice: t < 0.85 ? ice : targetIce * (1 - harvest),
    brine: t < 0.6 ? liquidUnder * fill : liquidUnder * (1 - drain),
    tint: clamp((cf - 1) / 3),
    saltFall: freeze,
    v2Open: phase === 'drain' || phase === 'sweat',
    v3: phase === 'drain' || (phase === 'sweat' && sweat < 0.5) ? 'brine' : 'clean',
    clean: harvest,
  };
}

/** Real data: t picks the reading at that share of the run's time. */
export function dataState(rows: TelemetryRow[], t: number, waterDepthCm: number | undefined): TankState | undefined {
  const usable = rows.filter((r) => !r.flags.includes('clock_skew'));
  if (usable.length < 2) return undefined;
  const t0 = Date.parse(usable[0].ts);
  const t1 = Date.parse(usable[usable.length - 1].ts);
  const at = t0 + clamp(t) * (t1 - t0);
  let row = usable[0];
  for (const r of usable) {
    if (Date.parse(r.ts) <= at) row = r;
    else break;
  }
  const p = row.payload;
  const iceCm = p.ice_depth_cm ?? undefined;
  const ice = iceCm !== undefined && waterDepthCm ? clamp(iceCm / waterDepthCm) : 0;
  const ec1 = p.ec_ms_cm?.EC1 ?? undefined;
  const ec0 = usable.find((r) => r.payload.ec_ms_cm?.EC1 != null)?.payload.ec_ms_cm?.EC1 ?? undefined;
  const cf = ec1 !== undefined && ec0 ? ec1 / ec0 : 1;
  const phase = (PHASES.some((x) => x.id === row.phase) ? row.phase : 'freeze') as PhaseId;
  const v2 = p.valves?.V2;
  const v3 = p.valves?.V3;
  const full = 0.85;
  const draining = v2 === 'open';
  return {
    phase,
    water: full,
    ice,
    brine: draining ? full * (1 - ice) * 0.4 : full * (1 - ice),
    tint: clamp((cf - 1) / 3),
    saltFall: ice,
    v2Open: draining,
    v3: v3 === 'brine' ? 'brine' : 'clean',
    clean: phase === 'harvest' ? 0.6 : 0,
    reading: { ts: row.ts, iceCm, ec1, temps: p.temps_c, phase: row.phase ?? undefined },
  };
}
