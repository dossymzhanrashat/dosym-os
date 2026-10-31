import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { newRun, saveRun, useFrostData } from '../data/store';
import { computeResults, pct } from '../engine/results';
import type { Rig, Run } from '../model/types';
import { FrostNav } from './common';

/*
 * Runs List (SPEC Module 2 › 3): a card per run with its key results (amber when measured);
 * filter by rig and feed salinity; Compare mode picks 2–4 runs. New runs start from a template.
 */

const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Almaty' });
const STATUS_TONE = { planned: 'plain', running: 'ice', done: 'good', aborted: 'warm' } as const;

export const TEMPLATES: { label: string; run: Partial<Run> }[] = [
  {
    label: 'Lab: 2/4/6 g/L at −10 °C',
    run: { rig: 'lab', feedSalinityGL: 4, feedVolumeL: 15, plannedAmbientC: -10, plannedFreezeHours: 16, targetFrozenPct: 65, variable: 'salinity', drainRule: { kind: 'targetIce', value: 65 }, hypothesis: 'Higher feed salinity lowers salt rejection.' },
  },
  {
    label: 'Lab: −20 °C fast freeze',
    run: { rig: 'lab', feedSalinityGL: 4, feedVolumeL: 15, plannedAmbientC: -20, plannedFreezeHours: 8, targetFrozenPct: 65, variable: 'temperature', drainRule: { kind: 'targetIce', value: 65 }, hypothesis: 'A faster freeze traps more salt in the ice.' },
  },
  {
    label: 'Outdoor: night run',
    run: { rig: 'outdoor', feedSalinityGL: 4, feedVolumeL: 150, plannedAmbientC: -15, plannedFreezeHours: 12, targetFrozenPct: 60, variable: 'duration', drainRule: { kind: 'fixedTime', value: 12 }, hypothesis: 'One cold night freezes enough to reach 60% ice.' },
  },
];

function RunCard({ r, picking, picked, onPick }: { r: Run; picking: boolean; picked: boolean; onPick: () => void }) {
  const res = useMemo(() => computeResults(r), [r]);
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <strong className="text-[var(--text)]">{r.name}</strong>
        <Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip>
        <Chip>{r.rig}</Chip>
      </span>
      <span className="text-sm">
        {WHEN.format(new Date(r.startedAt ?? r.createdAt))} · {r.feedSalinityGL} g/L · {r.feedVolumeL} L · {r.plannedAmbientC} °C
      </span>
      <span className={`tnum ${res.rejection.ok || res.recovery.ok ? 'fp-warm' : 'text-sm'}`}>
        R {pct(res.rejection)} · Y {pct(res.recovery)}
      </span>
    </>
  );
  return picking ? (
    <label className={`card card--md fp-run-card ${picked ? 'fp-run-card--picked' : ''}`}>
      <input type="checkbox" className="check" checked={picked} onChange={onPick} />
      <span className="grid gap-1">{body}</span>
    </label>
  ) : (
    <Link to={`/frostpure/run/${r.id}`} className="card card--md fp-run-card">
      <span className="grid gap-1">{body}</span>
    </Link>
  );
}

export function LabPage() {
  const data = useFrostData();
  const navigate = useNavigate();
  const [rig, setRig] = useState<Rig | 'all'>('all');
  const [salinity, setSalinity] = useState<number | 'all'>('all');
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const salts = useMemo(() => [...new Set(data.runs.map((r) => r.feedSalinityGL))].sort((a, b) => a - b), [data.runs]);
  const runs = data.runs.filter((r) => (rig === 'all' || r.rig === rig) && (salinity === 'all' || r.feedSalinityGL === salinity));

  const create = async (template?: Partial<Run>) => {
    const r = newRun({ name: `Run ${data.runs.length + 1}`, ...template });
    await saveRun(r);
    navigate(`/frostpure/run/${r.id}?edit=1`);
  };

  if (!data.loaded) return <SaltDotsLoader label="Opening the lab" />;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · Lab
        </p>
        <h1 className="ff-title">Experiment lab</h1>
      </header>
      <FrostNav />
      <div className="grid gap-3">
        <GlassCard size="md" className="grid gap-2">
          <p className="m-0 font-semibold text-[var(--text)]">New run</p>
          <div className="flex flex-wrap gap-2">
            <PillButton onClick={() => void create()}>Blank run</PillButton>
            {TEMPLATES.map((t) => (
              <PillButton key={t.label} variant="secondary" onClick={() => void create(t.run)}>
                {t.label}
              </PillButton>
            ))}
          </div>
        </GlassCard>

        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="radiogroup" aria-label="Rig">
            {(['all', 'lab', 'outdoor', 'custom'] as const).map((x) => (
              <button key={x} type="button" role="radio" aria-checked={rig === x} className="seg-btn" onClick={() => setRig(x)}>
                {x === 'all' ? 'All rigs' : x}
              </button>
            ))}
          </div>
          {salts.length > 1 && (
            <div className="seg" role="radiogroup" aria-label="Feed salinity">
              {(['all', ...salts] as const).map((x) => (
                <button key={String(x)} type="button" role="radio" aria-checked={salinity === x} className="seg-btn" onClick={() => setSalinity(x)}>
                  {x === 'all' ? 'Any g/L' : `${x} g/L`}
                </button>
              ))}
            </div>
          )}
          <PillButton
            variant="secondary"
            onClick={() => {
              setPicking(!picking);
              setPicked([]);
            }}
          >
            {picking ? 'Cancel compare' : 'Compare'}
          </PillButton>
          {picking && (
            <PillButton disabled={picked.length < 2} onClick={() => navigate(`/frostpure/compare?ids=${picked.join(',')}`)}>
              Compare {picked.length} (2–4)
            </PillButton>
          )}
        </div>

        {runs.length === 0 ? (
          <GlassCard size="md">
            <p className="m-0">No runs yet. Pick a template above to plan the first one.</p>
          </GlassCard>
        ) : (
          <div className="fp-runs">
            {runs.map((r) => (
              <RunCard
                key={r.id}
                r={r}
                picking={picking}
                picked={picked.includes(r.id)}
                onPick={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : p.length < 4 ? [...p, r.id] : p))}
              />
            ))}
          </div>
        )}
        <p className="m-0 text-sm">
          The Pi’s readings appear on a run while it is running. <Link to="/frostpure/pi">Pi setup</Link>
        </p>
      </div>
    </>
  );
}
