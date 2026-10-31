import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { FreezeFrontBar, SaltDotsLoader } from '../../../core/design/FreezeFront';
import { uploadPhoto } from '../data/storage';
import { newAsset, removeRow, saveAsset, saveBom, saveFrostSettings, saveStep, useBomMap, useFrostData, useFrostSettings } from '../data/store';
import { bomTotals, nextStatus, stepUnlocked } from '../engine/compete';
import type { BomItem, BuildStep, Subsystem } from '../model/types';
import { FrostNav, money } from './common';

/*
 * Prototype builder (SPEC Module 2 › 2): the BOM grouped by subsystem with live totals in ₸ and $
 * (every price approximate), and the Build Guide, whose steps stay locked until their parts are
 * "have". Step photos are saved as a "build" photo set in Media.
 */

const GROUPS: [Subsystem, string][] = [
  ['have', 'Have'],
  ['waterPath', 'Water path'],
  ['sensors', 'Sensors'],
  ['controlPower', 'Control and power'],
  ['safetyTools', 'Safety and tools'],
];
const STATUS_TONE = { need: 'warm', ordered: 'ice', have: 'good' } as const;
const kzt = new Intl.NumberFormat('en-GB');

function BomRow({ item, rate }: { item: BomItem; rate: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(item);
  const set = (patch: Partial<BomItem>) => setDraft({ ...draft, ...patch });
  const text = (key: 'name' | 'model' | 'purpose' | 'supplierUrl' | 'datasheetUrl' | 'notes' | 'partTag', label: string, type = 'text') => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type={type} value={draft[key] ?? ''} onChange={(e) => set({ [key]: e.target.value || undefined } as Partial<BomItem>)} />
    </label>
  );

  return (
    <li className="fp-bom-row">
      <div className="fp-bom-main">
        <button type="button" className="fp-bom-name" aria-expanded={open} onClick={() => setOpen(!open)}>
          {item.name}
          {item.model && <span className="text-sm"> · {item.model}</span>}
          <span className="entry-meta">{item.purpose}</span>
        </button>
        <span className="tnum text-sm">
          {item.qtyLabel ?? `×${item.qty}`}
          {item.unitPriceKZT !== undefined && <> · ≈ {kzt.format(item.unitPriceKZT)} ₸</>}
        </span>
        <button
          type="button"
          className="fp-status"
          onClick={() => void saveBom({ ...item, status: nextStatus(item.status), orderedAt: nextStatus(item.status) === 'ordered' ? new Date().toISOString() : item.orderedAt })}
          aria-label={`${item.name}: ${item.status}. Change status`}
        >
          <Chip tone={STATUS_TONE[item.status]}>{item.status}</Chip>
        </button>
      </div>
      {open && (
        <form
          className="grid gap-3 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveBom(draft).then(() => setOpen(false));
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {text('name', 'Name')}
            {text('model', 'Model')}
            <label className="field">
              <span className="field-label">Quantity</span>
              <input className="input" type="number" min={0} value={draft.qty} onChange={(e) => set({ qty: Number(e.target.value) || 0 })} />
            </label>
            <label className="field">
              <span className="field-label">≈ price each, ₸ (approx.)</span>
              <input className="input" type="number" min={0} value={draft.unitPriceKZT ?? ''} onChange={(e) => set({ unitPriceKZT: e.target.value === '' ? undefined : Number(e.target.value) })} />
              {draft.unitPriceKZT !== undefined && <span className="text-sm">{money(draft.unitPriceKZT, rate)}</span>}
            </label>
            {text('purpose', 'Purpose')}
            {text('partTag', 'Part tag (EC1, V2 …)')}
            {text('supplierUrl', 'Supplier link (Kaspi, AliExpress, shop)', 'url')}
            {text('datasheetUrl', 'Datasheet link', 'url')}
            {draft.status === 'ordered' && (
              <label className="field">
                <span className="field-label">Parcel expected</span>
                <input className="input" type="date" value={draft.expectedAt ?? ''} onChange={(e) => set({ expectedAt: e.target.value || undefined })} />
              </label>
            )}
          </div>
          {text('notes', 'Notes')}
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit">Save</PillButton>
            {item.supplierUrl && (
              <a className="pill pill--secondary" href={item.supplierUrl} target="_blank" rel="noopener noreferrer">
                Open supplier
              </a>
            )}
            {item.datasheetUrl && (
              <a className="pill pill--secondary" href={item.datasheetUrl} target="_blank" rel="noopener noreferrer">
                Datasheet
              </a>
            )}
            <PillButton variant="secondary" onClick={() => void removeRow(saveBom, item)}>
              Delete
            </PillButton>
          </div>
        </form>
      )}
    </li>
  );
}

function Bom() {
  const data = useFrostData();
  const settings = useFrostSettings();
  const totals = useMemo(() => bomTotals(data.bom), [data.bom]);
  const [rate, setRate] = useState<string>('');

  return (
    <div className="grid gap-3">
      {GROUPS.map(([g, label]) => {
        const rows = data.bom.filter((b) => b.subsystem === g);
        if (!rows.length) return null;
        return (
          <GlassCard key={g} className="grid gap-2" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`} className="card-title m-0">
              {label}
            </h2>
            <ul className="fp-bom">
              {rows.map((b) => (
                <BomRow key={`${b.id}:${b.updatedAt}`} item={b} rate={settings.usdRate} />
              ))}
            </ul>
          </GlassCard>
        );
      })}
      <PillButton
        variant="secondary"
        className="justify-self-start"
        onClick={() =>
          void saveBom({
            id: crypto.randomUUID(),
            order: data.bom.length,
            name: 'New part',
            subsystem: 'safetyTools',
            qty: 1,
            status: 'need',
            purpose: '',
            notes: '',
            updatedAt: new Date().toISOString(),
          })
        }
      >
        Add a part
      </PillButton>

      <div className="fp-bom-footer card card--md" role="status">
        <p className="m-0">
          <strong>Still to buy {money(totals.stillToBuyKZT, settings.usdRate)}</strong> <span className="text-sm">approx.</span>
          {totals.orderedKZT > 0 && <span className="text-sm"> · ordered {money(totals.orderedKZT, settings.usdRate)}</span>}
        </p>
        <p className="m-0 text-sm">
          Whole prototype {money(totals.totalKZT, settings.usdRate)} vs the Unit Design target ≈ ${settings.targetUsd[0]}–{settings.targetUsd[1]} · rate {settings.usdRate} ₸ = $1 (approximate){' '}
          <input
            className="input fp-rate"
            type="number"
            min={1}
            placeholder="edit"
            aria-label="Tenge per dollar"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onBlur={() => {
              const n = Number(rate);
              if (n > 0) void saveFrostSettings({ ...settings, usdRate: n });
              setRate('');
            }}
          />
        </p>
      </div>
    </div>
  );
}

function StepCard({ step, locked, missing }: { step: BuildStep; locked: boolean; missing: string[] }) {
  const data = useFrostData();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const bomMap = useBomMap(data.bom);
  const [newItem, setNewItem] = useState('');

  const addPhoto = async (f?: File) => {
    if (!f) return;
    setMsg('Uploading…');
    try {
      const existing = data.assets.find((a) => a.id === `build-${step.id}`);
      const asset = existing ?? newAsset('photoSet', `Build: ${step.title}`, { id: `build-${step.id}`, tags: ['build'], linkedStepIds: [step.id] });
      const photo = await uploadPhoto(asset.id, f);
      await saveAsset({ ...asset, photos: [...asset.photos, photo] });
      if (!step.photoAssetIds.includes(asset.id)) await saveStep({ ...step, photoAssetIds: [...step.photoAssetIds, asset.id] });
      setMsg('Photo saved to Media.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const photos = data.assets.find((a) => a.id === `build-${step.id}`)?.photos.length ?? 0;

  return (
    <li className={`card card--md fp-step ${locked ? 'fp-step--locked' : ''} ${step.doneAt ? 'fp-step--done' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="step-badge" aria-hidden="true">
          {String(step.order).padStart(2, '0')}
        </span>
        <h3 className="card-title m-0">{step.title}</h3>
        <span className="text-sm">~{step.estMinutes} min</span>
        {locked && <Chip tone="warm">Locked</Chip>}
        {step.doneAt && <Chip tone="good">Done</Chip>}
      </div>
      <p className="m-0">{step.body}</p>
      <div className="flex flex-wrap gap-2" aria-label="Parts needed">
        {step.requiredBomIds.map((id) => {
          const b = bomMap.get(id);
          return b ? (
            <Chip key={id} tone={b.status === 'have' ? 'good' : 'plain'}>
              {b.name.split(' (')[0]}
            </Chip>
          ) : null;
        })}
      </div>
      {locked && <p className="m-0 text-sm">Waiting for: {missing.join(', ')}.</p>}
      <ul className="fp-check">
        {step.checklist.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="check"
                checked={c.done}
                onChange={() => void saveStep({ ...step, checklist: step.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}
              />
              <span className={c.done ? 'fp-done' : ''}>{c.text}</span>
            </label>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newItem.trim()) return;
          void saveStep({ ...step, checklist: [...step.checklist, { id: crypto.randomUUID(), text: newItem.trim(), done: false }] });
          setNewItem('');
        }}
      >
        <input className="input" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a checklist item" aria-label={`Add a checklist item to ${step.title}`} />
        <PillButton type="submit" variant="secondary" disabled={!newItem.trim()}>
          Add
        </PillButton>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <PillButton disabled={locked && !step.doneAt} onClick={() => void saveStep({ ...step, doneAt: step.doneAt ? undefined : new Date().toISOString() })}>
          {step.doneAt ? 'Mark not done' : 'Done'}
        </PillButton>
        <PillButton variant="secondary" onClick={() => file.current?.click()}>
          Add photo{photos ? ` (${photos})` : ''}
        </PillButton>
        <input
          ref={file}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void addPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {step.id === 'step-pi' || step.id === 'step-temps' || step.id === 'step-ec' || step.id === 'step-level' || step.id === 'step-valves' || step.id === 'step-dry' ? (
          <Link to="/frostpure/pi" className="pill pill--secondary">
            Pi setup
          </Link>
        ) : null}
      </div>
      {msg && (
        <p className="m-0 text-sm" role="status">
          {msg}
        </p>
      )}
    </li>
  );
}

function Guide() {
  const data = useFrostData();
  const bomMap = useBomMap(data.bom);
  const done = data.steps.filter((s) => s.doneAt).length;
  return (
    <div className="grid gap-3">
      <FreezeFrontBar value={data.steps.length ? done / data.steps.length : 0} label="Build progress" valueText={`${done} of ${data.steps.length} steps done`} />
      <p className="notice notice--warm m-0 text-sm">
        Safety: keep 12 V wiring and the Pi away from water (IP65 box, fuse, cable glands). Never charge a lithium battery below 0 °C. Ice expands about 9%: never freeze a sealed container.
      </p>
      <ol className="fp-steps">
        {data.steps.map((s) => {
          const u = stepUnlocked(s, bomMap);
          return <StepCard key={s.id} step={s} locked={!u.open} missing={u.missing.map((m) => m.name)} />;
        })}
      </ol>
      <PillButton
        variant="secondary"
        className="justify-self-start"
        onClick={() =>
          void saveStep({
            id: crypto.randomUUID(),
            order: data.steps.length + 1,
            title: 'New step',
            body: '',
            estMinutes: 30,
            requiredBomIds: [],
            checklist: [],
            photoAssetIds: [],
            updatedAt: new Date().toISOString(),
          })
        }
      >
        Add a step
      </PillButton>
    </div>
  );
}

export function BuildPage() {
  const data = useFrostData();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'guide' ? 'guide' : 'bom';
  if (!data.loaded) return <SaltDotsLoader label="Opening Build" />;
  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · Build
        </p>
        <h1 className="ff-title">Build</h1>
      </header>
      <FrostNav />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="seg" role="tablist" aria-label="Build view">
          {(
            [
              ['bom', 'Parts list'],
              ['guide', 'Build guide'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} aria-pressed={tab === v} className="seg-btn" onClick={() => setParams(v === 'bom' ? {} : { tab: v }, { replace: true })}>
              {l}
            </button>
          ))}
        </div>
        <Link to="/frostpure/pi" className="pill pill--secondary">
          Pi setup
        </Link>
      </div>
      {tab === 'bom' ? <Bom /> : <Guide />}
    </>
  );
}
