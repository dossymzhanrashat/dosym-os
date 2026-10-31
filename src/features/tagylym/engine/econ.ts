import { TEACHER_BOX } from '../data/seed';
import type { BomLine, EconInputs, KitOption } from '../model/types';

/*
 * Unit economics (SPEC Module 3 › Business tools), all in ₸ (approximate):
 *   landed      = (Σ BOM + labour + pack + freight) × (1 + defect%) × (1 + duty%)
 *   net_channel = price × (1 − fee%) − delivery / unitsPerOrder − landed
 *   margin      = net_channel / price         (amber flag below 30 %)
 *   breakEven   = fixed costs / net_channel(B2B)
 *   first batch = MOQ × landed + fixed costs
 * Price ladder: grant = landed × 1.5; school B2B = landed × 2.2; parent B2C = B2B × 1.25 rounded
 * up to x,990; Teacher Box = sum of contents × 0.9. Sensitivity: B2B margin as the ₸/$ rate
 * moves from 420 to 520 (most parts are imported, priced in $).
 */

export const MARGIN_FLAG = 0.3;

export const lineKZT = (l: BomLine, fx: number) => l.qty * l.unitCost * (l.currency === 'USD' ? fx : 1);

export interface BomTotal {
  kzt: number;
  usdPart: number; // ₸ coming from $-priced lines (moves with the rate)
  incomplete: boolean; // a line without a price
  oldest?: string; // oldest checkedAt among estimates
}

export function bomTotal(bom: BomLine[], fx: number): BomTotal {
  let kzt = 0;
  let usdPart = 0;
  let incomplete = false;
  let oldest: string | undefined;
  for (const l of bom) {
    if (!Number.isFinite(l.unitCost) || l.unitCost <= 0) incomplete = true;
    const v = Number.isFinite(l.unitCost) ? lineKZT(l, fx) : 0;
    kzt += v;
    if (l.currency === 'USD') usdPart += v;
    if (l.isEstimate && l.checkedAt && (!oldest || l.checkedAt < oldest)) oldest = l.checkedAt;
  }
  return { kzt, usdPart, incomplete, oldest };
}

export function landed(o: Pick<KitOption, 'bom'>, e: EconInputs, fx: number): number {
  return (bomTotal(o.bom, fx).kzt + e.labourKZT + e.packKZT + e.freightKZT) * (1 + e.defectPct / 100) * (1 + e.dutyPct / 100);
}

export type Channel = 'grant' | 'b2b' | 'b2c';

export function channelCosts(ch: Channel, e: EconInputs): { feePct: number; deliveryPerUnit: number } {
  if (ch === 'b2c') return { feePct: e.kaspiFeePct, deliveryPerUnit: e.kaspiDeliveryKZT / Math.max(1, e.unitsPerOrder) };
  return { feePct: 0, deliveryPerUnit: 0 };
}

export function net(price: number, ch: Channel, landedKZT: number, e: EconInputs): number {
  const c = channelCosts(ch, e);
  return price * (1 - c.feePct / 100) - c.deliveryPerUnit - landedKZT;
}

export const margin = (price: number, netKZT: number) => (price > 0 ? netKZT / price : 0);

/** Round up to the next x,990 (4,990; 24,990). */
export const to990 = (v: number) => Math.ceil((v + 10) / 1000) * 1000 - 10;

export interface Tier {
  id: Channel | 'teacherBox';
  label: string;
  buyer: string;
  ladder: number; // the rule's suggestion
  target?: number; // the option's own target price
  price: number; // what the margin is computed on: target if set, else ladder
  net: number;
  margin: number;
  flag: boolean; // margin < 30 %
}

export function ladder(o: KitOption, all: KitOption[], e: EconInputs, fx: number): { landed: number; tiers: Tier[] } {
  const L = landed(o, e, fx);
  const b2bLadder = L * 2.2;
  const rows: Omit<Tier, 'price' | 'net' | 'margin' | 'flag'>[] = [
    { id: 'grant', label: 'Grant / outreach', buyer: 'NGO, sponsor, Keleshek Schools', ladder: Math.round(L * 1.5), target: o.prices.grant },
    { id: 'b2b', label: 'School B2B', buyer: 'School, akimat, Daryn-type centres', ladder: Math.round(b2bLadder), target: o.prices.b2b },
    { id: 'b2c', label: 'Parent B2C', buyer: 'Kaspi, Instagram, Tagylym site', ladder: to990((o.prices.b2b ?? b2bLadder) * 1.25), target: o.prices.b2c },
  ];
  const tiers: Tier[] = rows.map((r) => {
    const price = r.target ?? r.ladder;
    const n = net(price, r.id as Channel, L, e);
    const m = margin(price, n);
    return { ...r, price, net: n, margin: m, flag: m < MARGIN_FLAG };
  });
  if (o.sellAsTeacherBox) {
    const tb = teacherBox(o, all, e, fx);
    if (tb) tiers.push(tb);
  }
  return { landed: L, tiers };
}

/** Teacher Box for an option: 6 of its robots + 12 Qagaz Bot envelopes + the extras (Option E's BOM). */
export function teacherBox(o: KitOption, all: KitOption[], e: EconInputs, fx: number): Tier | undefined {
  const box = all.find((x) => x.isTeacherBox && !x.deletedAt);
  const qagaz = all.find((x) => x.id === TEACHER_BOX.qagazId && !x.deletedAt);
  if (!box || !qagaz) return undefined;
  const extras = bomTotal(box.bom, fx).kzt;
  const cost = TEACHER_BOX.robots * landed(o, e, fx) + TEACHER_BOX.qagaz * landed(qagaz, e, fx) + extras;
  const contents = TEACHER_BOX.robots * (o.prices.b2b ?? landed(o, e, fx) * 2.2) + TEACHER_BOX.qagaz * (qagaz.prices.b2b ?? landed(qagaz, e, fx) * 2.2) + extras;
  const ladderPrice = Math.round(contents * 0.9);
  const price = box.prices.b2b ?? ladderPrice;
  const n = price - cost;
  const m = margin(price, n);
  return { id: 'teacherBox', label: 'Teacher Box', buyer: 'School set (class of 24)', ladder: ladderPrice, target: box.prices.b2b, price, net: n, margin: m, flag: m < MARGIN_FLAG };
}

export interface Summary {
  landed: number;
  breakEven?: number; // units at the B2B price; undefined when net ≤ 0
  firstBatchCash: number;
}

export function summary(o: KitOption, e: EconInputs, fx: number): Summary {
  const L = landed(o, e, fx);
  const b2b = o.prices.b2b ?? L * 2.2;
  const n = net(b2b, 'b2b', L, e);
  const fixed = o.manufacturing.fixedCostsKZT;
  return { landed: L, breakEven: n > 0 ? Math.ceil(fixed / n) : undefined, firstBatchCash: o.manufacturing.moq * L + fixed };
}

/** B2B (and B2C) margin at each ₸/$ rate from 420 to 520. */
export function fxSensitivity(o: KitOption, e: EconInputs, from = 420, to = 520, step = 10) {
  const out: { fx: number; b2b: number; b2c?: number }[] = [];
  for (let fx = from; fx <= to; fx += step) {
    const L = landed(o, e, fx);
    const b2bPrice = o.prices.b2b ?? L * 2.2;
    const row: { fx: number; b2b: number; b2c?: number } = { fx, b2b: margin(b2bPrice, net(b2bPrice, 'b2b', L, e)) };
    if (o.prices.b2c) row.b2c = margin(o.prices.b2c, net(o.prices.b2c, 'b2c', L, e));
    out.push(row);
  }
  return out;
}
