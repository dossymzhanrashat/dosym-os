import { describe, expect, it } from 'vitest';
import { buildTank, triangleCount } from '../../frostpure/three/buildTank';
import { demoState, dataState, phaseAt } from '../../frostpure/three/tankState';
import type { TelemetryRow } from '../../frostpure/model/types';
import { boxSizeFor, buildBox } from './buildBox';
import { buildRobot, DEFAULT_STYLE, presetFor, ROBOTS, tooClose, type RobotPreset } from './buildRobot';

describe('FrostPure tank state', () => {
  it('runs Fill · Freeze · Drain · Sweat · Harvest; ice on top grows, then drains and harvests', () => {
    expect([0.05, 0.3, 0.7, 0.8, 0.95].map(phaseAt)).toEqual(['fill', 'freeze', 'drain', 'sweat', 'harvest']);
    const freezing = demoState(0.35);
    const frozen = demoState(0.6);
    expect(frozen.ice).toBeGreaterThan(freezing.ice);
    expect(frozen.ice).toBeCloseTo(0.65, 5);
    expect(demoState(0.7).v2Open).toBe(true);
    expect(demoState(0.7).v3).toBe('brine');
    expect(demoState(0.75).brine).toBeLessThan(frozen.brine);
    expect(demoState(1).clean).toBeCloseTo(1, 5);
    expect(demoState(0.3).v2Open).toBe(false);
  });

  it('uses real readings when a run has them', () => {
    const row = (ts: string, ice: number, ec: number, v2: string): TelemetryRow => ({ id: 1, device_id: 'd', run_id: null, seq: 1, ts, phase: 'freeze', flags: [], received_at: ts, payload: { device_id: 'd', ts, seq: 1, ice_depth_cm: ice, ec_ms_cm: { EC1: ec }, valves: { V2: v2, V3: 'brine' } } });
    const rows = [row('2026-11-14T15:00:00Z', 0, 6, 'closed'), row('2026-11-14T21:00:00Z', 10, 9, 'closed'), row('2026-11-15T03:00:00Z', 20, 15, 'open')];
    expect(dataState(rows.slice(0, 1), 0.5, 30)).toBeUndefined(); // one reading is not enough
    const mid = dataState(rows, 0.5, 30)!;
    expect(mid.ice).toBeCloseTo(10 / 30, 5);
    expect(mid.reading?.ec1).toBe(9);
    const end = dataState(rows, 1, 30)!;
    expect(end.v2Open).toBe(true);
    expect(end.tint).toBeCloseTo((15 / 6 - 1) / 3, 5);
  });
});

describe('3D budgets (built in code, no model files)', () => {
  it('the tank stays under 50k triangles', () => {
    const t = buildTank();
    t.update(demoState(0.5), 1);
    expect(triangleCount(t.group)).toBeLessThan(50_000);
    expect(t.parts.size).toBe(11);
    t.dispose();
  });

  it('every kit robot builds, explodes and stays small', () => {
    for (const preset of Object.keys(ROBOTS) as RobotPreset[]) {
      const spec = ROBOTS[preset];
      const r = buildRobot(spec, DEFAULT_STYLE.brand);
      expect(triangleCount(r.group)).toBeLessThan(20_000);
      // every step names real parts, and every part is in some step
      const ids = new Set(spec.parts.map((p) => p.id));
      expect(spec.steps.flatMap((s) => s.parts).every((id) => ids.has(id))).toBe(true);
      expect([...ids].every((id) => spec.steps.some((s) => s.parts.includes(id)))).toBe(true);
      const p = spec.parts.find((x) => x.explode.some((v) => v !== 0))!;
      r.setExplode(1);
      expect(r.parts.get(p.id)!.position.toArray()).toEqual(p.pos.map((v, i) => v + p.explode[i] * 1.6));
      r.setExplode(0);
      expect(r.parts.get(p.id)!.position.toArray()).toEqual(p.pos);
      r.dispose();
    }
    expect(['A', 'B', 'C', 'D', 'B+D'].map((c) => presetFor(c))).toEqual(['cardboard-bot', 'plywood-bot', 'beam-bot', 'card-bot', 'plywood-bot']);
  });

  it('the Deep Blue preset uses brand colours, with amber on one kind of part only', () => {
    expect(DEFAULT_STYLE.brand.accent).toBe('#ffb36b');
    expect(tooClose('#8ff1ff', '#8ef0fe')).toBe(true);
    expect(tooClose('#8ff1ff', '#050a16')).toBe(false);
  });

  it('the box opens to 110° at most', () => {
    const b = buildBox(boxSizeFor('B'), { titleKk: 'Дала Бот', titleRu: 'Степной бот', age: '6+', grades: '3–6', bullets: ['a', 'b', 'c'], code: 'B' });
    b.setLid(200);
    const hinge = b.group.children.at(-1)!;
    expect(hinge.rotation.x).toBeCloseTo(-(110 * Math.PI) / 180, 6);
    b.dispose();
  });
});
