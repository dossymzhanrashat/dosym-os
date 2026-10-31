import { describe, expect, it } from 'vitest';
import { describeDeadline } from '../../radar/engine/time';
import { BRIEF_SECTIONS, SEED_BOM, SEED_COMPS, SEED_STEPS } from '../data/seed';
import type { BomItem, Run, Sample } from '../model/types';
import { bomTotals, briefProgress, guidedPath, nextStatus, stepUnlocked, wordCount } from './compete';
import { computeResults, concentrationGL, ec25, effectiveSamples, fitCalibration, heatRemovedKJ, iceDepthCm, iceFraction, pct } from './results';

const NOW = new Date('2026-11-01T06:00:00Z');
let n = 0;
const sample = (point: Sample['point'], fields: Partial<Sample>): Sample => ({ id: `s${++n}`, at: '2026-11-14T10:00:00.000Z', point, source: 'handheld', note: '', ...fields });
const baseRun = (samples: Sample[], extra: Partial<Run> = {}) => ({ samples, feedVolumeL: 20, tdsK: 0.64, ...extra });

describe('results: R and Y', () => {
  it('R = 1 − C_ice / C_feed and Y = V_clean / V_feed with known values', () => {
    const r = computeResults(
      baseRun([sample('feed', { tdsMgL: 4000 }), sample('clean', { tdsMgL: 1000, volumeL: 8 }), sample('brine', { tdsMgL: 10000, volumeL: 10 })]),
    );
    expect(r.rejection).toEqual({ ok: true, value: 0.75 });
    expect(r.recovery).toEqual({ ok: true, value: 0.4 });
    expect(r.concentrationFactor).toEqual({ ok: true, value: 2.5 });
    // in: 4 g/L × 20 L = 80 g; out: 1×8 + 10×10 = 108 g → 35 % off → flagged
    expect(r.massBalanceError.ok && r.massBalanceError.value).toBeCloseTo(0.35, 5);
    expect(r.massBalanceFlag).toBe(true);
    expect(pct(r.rejection)).toBe('75%');
  });

  it('C_ice is the volume-weighted mean of all clean samples', () => {
    const r = computeResults(baseRun([sample('feed', { tdsMgL: 4000 }), sample('clean', { tdsMgL: 500, volumeL: 6 }), sample('clean', { tdsMgL: 2000, volumeL: 2 })]));
    expect(r.cIce).toBeCloseTo((0.5 * 6 + 2 * 2) / 8, 10); // 0.875 g/L
    expect(r.rejection.ok && r.rejection.value).toBeCloseTo(1 - 0.875 / 4, 10);
    expect(r.recovery).toEqual({ ok: true, value: 0.4 });
  });

  it('missing samples say "needs sample"; impossible data says "check data", never negative', () => {
    expect(computeResults(baseRun([sample('clean', { tdsMgL: 500, volumeL: 6 })])).rejection).toEqual({ ok: false, reason: 'needs sample' });
    expect(computeResults(baseRun([sample('feed', { tdsMgL: 1000 }), sample('clean', { tdsMgL: 3000, volumeL: 6 })])).rejection).toEqual({ ok: false, reason: 'check data' });
    expect(computeResults(baseRun([sample('clean', { tdsMgL: 300, volumeL: 6 })], { feedVolumeL: 0 })).recovery).toEqual({ ok: false, reason: 'check data' });
    expect(computeResults(baseRun([])).recovery).toEqual({ ok: false, reason: 'needs sample' });
  });

  it('Wh per litre and freeze rate', () => {
    const r = computeResults(baseRun([sample('clean', { tdsMgL: 300, volumeL: 8 })], { energyWh: 40, iceThicknessCm: 12, freezeHoursActual: 16 }));
    expect(r.whPerL).toEqual({ ok: true, value: 5 });
    expect(r.freezeRateCmH).toEqual({ ok: true, value: 0.75 });
  });

  it('EC → g/L with k and temperature compensation', () => {
    expect(ec25(10, 25)).toBe(10);
    expect(ec25(8, 15)).toBeCloseTo(10, 10); // 8 / (1 − 0.2)
    expect(concentrationGL({ ecMS: 6.25 })).toBeCloseTo(4, 10); // 6,250 µS/cm × 0.64 = 4,000 mg/L
    expect(concentrationGL({ ecMS: 5, tempC: 15 }, 0.5)).toBeCloseTo(3.125, 10);
    expect(concentrationGL({ tdsMgL: 1600, ecMS: 99 })).toBe(1.6); // measured TDS wins
  });

  it('handheld overrides Pi for the same point within ±15 min', () => {
    const hand = sample('clean', { at: '2026-11-14T10:00:00.000Z', tdsMgL: 900 });
    const piClose = sample('clean', { at: '2026-11-14T10:10:00.000Z', tdsMgL: 1500, source: 'pi' });
    const piFar = sample('clean', { at: '2026-11-14T10:20:00.000Z', tdsMgL: 1500, source: 'pi' });
    const piOther = sample('brine', { at: '2026-11-14T10:05:00.000Z', tdsMgL: 9000, source: 'pi' });
    expect(effectiveSamples([hand, piClose, piFar, piOther]).map((s) => s.id)).toEqual([hand.id, piFar.id, piOther.id]);
  });
});

describe('ice, heat and calibration', () => {
  const probes = [5, 10, 15, 20, 25].map((d, i) => ({ key: `T${i + 1}`, depthCm: d }));

  it('ice depth = deepest probe at or below −0.3 °C', () => {
    expect(iceDepthCm({ T1: -3.1, T2: -1.2, T3: -0.4, T4: 0.6, T5: 1.1 }, probes)).toBe(15);
    expect(iceDepthCm({ T1: 0.2, T2: 1, T3: 1, T4: 1, T5: 1 }, probes)).toBe(0);
    expect(iceDepthCm({}, probes)).toBeUndefined();
    expect(iceFraction(15, 30)).toBe(0.5);
  });

  it('heat removed and EC calibration line', () => {
    expect(heatRemovedKJ(10, 5)).toBeCloseTo(10 * (4.19 * 5 + 334), 6);
    const cal = fitCalibration([
      { volts: 0.5, ecMS: 3 },
      { volts: 1, ecMS: 6 },
      { volts: 1.5, ecMS: 9 },
    ])!;
    expect(cal.slope).toBeCloseTo(6, 10);
    expect(cal.offset).toBeCloseTo(0, 10);
    expect(fitCalibration([{ volts: 1, ecMS: 2 }])).toBeUndefined();
  });
});

describe('BOM and build guide', () => {
  it('seeds the parts on hand as "have" and totals from the table', () => {
    expect(SEED_BOM.slice(0, 3).map((b) => [b.name.split(' ')[0], b.status])).toEqual([
      ['Raspberry', 'have'],
      ['Servo', 'have'],
      ['12', 'have'],
    ]);
    const t = bomTotals(SEED_BOM);
    const expected = SEED_BOM.filter((b) => b.status === 'need').reduce((s, b) => s + (b.unitPriceKZT ?? 0) * b.qty, 0);
    expect(t.stillToBuyKZT).toBe(expected);
    expect(t).toMatchObject({ have: 3, ordered: 0, need: SEED_BOM.length - 3 });
    expect(nextStatus('need')).toBe('ordered');
    expect(nextStatus('have')).toBe('need');
  });

  it('a step locks until its parts are "have"', () => {
    const bom = new Map<string, BomItem>(SEED_BOM.map((b) => [b.id, b]));
    const piStep = SEED_STEPS.find((s) => s.id === 'step-pi')!;
    const power = SEED_STEPS.find((s) => s.id === 'step-power')!;
    expect(stepUnlocked(piStep, bom).open).toBe(true);
    expect(stepUnlocked(power, bom).missing.map((m) => m.id)).toEqual(['bom-fuse', 'bom-buck-5v', 'bom-buck-6v']);
    for (const id of ['bom-fuse', 'bom-buck-5v', 'bom-buck-6v']) bom.set(id, { ...bom.get(id)!, status: 'have' });
    expect(stepUnlocked(power, bom).open).toBe(true);
  });
});

describe('Conrad', () => {
  const conrad = SEED_COMPS[0];
  const innovation = conrad.phases.find((p) => p.id === 'innovation')!;

  it('dates and Brief limits match the 2026–27 Student Guide; deadlines show in Almaty with CT', () => {
    expect(describeDeadline(innovation.deadline!)).toBe('Jan 7, 23:59 CT = Jan 8, 10:59 Almaty');
    expect(BRIEF_SECTIONS.reduce((s, x) => s + x[2], 0)).toBe(3000);
    expect(BRIEF_SECTIONS.map((x) => x[2])).toEqual([150, 150, 300, 750, 450, 300, 300, 150, 300, 150]);
    expect(conrad.phases.find((p) => p.id === 'activation')!.doneAt).toBeDefined();
    expect(describeDeadline(conrad.phases.find((p) => p.id === 'finalists')!.deadline!)).toBe('Feb 26, 19:00 CT = Feb 27, 06:00 Almaty');
  });

  it('counts words and Brief progress', () => {
    expect(wordCount("FrostPure's tank freezes salty well-water — top-down, 4 g/L.")).toBe(9);
    const withText = { ...innovation, requirements: innovation.requirements.map((r) => (r.id === 'brief-elevator' ? { ...r, text: 'word '.repeat(120) } : r.id === 'brief-team' ? { ...r, text: 'word '.repeat(200) } : r)) };
    expect(briefProgress(withText)).toMatchObject({ done: 1, total: 10, words: 320, limit: 3000 }); // Team is over its 150 limit
  });

  it('“This week” shows at most 3 tasks, deterministic, each with a reason', () => {
    const bom = new Map<string, BomItem>(SEED_BOM.map((b) => [b.id, b]));
    const a = guidedPath(SEED_COMPS, SEED_STEPS, [], bom, NOW);
    const b = guidedPath(SEED_COMPS, SEED_STEPS, [], bom, NOW);
    expect(a.length).toBe(3);
    expect(a).toEqual(b);
    expect(a.every((t) => t.reason.length > 10)).toBe(true);
    expect(a.map((t) => t.slack)).toEqual([...a.map((t) => t.slack)].sort((x, y) => x - y));
  });
});

describe('media', async () => {
  const { kindFromUrl, parseDuration, videoWarnings, youtubeEmbed } = await import('./media');

  it('detects the kind from the link', () => {
    expect(kindFromUrl('https://www.canva.com/design/DAF123/view')).toBe('canva');
    expect(kindFromUrl('https://youtu.be/abc123')).toBe('video');
    expect(kindFromUrl('https://docs.google.com/document/d/x')).toBe('document');
    expect(kindFromUrl('https://claude.ai/artifact/123')).toBe('link');
    expect(kindFromUrl('not a link')).toBe('link');
  });

  it('warns outside 3–5 min or over 800 MB', () => {
    expect(videoWarnings(140, 300 * 1024 * 1024)).toEqual(['2:20 long: the Conrad Innovation Video must be 3–5 min.']);
    expect(videoWarnings(240, 900 * 1024 * 1024)).toEqual(['900 MB: the Conrad upload must be under 800 MB.']);
    expect(videoWarnings(240, 100)).toEqual([]);
    expect(parseDuration('2:20')).toBe(140);
    expect(youtubeEmbed('https://www.youtube.com/watch?v=abc123', 42)).toBe('https://www.youtube-nocookie.com/embed/abc123?start=42&autoplay=1');
  });
});
