import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { CRITERIA } from '../data/seed';
import { activeProject, saveOption, useFx, useTgData } from '../data/store';
import { bomTotal, lineKZT } from '../engine/econ';
import type { BomLine, KitOption } from '../model/types';
import { Approx, kzt, STATUS_TONE, Tagged, TgNav, ToConfirm, usd } from './common';

/*
 * One kit option (SPEC Module 3 › The five option-scenarios): concept, grades and outcomes, BOM
 * (every price approximate with its check date and source), manufacturing, packaging,
 * curriculum stubs, software, safety notes ([TO CONFIRM] tagged), risks, scores (AI estimates in
 * italics until edited) and target prices. Every field can be edited.
 */

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const fmtDate = (d?: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

function BomTable({ o, fx }: { o: KitOption; fx: number }) {
  const save = (bom: BomLine[]) => void saveOption({ ...o, bom });
  const set = (i: number, patch: Partial<BomLine>) => save(o.bom.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const t = bomTotal(o.bom, fx);
  return (
    <div className="grid gap-2">
      <div className="tg-table-wrap">
        <table className="tg-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Line ₸</th>
              <th>Status</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {o.bom.map((l, i) => (
              <tr key={i}>
                <td>
                  <input className="input tg-cell-wide" defaultValue={l.name} key={`${l.name}-${o.updatedAt}`} onBlur={(e) => e.target.value !== l.name && set(i, { name: e.target.value })} aria-label="Part name" />
                  {l.sourceUrl && (
                    <a className="text-sm" href={l.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {' '}
                      source
                    </a>
                  )}
                </td>
                <td>
                  <input className="input tg-cell" type="number" min={0} step="any" defaultValue={l.qty} key={`q-${o.updatedAt}`} onBlur={(e) => Number(e.target.value) !== l.qty && set(i, { qty: Number(e.target.value) || 0 })} aria-label="Quantity" />
                  {l.qtyLabel && <span className="text-sm"> {l.qtyLabel}</span>}
                </td>
                <td className="tg-nowrap">
                  <input
                    className="input tg-cell"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={Math.round(l.unitCost * 1000) / 1000}
                    key={`u-${o.updatedAt}`}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== Math.round(l.unitCost * 1000) / 1000) set(i, { unitCost: v || 0, isEstimate: false, checkedAt: new Date().toISOString().slice(0, 10) });
                    }}
                    aria-label="Unit cost"
                  />
                  <button type="button" className="pipe-move" onClick={() => set(i, { currency: l.currency === 'USD' ? 'KZT' : 'USD', unitCost: l.currency === 'USD' ? l.unitCost * fx : l.unitCost / fx })} aria-label={`Currency ${l.currency}, switch`}>
                    {l.currency === 'USD' ? '$' : '₸'}
                  </button>
                </td>
                <td className="tnum">{kzt(lineKZT(l, fx))}</td>
                <td>
                  {l.isEstimate ? <Chip tone="warm">estimate</Chip> : <Chip tone="good">quote</Chip>}
                  <span className="text-sm"> {fmtDate(l.checkedAt)}</span>
                </td>
                <td>
                  <button type="button" className="pipe-move" onClick={() => save(o.bom.filter((_, j) => j !== i))} aria-label={`Remove ${l.name}`}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0">
        <strong>Total {kzt(t.kzt)}</strong> ({usd(t.kzt, fx)}) <Approx checked={t.oldest} /> {t.incomplete && <span className="tg-warm">· incomplete: a line has no price</span>}
      </p>
      <p className="m-0 text-sm">Typing a price you were quoted marks the line “quote” with today’s date. Lines in $ follow the exchange rate.</p>
      <PillButton variant="secondary" className="justify-self-start" onClick={() => save([...o.bom, { name: 'New part', qty: 1, unitCost: 0, currency: 'USD', isEstimate: true, checkedAt: new Date().toISOString().slice(0, 10) }])}>
        Add a line
      </PillButton>
    </div>
  );
}

export function OptionPage() {
  const { id } = useParams();
  const data = useTgData();
  const fx = useFx();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const o = data.options.find((x) => x.id === id);

  if (!data.loaded) return <SaltDotsLoader label="Opening" />;
  if (!o)
    return (
      <GlassCard>
        <p className="m-0">
          Not found. <Link to="/tagylym">Back to options</Link>
        </p>
      </GlassCard>
    );

  const save = (patch: Partial<KitOption>) => void saveOption({ ...o, ...patch });
  const project = activeProject(data);
  const locked = project?.optionId === o.id;
  const text = (key: 'name' | 'nameKk' | 'nameRu' | 'concept' | 'packaging' | 'softwareNeeds', label: string, area = false) => (
    <label className="field">
      <span className="field-label">{label}</span>
      {area ? (
        <textarea className="input" rows={3} defaultValue={o[key] ?? ''} key={`${key}-${o.updatedAt}`} onBlur={(e) => e.target.value !== (o[key] ?? '') && save({ [key]: e.target.value || undefined })} />
      ) : (
        <input className="input" defaultValue={o[key] ?? ''} key={`${key}-${o.updatedAt}`} lang={key === 'nameKk' ? 'kk' : key === 'nameRu' ? 'ru' : undefined} onBlur={(e) => e.target.value !== (o[key] ?? '') && save({ [key]: e.target.value || undefined })} />
      )}
    </label>
  );

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/tagylym">Kit Studio</Link> · Option {o.code}
        </p>
        <h1 className="ff-title">
          {o.name}
          {o.nameKk && (
            <span className="ff-gloss" lang="kk">
              {o.nameKk}
            </span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={STATUS_TONE[o.status]}>{o.status}</Chip>
          {o.source !== 'seed' && <Chip>{o.source === 'ai' ? 'from Idea Forge' : o.source === 'merge' ? 'merged platform' : 'added by hand'}</Chip>}
          {!o.isTeacherBox && (
            <>
              <Link to={`/tagylym/economics?option=${o.id}`} className="pill pill--secondary">
                Economics
              </Link>
              <Link to={`/tagylym/forge?critique=${o.id}`} className="pill pill--secondary">
                Ask Claude to critique
              </Link>
              <Link to={`/tagylym/pipeline?option=${o.id}`} className="pill pill--secondary">
                What-if pipeline
              </Link>
            </>
          )}
        </div>
      </header>
      <TgNav />

      <div className="grid gap-3">
        <GlassCard className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {text('name', 'Name')}
            {text('nameKk', 'Name in Kazakh')}
            {text('nameRu', 'Name in Russian')}
          </div>
          {text('concept', 'Concept', true)}
          <p className="m-0 text-sm">
            <Tagged text={o.concept.match(/\[TO CONFIRM[^\]]*\]/)?.[0] ?? ''} />
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">
              <span className="field-label">Grades from</span>
              <input className="input" type="number" min={1} max={6} value={o.gradeMin} onChange={(e) => save({ gradeMin: Number(e.target.value) || 1 })} />
            </label>
            <label className="field">
              <span className="field-label">to</span>
              <input className="input" type="number" min={1} max={6} value={o.gradeMax} onChange={(e) => save({ gradeMax: Number(e.target.value) || 6 })} />
            </label>
            <label className="field">
              <span className="field-label">Controller</span>
              <input className="input" defaultValue={o.controller ?? ''} key={`c-${o.updatedAt}`} onBlur={(e) => save({ controller: e.target.value.trim() || undefined })} placeholder="none" />
            </label>
          </div>
          {o.outcomes.length > 0 && (
            <ul className="tg-list">
              {o.outcomes.map((x, i) => (
                <li key={i}>
                  <strong>G{x.grade}</strong> {x.text}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {!o.isTeacherBox && (
          <GlassCard className="grid gap-2" aria-labelledby="scores-h">
            <h2 id="scores-h" className="card-title m-0">
              Scores (1–5)
            </h2>
            <div className="tg-scores">
              {CRITERIA.map((c) => {
                const s = o.scores[c.id];
                return (
                  <label key={c.id} className="field">
                    <span className="field-label">
                      {c.label}
                      {c.hint && <span className="text-sm"> ({c.hint})</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <input
                        className={`input tg-cell ${s.aiEstimate ? 'tg-ai' : ''}`}
                        type="number"
                        min={1}
                        max={5}
                        value={s.value}
                        onChange={(e) => save({ scores: { ...o.scores, [c.id]: { value: Math.min(5, Math.max(1, Number(e.target.value) || 1)) } } })}
                      />
                      {s.aiEstimate && <em className="text-sm">AI estimate</em>}
                    </span>
                  </label>
                );
              })}
            </div>
          </GlassCard>
        )}

        <GlassCard className="grid gap-2" aria-labelledby="bom-h">
          <h2 id="bom-h" className="card-title m-0">
            {o.isTeacherBox ? 'Extras in the crate' : 'Bill of materials'} <span className="text-sm">per kit at MOQ {o.manufacturing.moq}</span>
          </h2>
          <BomTable o={o} fx={fx.usdToKzt} />
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="price-h">
          <h2 id="price-h" className="card-title m-0">
            Target prices <Approx />
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ['b2b', 'School B2B ₸'],
                ['b2c', 'Parent B2C ₸'],
                ['grant', 'Grant ₸'],
                ['refill', 'Refill pack ₸'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="field">
                <span className="field-label">{label}</span>
                <input className="input" type="number" min={0} defaultValue={o.prices[k] ?? ''} key={`${k}-${o.updatedAt}`} onBlur={(e) => num(e.target.value) !== o.prices[k] && save({ prices: { ...o.prices, [k]: num(e.target.value) } })} />
              </label>
            ))}
          </div>
          {!o.isTeacherBox && (
            <label className="flex items-center gap-3">
              <input type="checkbox" className="check" checked={o.sellAsTeacherBox} onChange={(e) => save({ sellAsTeacherBox: e.target.checked })} />
              <span>Sell as Teacher Box too (6 robots + 12 Qagaz Bot envelopes + extras, for a class of 24)</span>
            </label>
          )}
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="mfg-h">
          <h2 id="mfg-h" className="card-title m-0">
            Manufacturing and packaging
          </h2>
          <p className="m-0">
            <Tagged text={o.manufacturing.method} />
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">
              <span className="field-label">MOQ (kits)</span>
              <input className="input" type="number" min={1} defaultValue={o.manufacturing.moq} key={`moq-${o.updatedAt}`} onBlur={(e) => save({ manufacturing: { ...o.manufacturing, moq: Number(e.target.value) || 1 } })} />
            </label>
            <label className="field">
              <span className="field-label">Fixed costs ₸ (molds, certification, jigs)</span>
              <input className="input" type="number" min={0} defaultValue={o.manufacturing.fixedCostsKZT} key={`fix-${o.updatedAt}`} onBlur={(e) => save({ manufacturing: { ...o.manufacturing, fixedCostsKZT: Number(e.target.value) || 0 } })} />
            </label>
            <label className="field">
              <span className="field-label">Lead time, days</span>
              <input className="input" type="number" min={0} defaultValue={o.manufacturing.leadTimeDays ?? ''} key={`lt-${o.updatedAt}`} onBlur={(e) => save({ manufacturing: { ...o.manufacturing, leadTimeDays: num(e.target.value) } })} />
            </label>
          </div>
          {o.manufacturing.supplierNotes && <p className="m-0 text-sm">{o.manufacturing.supplierNotes}</p>}
          {text('packaging', 'Packaging')}
          {text('softwareNeeds', 'Software')}
        </GlassCard>

        {o.curriculum.length > 0 && (
          <GlassCard className="grid gap-2" aria-labelledby="cur-h">
            <h2 id="cur-h" className="card-title m-0">
              Curriculum · {o.lessonCount} lessons
            </h2>
            <ol className="tg-list">
              {o.curriculum.map((l) => (
                <li key={l.index}>
                  <span className="tnum text-sm">{l.index}.</span> {l.title}
                </li>
              ))}
            </ol>
            <p className="m-0 text-sm">Sample titles from the plan; Kazakh and Russian titles still to write.</p>
          </GlassCard>
        )}

        <GlassCard className="grid gap-2" aria-labelledby="safe-h">
          <h2 id="safe-h" className="card-title m-0">
            Safety and certification
          </h2>
          <ul className="tg-list">
            {o.safetyNotes.map((n, i) => (
              <li key={i}>
                <strong>{n.regulation}:</strong> {n.text} {n.toConfirm && <ToConfirm />}
              </li>
            ))}
          </ul>
          <h3 className="card-title m-0">Risks</h3>
          <ul className="tg-list">
            {o.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </GlassCard>

        <div className="flex flex-wrap gap-2">
          {!o.isTeacherBox && o.status !== 'active' && (
            <PillButton variant="secondary" onClick={() => save({ status: o.status === 'parked' ? 'exploring' : 'parked' })}>
              {o.status === 'parked' ? 'Explore again' : 'Park this option'}
            </PillButton>
          )}
          {o.source !== 'seed' && (
            <PillButton
              variant="secondary"
              disabled={locked}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                void saveOption({ ...o, deletedAt: new Date().toISOString() }).then(() => navigate('/tagylym'));
              }}
            >
              {locked ? 'Has an active project: park instead' : confirmDelete ? 'Tap again to delete' : 'Delete option'}
            </PillButton>
          )}
        </div>
      </div>
    </>
  );
}
