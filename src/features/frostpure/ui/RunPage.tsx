import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { Mascot } from '../../../core/design/Mascot';
import { Sheet } from '../../../core/design/Sheet';
import { momentTime } from '../data/planner';
import { PHASES } from '../data/seed';
import { addSample, removeRow, saveRun, useDevice, useFrostData } from '../data/store';
import { computeResults, ecForSalinity, MASS_BALANCE_LIMIT, pct, type Value } from '../engine/results';
import type { Run, Sample, SamplePoint, TestMoment, Variable } from '../model/types';
import { FrostNav, Measured, PHASE_LABEL, POINT_LABEL } from './common';
import { LiveTelemetry, triggeredMoments, useRunTelemetry } from './LiveTelemetry';

/*
 * One experiment run (SPEC Module 2 › 3): Define Run (form), the Run-sheet (phases with checklists
 * and timers; a push arrives when a timer ends, even with the page closed), Log sample (works
 * offline; handheld readings are the reference), Live Telemetry, and Results.
 */

const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });
const VARIABLES: [Variable, string][] = [
  ['salinity', 'Salinity'],
  ['temperature', 'Temperature'],
  ['frozenPct', '% frozen'],
  ['drainTiming', 'Drain timing'],
  ['duration', 'Duration'],
];
const POINTS = Object.keys(POINT_LABEL) as SamplePoint[];

const SAFETY = [
  'Ice-melt water is not drinking water until tested: freezing removes salt, not germs. Label every sample “not for drinking”.',
  'Keep 12 V wiring and the Pi away from water: IP65 box, fuse, cable glands. Never charge a lithium battery below 0 °C.',
  'Ice expands about 9%: never freeze a sealed container; drain at the target ice fraction.',
  'Outdoors: gloves and short checks; no one works alone near the outdoor rig at night.',
  'Do not dump concentrated brine on soil or plants; dilute it into a drain (local rule to confirm).',
];

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input, and back. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => new Date(v).toISOString();
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

function Define({ run, onDone }: { run: Run; onDone: () => void }) {
  const [r, setR] = useState(run);
  const set = (patch: Partial<Run>) => setR({ ...r, ...patch });
  const n = (label: string, value: number | undefined, onChange: (v: number | undefined) => void, hint?: string, step = 'any') => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="number" step={step} value={value ?? ''} onChange={(e) => onChange(num(e.target.value))} />
      {hint && <span className="text-sm">{hint}</span>}
    </label>
  );
  const [moment, setMoment] = useState<{ title: string; kind: TestMoment['kind']; at: string; afterMin: string; metric: 'icePct' | 'ec1'; value: string; instruction: string }>({
    title: '',
    kind: 'afterStart',
    at: '',
    afterMin: '',
    metric: 'icePct',
    value: '65',
    instruction: '',
  });

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void saveRun(r).then(onDone);
      }}
    >
      <GlassCard className="grid gap-3">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={r.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="field">
          <span className="field-label">Rig</span>
          <div className="seg" role="radiogroup" aria-label="Rig">
            {(
              [
                ['lab', 'Lab 20 L'],
                ['outdoor', 'Outdoor 200 L'],
                ['custom', 'Custom'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={r.rig === v} className="seg-btn" onClick={() => set({ rig: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {n('Initial salinity, g/L (0–20)', r.feedSalinityGL, (v) => set({ feedSalinityGL: Math.min(20, Math.max(0, v ?? 0)) }), `≈ ${ecForSalinity(r.feedSalinityGL, r.tdsK).toFixed(1)} mS/cm (estimate, k = ${r.tdsK})`)}
          {n('Feed volume, L', r.feedVolumeL, (v) => set({ feedVolumeL: v ?? 0 }))}
          {n('Ambient / freezer temperature, °C (planned)', r.plannedAmbientC, (v) => set({ plannedAmbientC: v ?? 0 }))}
          {n('Freeze duration, h (planned)', r.plannedFreezeHours, (v) => set({ plannedFreezeHours: v ?? 0 }))}
          {n('Target % frozen before drain', r.targetFrozenPct, (v) => set({ targetFrozenPct: v ?? 65 }))}
          {n('TDS factor k (TDS mg/L ≈ k × EC µS/cm)', r.tdsK, (v) => set({ tdsK: v ?? 0.64 }))}
        </div>
        <div className="field">
          <span className="field-label">Drain timing rule</span>
          <div className="seg" role="radiogroup" aria-label="Drain timing rule">
            {(
              [
                ['targetIce', 'At target % ice'],
                ['ec1Limit', 'At EC1 limit'],
                ['fixedTime', 'At fixed time'],
                ['manual', 'Manual'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={r.drainRule.kind === v} className="seg-btn" onClick={() => set({ drainRule: { kind: v, value: v === 'targetIce' ? r.targetFrozenPct : undefined } })}>
                {l}
              </button>
            ))}
          </div>
          {(r.drainRule.kind === 'ec1Limit' || r.drainRule.kind === 'fixedTime') &&
            n(r.drainRule.kind === 'ec1Limit' ? 'EC1 limit, mS/cm' : 'Hours after start', r.drainRule.value, (v) => set({ drainRule: { ...r.drainRule, value: v } }))}
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="check" checked={r.sweatEnabled} onChange={(e) => set({ sweatEnabled: e.target.checked })} />
          <span>Sweat step</span>
        </label>
        {r.sweatEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            {n('Sweat duration, min', r.sweatMinutes, (v) => set({ sweatMinutes: v }))}
            {n('EC2 switch threshold, mS/cm', r.ec2SwitchMS, (v) => set({ ec2SwitchMS: v }))}
          </div>
        )}
        <div className="field">
          <span className="field-label">Variable under test</span>
          <div className="seg" role="radiogroup" aria-label="Variable under test">
            {VARIABLES.map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={r.variable === v} className="seg-btn" onClick={() => set({ variable: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Hypothesis</span>
          <textarea className="input" rows={2} value={r.hypothesis} onChange={(e) => set({ hypothesis: e.target.value })} />
        </label>
      </GlassCard>

      <GlassCard className="grid gap-3" aria-labelledby="moments-h">
        <h2 id="moments-h" className="card-title m-0">
          Test moments
        </h2>
        {r.moments.length > 0 && (
          <ul className="fp-check">
            {r.moments.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {m.title} · {m.kind === 'at' && m.at ? WHEN.format(new Date(m.at)) : m.kind === 'afterStart' ? `${m.afterMin} min after start` : `when ${m.when?.metric === 'icePct' ? 'ice ≥' : 'EC1 ≥'} ${m.when?.value}${m.when?.metric === 'icePct' ? '%' : ' mS/cm'}`}
                </span>
                <button type="button" className="pipe-move" onClick={() => set({ moments: r.moments.filter((x) => x.id !== m.id) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field">
            <span className="field-label">Title</span>
            <input className="input" value={moment.title} onChange={(e) => setMoment({ ...moment, title: e.target.value })} placeholder="Night 3 — sample at 07:00" />
          </label>
          <div className="field">
            <span className="field-label">When</span>
            <div className="seg" role="radiogroup" aria-label="When">
              {(
                [
                  ['afterStart', 'After start'],
                  ['at', 'At a time'],
                  ['when', 'Sensor'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={moment.kind === v} className="seg-btn" onClick={() => setMoment({ ...moment, kind: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {moment.kind === 'at' && (
            <label className="field">
              <span className="field-label">Date and time</span>
              <input className="input" type="datetime-local" value={moment.at} onChange={(e) => setMoment({ ...moment, at: e.target.value })} />
            </label>
          )}
          {moment.kind === 'afterStart' && (
            <label className="field">
              <span className="field-label">Minutes after start</span>
              <input className="input" type="number" min={0} value={moment.afterMin} onChange={(e) => setMoment({ ...moment, afterMin: e.target.value })} />
            </label>
          )}
          {moment.kind === 'when' && (
            <div className="grid gap-2">
              <div className="seg" role="radiogroup" aria-label="Sensor">
                {(
                  [
                    ['icePct', 'Ice %'],
                    ['ec1', 'EC1 mS/cm'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={moment.metric === v} className="seg-btn" onClick={() => setMoment({ ...moment, metric: v })}>
                    {l}
                  </button>
                ))}
              </div>
              <input className="input" type="number" value={moment.value} onChange={(e) => setMoment({ ...moment, value: e.target.value })} aria-label="Reaches" />
            </div>
          )}
          <label className="field">
            <span className="field-label">Instruction</span>
            <input className="input" value={moment.instruction} onChange={(e) => setMoment({ ...moment, instruction: e.target.value })} placeholder="Take 50 mL from the clean tap, measure EC with the handheld meter" />
          </label>
        </div>
        <PillButton
          variant="secondary"
          className="justify-self-start"
          disabled={!moment.title.trim() || (moment.kind === 'at' && !moment.at) || (moment.kind === 'afterStart' && moment.afterMin === '')}
          onClick={() => {
            const m: TestMoment = {
              id: crypto.randomUUID(),
              title: moment.title.trim(),
              kind: moment.kind,
              instruction: moment.instruction.trim(),
              at: moment.kind === 'at' ? fromLocalInput(moment.at) : undefined,
              afterMin: moment.kind === 'afterStart' ? Number(moment.afterMin) : undefined,
              when: moment.kind === 'when' ? { metric: moment.metric, value: Number(moment.value) } : undefined,
            };
            set({ moments: [...r.moments, m] });
            setMoment({ ...moment, title: '', instruction: '' });
          }}
        >
          Add test moment
        </PillButton>
        <p className="m-0 text-sm">Timed moments go to the Planner and arrive as a push (10 min before and on time). Sensor moments show here when the Pi’s readings reach them.</p>
      </GlassCard>

      <ul className="notice notice--warm m-0 grid gap-1 pl-8 text-sm">
        {SAFETY.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <PillButton type="submit">Save run</PillButton>
        <PillButton variant="secondary" onClick={onDone}>
          Cancel
        </PillButton>
      </div>
    </form>
  );
}

function SampleSheet({ run, open, onClose }: { run: Run; open: boolean; onClose: () => void }) {
  const blank = { at: toLocalInput(new Date().toISOString()), point: 'clean' as SamplePoint, unit: 'ec' as 'ec' | 'tds', value: '', tempC: '', volumeL: '', note: '' };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (open) setF({ ...blank, at: toLocalInput(new Date().toISOString()) });
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Log sample">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const v = num(f.value);
          const s: Omit<Sample, 'id'> = {
            at: fromLocalInput(f.at),
            point: f.point,
            ecMS: f.unit === 'ec' ? v : undefined,
            tdsMgL: f.unit === 'tds' ? v : undefined,
            tempC: num(f.tempC),
            volumeL: num(f.volumeL),
            source: 'handheld',
            note: f.note.trim(),
          };
          void addSample(run, s).then(onClose);
        }}
      >
        <label className="field">
          <span className="field-label">Time</span>
          <input className="input" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} />
        </label>
        <div className="field">
          <span className="field-label">Sample point</span>
          <div className="seg" role="radiogroup" aria-label="Sample point">
            {POINTS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={f.point === p} className="seg-btn" onClick={() => setF({ ...f, point: p })}>
                {POINT_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="field">
            <span className="field-label">Reading</span>
            <div className="flex gap-2">
              <input className="input" type="number" step="any" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} aria-label="Reading value" />
              <div className="seg" role="radiogroup" aria-label="Unit">
                {(
                  [
                    ['ec', 'mS/cm'],
                    ['tds', 'mg/L'],
                  ] as const
                ).map(([u, l]) => (
                  <button key={u} type="button" role="radio" aria-checked={f.unit === u} className="seg-btn" onClick={() => setF({ ...f, unit: u })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Temperature, °C</span>
            <input className="input" type="number" step="any" value={f.tempC} onChange={(e) => setF({ ...f, tempC: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Volume, L</span>
            <input className="input" type="number" step="any" min={0} value={f.volumeL} onChange={(e) => setF({ ...f, volumeL: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Note</span>
            <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
        </div>
        <p className="m-0 text-sm">Handheld meter readings are the reference: within ±15 min they replace a Pi reading for the same point. Works offline.</p>
        <PillButton type="submit" disabled={f.value === '' && f.volumeL === ''}>
          Save sample
        </PillButton>
      </form>
    </Sheet>
  );
}

function Big({ label, v, headline }: { label: string; v: Value; headline?: boolean }) {
  return (
    <div className="fp-result">
      <span className="eyebrow m-0">{label}</span>
      <span className={`fp-big ${headline && v.ok ? 'fp-warm' : ''} ${v.ok ? '' : 'fp-big--na'}`}>{v.ok ? `${Math.round(v.value * 100)}%` : v.reason}</span>
      {v.ok && <Measured kind="measured" />}
    </div>
  );
}

export function RunPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const data = useFrostData();
  const device = useDevice();
  const navigate = useNavigate();
  const [sampleOpen, setSampleOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const run = data.runs.find((r) => r.id === id);
  const tele = useRunTelemetry(run ?? ({ id: '', moments: [] } as unknown as Run));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const results = useMemo(() => (run ? computeResults(run) : undefined), [run]);
  const prevBestR = useMemo(() => Math.max(0, ...data.runs.filter((r) => r.id !== id && r.status === 'done').map((r) => (computeResults(r).rejection.ok ? (computeResults(r).rejection as { value: number }).value : 0))), [data.runs, id]);

  // A running timer shows in the page title.
  const timer = run?.phases.find((p) => p.timerEndsAt && !p.doneAt && Date.parse(p.timerEndsAt) > now.getTime());
  useEffect(() => {
    const base = document.title;
    if (timer) {
      const s = Math.max(0, Math.round((Date.parse(timer.timerEndsAt!) - now.getTime()) / 1000));
      document.title = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${PHASE_LABEL[timer.id]}`;
    }
    return () => {
      document.title = base;
    };
  }, [timer, now]);

  if (!data.loaded) return <SaltDotsLoader label="Opening the run" />;
  if (!run)
    return (
      <GlassCard>
        <p className="m-0">
          Run not found. <Link to="/frostpure/lab">Back to the lab</Link>
        </p>
      </GlassCard>
    );

  if (params.get('edit')) return <Define run={run} onDone={() => setParams({}, { replace: true })} />;

  const r = results!;
  const triggered = run.status === 'running' ? triggeredMoments(run, tele.rows, device.probes, device.waterDepthCm, device.iceThresholdC) : [];
  const firstClean = r.rejection.ok && r.rejection.value >= 0.7 && prevBestR < 0.7;
  const setPhase = (pid: string, patch: Partial<Run['phases'][number]>) => saveRun({ ...run, phases: run.phases.map((p) => (p.id === pid ? { ...p, ...patch } : p)) });

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · <Link to="/frostpure/lab">Lab</Link> · {run.rig}
        </p>
        <h1 className="ff-title">{run.name}</h1>
        <p className="m-0">
          {run.feedSalinityGL} g/L · {run.feedVolumeL} L · {run.plannedAmbientC} °C · {run.plannedFreezeHours} h · drain {run.drainRule.kind === 'targetIce' ? `at ${run.targetFrozenPct}% ice` : run.drainRule.kind === 'ec1Limit' ? `at EC1 ${run.drainRule.value ?? '?'} mS/cm` : run.drainRule.kind === 'fixedTime' ? `after ${run.drainRule.value ?? '?'} h` : 'by hand'}
        </p>
        {run.hypothesis && <p className="m-0 text-sm">Hypothesis: {run.hypothesis}</p>}
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip tone={run.status === 'running' ? 'ice' : run.status === 'done' ? 'good' : 'plain'}>{run.status}</Chip>
          {run.status === 'planned' && (
            <>
              <PillButton onClick={() => void saveRun({ ...run, status: 'running', startedAt: new Date().toISOString(), deviceId: device.deviceId })}>Start run</PillButton>
              <PillButton variant="secondary" onClick={() => setParams({ edit: '1' })}>
                Edit
              </PillButton>
            </>
          )}
          {run.status === 'running' && (
            <>
              <PillButton onClick={() => setSampleOpen(true)}>Log sample</PillButton>
              <PillButton variant="secondary" onClick={() => void saveRun({ ...run, status: 'done', endedAt: new Date().toISOString() })}>
                Finish run
              </PillButton>
              <PillButton variant="secondary" onClick={() => void saveRun({ ...run, status: 'aborted', endedAt: new Date().toISOString() })}>
                Abort
              </PillButton>
            </>
          )}
          {(run.status === 'done' || run.status === 'aborted') && (
            <PillButton variant="secondary" onClick={() => setSampleOpen(true)}>
              Add sample
            </PillButton>
          )}
          {run.status !== 'running' && (
            <PillButton variant="secondary" onClick={() => void removeRow(saveRun, run).then(() => navigate('/frostpure/lab'))}>
              Delete run
            </PillButton>
          )}
        </div>
      </header>
      <FrostNav />

      <div className="grid gap-3">
        {triggered.map((m) => (
          <p key={m.id} className="notice notice--warm m-0 flex flex-wrap items-center justify-between gap-2" role="alert">
            <span>
              <strong>{m.title}</strong> — the sensor condition is reached. {m.instruction}
            </span>
            <PillButton variant="secondary" onClick={() => void saveRun({ ...run, moments: run.moments.map((x) => (x.id === m.id ? { ...x, doneAt: new Date().toISOString() } : x)) })}>
              Done
            </PillButton>
          </p>
        ))}
        {firstClean && (
          <div className="notice notice--good flex items-center gap-3" role="status">
            <Mascot mood="happy" size={48} bounce />
            <p className="m-0">
              <strong>First clean water.</strong> Measured salt rejection passed the 70% target.
            </p>
          </div>
        )}

        <GlassCard className="grid gap-3" aria-labelledby="sheet-h">
          <h2 id="sheet-h" className="card-title m-0">
            Run-sheet
          </h2>
          <ol className="fp-phases">
            {PHASES.filter((p) => p.id !== 'sweat' || run.sweatEnabled).map((meta) => {
              const p = run.phases.find((x) => x.id === meta.id);
              if (!p) return null;
              const left = p.timerEndsAt ? Date.parse(p.timerEndsAt) - now.getTime() : undefined;
              return (
                <li key={p.id} className={`fp-phase ${p.doneAt ? 'fp-phase--done' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-[var(--text)]">{meta.label}</strong>
                    {p.doneAt && <Chip tone="good">done {WHEN.format(new Date(p.doneAt))}</Chip>}
                    {left !== undefined && left > 0 && !p.doneAt && (
                      <span className="fp-timer tnum" role="timer">
                        {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}
                      </span>
                    )}
                    {left !== undefined && left <= 0 && !p.doneAt && <Chip tone="warm">timer done</Chip>}
                  </div>
                  <ul className="fp-check">
                    {p.checklist.map((c) => (
                      <li key={c.id}>
                        <label className="flex items-center gap-3">
                          <input type="checkbox" className="check" checked={c.done} onChange={() => void setPhase(p.id, { checklist: p.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                          <span className={c.done ? 'fp-done' : ''}>{c.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {run.status === 'running' && !p.doneAt && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        Timer
                        <input className="input fp-min" type="number" min={1} value={p.timerMin ?? ''} onChange={(e) => void setPhase(p.id, { timerMin: num(e.target.value) })} aria-label={`${meta.label} timer minutes`} />
                        min
                      </label>
                      <PillButton variant="secondary" disabled={!p.timerMin} onClick={() => void setPhase(p.id, { startedAt: p.startedAt ?? new Date().toISOString(), timerEndsAt: new Date(Date.now() + (p.timerMin ?? 0) * 60_000).toISOString() })}>
                        {p.timerEndsAt ? 'Restart timer' : 'Start timer'}
                      </PillButton>
                      <PillButton variant="secondary" onClick={() => void setPhase(p.id, { doneAt: new Date().toISOString() })}>
                        Phase done
                      </PillButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {run.moments.length > 0 && (
            <div className="grid gap-1">
              <p className="m-0 font-semibold text-[var(--text)]">Test moments</p>
              {run.moments.map((m) => {
                const t = momentTime(run, m);
                return (
                  <label key={m.id} className="flex items-center gap-3">
                    <input type="checkbox" className="check" checked={!!m.doneAt} onChange={() => void saveRun({ ...run, moments: run.moments.map((x) => (x.id === m.id ? { ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() } : x)) })} />
                    <span className={m.doneAt ? 'fp-done' : ''}>
                      {m.title}
                      {t && ` · ${WHEN.format(t)}`}
                      {m.instruction && <span className="text-sm"> — {m.instruction}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="live-h">
          <h2 id="live-h" className="card-title m-0">
            Live telemetry
          </h2>
          <LiveTelemetry run={run} rows={tele.rows} loading={tele.loading} error={tele.error} now={now} />
          <p className="m-0 text-sm">
            To tag the Pi’s readings with this run: <code>python3 frostpure_sender.py --set-run {run.id}</code>
          </p>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="samples-h" id="samples">
          <h2 id="samples-h" className="card-title m-0">
            Samples
          </h2>
          {run.samples.length === 0 ? (
            <p className="m-0">No samples yet. Feed, brine and clean samples are needed for R and Y.</p>
          ) : (
            <div className="fp-table-wrap">
              <table className="fp-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Point</th>
                    <th>EC mS/cm</th>
                    <th>TDS mg/L</th>
                    <th>°C</th>
                    <th>L</th>
                    <th>Source</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {run.samples.map((s) => (
                    <tr key={s.id}>
                      <td>{WHEN.format(new Date(s.at))}</td>
                      <td>{POINT_LABEL[s.point]}</td>
                      <td>{s.ecMS ?? '—'}</td>
                      <td>{s.tdsMgL ?? '—'}</td>
                      <td>{s.tempC ?? '—'}</td>
                      <td>{s.volumeL ?? '—'}</td>
                      <td>{s.source}</td>
                      <td>
                        <button type="button" className="pipe-move" onClick={() => void saveRun({ ...run, samples: run.samples.filter((x) => x.id !== s.id) })} aria-label="Delete sample">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PillButton variant="secondary" className="justify-self-start" onClick={() => setSampleOpen(true)}>
            Log sample
          </PillButton>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="res-h">
          <h2 id="res-h" className="card-title m-0">
            Results
          </h2>
          <div className="fp-results">
            <Big label="Salt rejection R" v={r.rejection} headline />
            <Big label="Recovery Y" v={r.recovery} headline />
          </div>
          <ul className="fp-check text-sm">
            <li>Concentration factor CF: {r.concentrationFactor.ok ? r.concentrationFactor.value.toFixed(2) : r.concentrationFactor.reason}</li>
            <li className={r.massBalanceFlag ? 'fp-warm' : ''}>
              Mass-balance error: {pct(r.massBalanceError)}
              {r.massBalanceFlag && ` — more than ${MASS_BALANCE_LIMIT * 100}%: check volumes or samples`}
            </li>
            <li>Energy: {r.whPerL.ok ? `${r.whPerL.value.toFixed(1)} Wh per litre of clean water` : r.whPerL.reason}</li>
            <li>Freeze rate: {r.freezeRateCmH.ok ? `${r.freezeRateCmH.value.toFixed(2)} cm/h` : r.freezeRateCmH.reason}</li>
            <li>
              C_feed {r.cFeed?.toFixed(2) ?? '—'} g/L · C_ice {r.cIce?.toFixed(2) ?? '—'} g/L · C_brine {r.cBrine?.toFixed(2) ?? '—'} g/L · V_clean {r.vClean} L (k = {run.tdsK}) · target R ≥ 70% <Measured kind="target" />
            </li>
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['energyWh', 'Rig electrical energy, Wh'],
                ['freezerWh', 'Freezer energy, Wh (not field energy)'],
                ['iceThicknessCm', 'Ice thickness at drain, cm'],
                ['freezeHoursActual', 'Actual freeze time, h'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="field">
                <span className="field-label">{label}</span>
                <input className="input" type="number" step="any" min={0} defaultValue={run[k] ?? ''} key={`${k}-${run.updatedAt}`} onBlur={(e) => num(e.target.value) !== run[k] && void saveRun({ ...run, [k]: num(e.target.value) })} />
              </label>
            ))}
          </div>
        </GlassCard>
      </div>
      <SampleSheet run={run} open={sampleOpen} onClose={() => setSampleOpen(false)} />
    </>
  );
}
