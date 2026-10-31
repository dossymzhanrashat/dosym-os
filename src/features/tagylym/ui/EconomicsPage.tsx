import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Chip, GlassCard } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { saveEcon, useEcon, useFx, useTgData } from '../data/store';
import { bomTotal, fxSensitivity, ladder, MARGIN_FLAG, summary } from '../engine/econ';
import type { EconInputs } from '../model/types';
import { Approx, kzt, pct, TgNav, ToConfirm, usd } from './common';

/*
 * Unit economics (SPEC Module 3 › Business tools): landed cost per kit, margin per channel with
 * an amber flag under 30 %, break-even against fixed costs, cash for the first batch, and the
 * margin's sensitivity to the ₸/$ rate (420–520). Every number is approximate.
 */

const axis = { stroke: 'var(--text-3)', tick: { fill: 'var(--text-3)', fontSize: 11 }, tickLine: false, axisLine: false };

const FIELDS: { key: keyof EconInputs; label: string; suffix: string; confirm?: boolean; note?: string }[] = [
  { key: 'freightKZT', label: 'Freight per kit', suffix: '₸', note: 'enter your estimate' },
  { key: 'labourKZT', label: 'Extra labour per kit', suffix: '₸', note: 'beyond the BOM line' },
  { key: 'packKZT', label: 'Extra packaging per kit', suffix: '₸', note: 'beyond the BOM line' },
  { key: 'defectPct', label: 'Defect rate', suffix: '%' },
  { key: 'dutyPct', label: 'Customs / VAT share', suffix: '%', note: 'your figure (16%)' },
  { key: 'kaspiFeePct', label: 'Kaspi fee (Parent B2C)', suffix: '%', confirm: true, note: 'electronics example; toy category to confirm' },
  { key: 'kaspiDeliveryKZT', label: 'Kaspi delivery per order', suffix: '₸', confirm: true, note: 'top of 799–1,699 ₸' },
  { key: 'unitsPerOrder', label: 'Kits per order (B2C)', suffix: '' },
];

export function EconomicsPage() {
  const data = useTgData();
  const fx = useFx();
  const [params, setParams] = useSearchParams();
  const options = data.options.filter((o) => !o.isTeacherBox);
  const o = options.find((x) => x.id === params.get('option')) ?? options.find((x) => x.status === 'active') ?? options[0];
  const e = useEcon(o?.id ?? '');
  const result = useMemo(() => (o ? { lad: ladder(o, data.options, e, fx.usdToKzt), sum: summary(o, e, fx.usdToKzt), sens: fxSensitivity(o, e), bom: bomTotal(o.bom, fx.usdToKzt) } : undefined), [o, data.options, e, fx.usdToKzt]);

  if (!data.loaded) return <SaltDotsLoader label="Opening economics" />;
  if (!o || !result) return null;
  const { lad, sum, sens, bom } = result;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/tagylym">Kit Studio</Link> · Economics
        </p>
        <h1 className="ff-title">Unit economics</h1>
        <div className="seg" role="radiogroup" aria-label="Option">
          {options.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === o.id} className="seg-btn" onClick={() => setParams({ option: x.id }, { replace: true })}>
              {x.code} · {x.name}
            </button>
          ))}
        </div>
      </header>
      <TgNav />

      <div className="grid gap-3">
        <GlassCard className="grid gap-3" aria-labelledby="in-h">
          <h2 id="in-h" className="card-title m-0">
            Inputs <span className="text-sm">for {o.name} · 1 USD ≈ {fx.usdToKzt} ₸</span>
          </h2>
          <div className="tg-econ-inputs">
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span className="field-label">
                  {f.label} {f.suffix && `(${f.suffix})`} {f.confirm && <ToConfirm />}
                </span>
                <input
                  className="input"
                  type="number"
                  min={f.key === 'unitsPerOrder' ? 1 : 0}
                  step="any"
                  defaultValue={e[f.key]}
                  key={`${o.id}-${f.key}-${e[f.key]}`}
                  onBlur={(ev) => {
                    const v = Number(ev.target.value);
                    if (Number.isFinite(v) && v !== e[f.key]) void saveEcon(o.id, { ...e, [f.key]: f.key === 'unitsPerOrder' ? Math.max(1, v) : Math.max(0, v) });
                  }}
                />
                {f.note && <span className="text-sm">{f.note}</span>}
              </label>
            ))}
          </div>
          <p className="m-0 text-sm">
            BOM {kzt(bom.kzt)} ({usd(bom.kzt, fx.usdToKzt)}) <Approx checked={bom.oldest} />
            {bom.incomplete && <span className="tg-warm"> · incomplete</span>} · fixed costs {kzt(o.manufacturing.fixedCostsKZT)} · MOQ {o.manufacturing.moq} (<Link to={`/tagylym/option/${o.id}`}>edit on the option</Link>)
          </p>
        </GlassCard>

        <div className="tg-stats">
          <GlassCard size="md">
            <p className="eyebrow m-0">Landed cost per kit</p>
            <p className="tg-big tnum">{kzt(lad.landed)}</p>
            <p className="m-0 text-sm">
              {usd(lad.landed, fx.usdToKzt)} · approx.
            </p>
          </GlassCard>
          <GlassCard size="md">
            <p className="eyebrow m-0">Break-even (B2B)</p>
            <p className="tg-big tnum">{o.manufacturing.fixedCostsKZT === 0 ? '—' : sum.breakEven === undefined ? 'never' : `${sum.breakEven.toLocaleString('en-GB')} kits`}</p>
            <p className="m-0 text-sm">{o.manufacturing.fixedCostsKZT === 0 ? 'Add fixed costs (molds, certification, jigs) on the option.' : 'Fixed costs ÷ net per kit.'}</p>
          </GlassCard>
          <GlassCard size="md">
            <p className="eyebrow m-0">Cash for the first batch</p>
            <p className="tg-big tnum">{kzt(sum.firstBatchCash)}</p>
            <p className="m-0 text-sm">
              {o.manufacturing.moq} × landed + fixed costs · {usd(sum.firstBatchCash, fx.usdToKzt)}
            </p>
          </GlassCard>
        </div>

        <GlassCard className="tg-table-wrap" aria-labelledby="tiers-h">
          <h2 id="tiers-h" className="card-title">
            Price ladder and margins
          </h2>
          <table className="tg-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Rule price</th>
                <th>Your target</th>
                <th>Net per kit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {lad.tiers.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.label}</strong>
                    <br />
                    <span className="text-sm">{t.buyer}</span>
                  </td>
                  <td className="tnum">{kzt(t.ladder)}</td>
                  <td className="tnum">{t.target !== undefined ? kzt(t.target) : '—'}</td>
                  <td className="tnum">{kzt(t.net)}</td>
                  <td>
                    <span className={`tnum ${t.flag ? 'tg-warm' : ''}`}>{pct(t.margin)}</span> {t.flag && <Chip tone="warm">under 30%</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 text-sm mt-2">
            Rules: grant = landed × 1.5 · B2B = landed × 2.2 · B2C = B2B × 1.25 rounded to x,990 · Teacher Box = contents × 0.9. Margins use your target price when set. B2C pays the Kaspi fee and delivery. All approx.
          </p>
        </GlassCard>

        <GlassCard aria-labelledby="fx-h">
          <h2 id="fx-h" className="card-title">
            Margin vs exchange rate
          </h2>
          <div className="tg-chart" aria-hidden="true">
            <ResponsiveContainer>
              <LineChart data={sens.map((r) => ({ ...r, b2b: Math.round(r.b2b * 1000) / 10, b2c: r.b2c === undefined ? undefined : Math.round(r.b2c * 1000) / 10 }))} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="var(--card-border-soft)" />
                <XAxis dataKey="fx" {...axis} unit=" ₸" />
                <YAxis {...axis} unit="%" />
                <Tooltip contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--card-border)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={MARGIN_FLAG * 100} stroke="var(--warm)" strokeDasharray="4 4" label={{ value: '30%', fill: 'var(--warm)', fontSize: 11, position: 'insideTopLeft' }} />
                <ReferenceLine x={Math.round(fx.usdToKzt / 10) * 10} stroke="var(--text-3)" strokeDasharray="2 4" />
                <Line dataKey="b2b" name="School B2B" stroke="var(--ice)" strokeWidth={2} dot={false} isAnimationActive={false} />
                {o.prices.b2c && <Line dataKey="b2c" name="Parent B2C" stroke="var(--violet)" strokeWidth={2} dot={false} isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <tbody>
              {sens.map((r) => (
                <tr key={r.fx}>
                  <td>{r.fx} ₸</td>
                  <td>B2B {pct(r.b2b)}</td>
                  {r.b2c !== undefined && <td>B2C {pct(r.b2c)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 text-sm">Most parts are imported and priced in $, so a weaker tenge (right) means a lower margin. Dashed amber line: 30%. Dotted line: today’s rate.</p>
        </GlassCard>
      </div>
    </>
  );
}
