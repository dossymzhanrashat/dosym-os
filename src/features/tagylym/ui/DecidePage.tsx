import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend } from 'recharts';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { FreezeFrontHeader, SaltDotsLoader } from '../../../core/design/FreezeFront';
import { Mascot } from '../../../core/design/Mascot';
import { Sheet } from '../../../core/design/Sheet';
import { almatyDayKey } from '../../../core/planner/time';
import { CRITERIA, PRESETS } from '../data/seed';
import { activeDecision, activeProject, reopen, saveAutoCost, saveCustomPresets, saveOption, saveWeights, settle, useAutoCost, useCustomPresets, useFx, useTgData, useWeights } from '../data/store';
import { canMerge, CLOSE_CALL, costAutoScore, mergeOptions, rank, robustness, weightSum } from '../engine/decide';
import { bomTotal } from '../engine/econ';
import { backward } from '../engine/pipeline';
import type { Criterion, KitOption, Weights } from '../model/types';
import { TgNav } from './common';

/*
 * Decide (SPEC Module 3 › Decision Matrix screen): weight sliders 0–10, the live ranking with a
 * stacked bar of criterion contributions and an amber badge on the leader, a radar chart of the
 * top 3, the robustness line (500 jittered weightings, recomputed 250 ms after the last slider
 * change), "Close call" and "Merge as one platform" hints, and "Settle on <leader>".
 */

const COLORS: Record<Criterion, string> = {
  cost: 'var(--ice)',
  durability: 'var(--sky)',
  learningDepth: 'var(--periwinkle)',
  scalability: 'var(--violet)',
  rural: 'var(--good)',
  teacherEffort: '#9a6bff',
  uniqueness: 'var(--warm)',
};
const RADAR = ['var(--ice)', 'var(--violet)', 'var(--warm)'];

function SettleSheet({ open, onClose, winner, runnerUp, gap, robust, weights, scores, all }: { open: boolean; onClose: () => void; winner: KitOption; runnerUp?: KitOption; gap: number; robust: number; weights: Weights; scores: Record<string, number>; all: KitOption[] }) {
  const navigate = useNavigate();
  const today = almatyDayKey(new Date());
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'forward' | 'backward'>('forward');
  const [start, setStart] = useState(today);
  const [launch, setLaunch] = useState('2027-06-01');
  const [compress, setCompress] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const plan = mode === 'backward' && launch ? backward(launch, today, compress) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={done ? 'Settled' : `Settle on ${winner.name}`}>
      {done ? (
        <div className="grid gap-3 justify-items-start">
          <Mascot mood="happy" size={72} bounce label="Celebrating droplet" />
          <p className="m-0">
            <strong>{winner.name}</strong> is now the active project. The other options are parked (never deleted), and the pipeline’s tasks are in your Planner.
          </p>
          <PillButton onClick={() => navigate('/tagylym/pipeline')}>Open the pipeline</PillButton>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await settle(all, { winner, runnerUp, weights, scores, robustness: robust, reason, mode, anchor: mode === 'forward' ? start : launch, compress });
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          <p className="m-0">
            Winner <strong>{winner.name}</strong> ({Math.round(scores[winner.id])})
            {runnerUp && (
              <>
                {' '}
                · runner-up {runnerUp.name} ({Math.round(scores[runnerUp.id])}) · gap {gap.toFixed(1)} points
              </>
            )}{' '}
            · stays #1 in {Math.round(robust * 100)}% of weight variations
          </p>
          <label className="field">
            <span className="field-label">Why I chose this (at least 20 characters)</span>
            <textarea className="input" rows={3} required minLength={20} value={reason} onChange={(e) => setReason(e.target.value)} />
            <span className="text-sm tnum">{reason.trim().length} / 20</span>
          </label>
          <div className="field">
            <span className="field-label">Schedule</span>
            <div className="seg" role="radiogroup" aria-label="Schedule">
              <button type="button" role="radio" aria-checked={mode === 'forward'} className="seg-btn" onClick={() => setMode('forward')}>
                Forward from a start date
              </button>
              <button type="button" role="radio" aria-checked={mode === 'backward'} className="seg-btn" onClick={() => setMode('backward')}>
                Backward from a launch date
              </button>
            </div>
          </div>
          {mode === 'forward' ? (
            <label className="field">
              <span className="field-label">Start</span>
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value || today)} />
            </label>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Target launch date</span>
                <input className="input" type="date" value={launch} onChange={(e) => setLaunch(e.target.value)} />
              </label>
              {plan && plan.shortBy > 0 && (
                <div className="notice notice--warm grid gap-2" role="status">
                  <p className="m-0">Needs {plan.shortBy} more days: at full length the plan would start in the past.</p>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="check" checked={compress} onChange={(e) => setCompress(e.target.checked)} />
                    <span>Compress every stage proportionally (never below 50%)</span>
                  </label>
                  {compress && plan.earliestLaunch && <p className="m-0">Even at 50% this launch is too early. Earliest feasible launch: {plan.earliestLaunch}.</p>}
                </div>
              )}
            </>
          )}
          {error && (
            <p className="notice notice--danger m-0" role="alert">
              {error}
            </p>
          )}
          <PillButton type="submit" disabled={reason.trim().length < 20 || (mode === 'backward' && !!plan?.shortBy && (!compress || !!plan.earliestLaunch))}>
            Settle on {winner.name}
          </PillButton>
        </form>
      )}
    </Sheet>
  );
}

export function DecidePage() {
  const data = useTgData();
  const saved = useWeights();
  const fx = useFx();
  const autoCost = useAutoCost();
  const custom = useCustomPresets();
  const [w, setW] = useState<Weights>(saved);
  const [robust, setRobust] = useState<number | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [keep, setKeep] = useState(true);

  useEffect(() => setW(saved), [saved]);

  // The options as ranked: with "Cost auto-score", the cost score comes from the BOM total.
  const options = useMemo(
    () => (autoCost ? data.options.map((o) => ({ ...o, scores: { ...o.scores, cost: { value: costAutoScore(bomTotal(o.bom, fx.usdToKzt).kzt) } } })) : data.options),
    [data.options, autoCost, fx.usdToKzt],
  );
  const ranking = useMemo(() => rank(options, w), [options, w]);
  const enabled = weightSum(w) > 0;

  useEffect(() => {
    setRobust(null);
    const t = setTimeout(() => setRobust(robustness(options, w)), 250);
    return () => clearTimeout(t);
  }, [options, w]);

  // Save weights shortly after the last change.
  useEffect(() => {
    const t = setTimeout(() => JSON.stringify(w) !== JSON.stringify(saved) && void saveWeights(w), 600);
    return () => clearTimeout(t);
  }, [w]);

  if (!data.loaded) return <SaltDotsLoader label="Opening Decide" />;
  const [first, second] = ranking;
  const gap = first && second ? first.score - second.score : 100;
  const top3 = ranking.slice(0, 3);
  const radarData = CRITERIA.map((c) => ({ criterion: c.label, ...Object.fromEntries(top3.map((r) => [r.option.code, r.option.scores[c.id].value])) }));
  const decision = activeDecision(data);
  const project = activeProject(data);
  const scores = Object.fromEntries(ranking.map((r) => [r.option.id, r.score]));

  return (
    <>
      <FreezeFrontHeader title="Decide" gloss="Шешім" eyebrow="Kit Studio" value={robust ?? 0} valueLabel="Robustness" valueText={robust === null ? 'Recomputing' : `Leader stays #1 in ${Math.round(robust * 100)}% of weight variations`} />
      <TgNav />
      <div className="grid gap-3">
        {decision && (
          <GlassCard size="md" className="grid gap-2">
            <p className="m-0">
              Decided {new Date(decision.decidedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}: <strong>{data.options.find((o) => o.id === decision.winnerId)?.name}</strong> — “{decision.reason}”
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="check" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                Keep the project and its completed tasks
              </label>
              <PillButton variant="secondary" onClick={() => void reopen(data, keep && !!project)}>
                Reopen decision
              </PillButton>
            </div>
          </GlassCard>
        )}

        <GlassCard className="grid gap-3" aria-labelledby="w-h">
          <h2 id="w-h" className="card-title m-0">
            Weights
          </h2>
          <div className="seg" role="group" aria-label="Weight presets">
            {[...PRESETS, ...custom].map((p) => (
              <button key={p.name} type="button" className="seg-btn" aria-pressed={JSON.stringify(p.weights) === JSON.stringify(w)} onClick={() => setW(p.weights)}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="tg-sliders">
            {CRITERIA.map((c) => (
              <label key={c.id} className="tg-slider">
                <span>
                  {c.label}
                  {c.hint && <span className="text-sm"> · {c.hint}</span>}
                </span>
                <input type="range" min={0} max={10} step={1} value={w[c.id]} onChange={(e) => setW({ ...w, [c.id]: Number(e.target.value) })} aria-valuetext={`${w[c.id]} of 10`} />
                <span className="tnum tg-slider-v">{w[c.id]}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="check" checked={autoCost} onChange={(e) => void saveAutoCost(e.target.checked)} />
              <span>Cost auto-score from the BOM total</span>
            </label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (presetName.trim()) void saveCustomPresets([...custom.filter((p) => p.name !== presetName.trim()), { name: presetName.trim(), weights: w }]).then(() => setPresetName(''));
              }}
            >
              <input className="input tg-narrow" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" aria-label="Preset name" />
              <PillButton type="submit" variant="secondary" disabled={!presetName.trim()}>
                Save preset
              </PillButton>
            </form>
          </div>
        </GlassCard>

        {!enabled ? (
          <p className="notice notice--warm m-0">Set at least one weight.</p>
        ) : (
          <>
            <ol className="tg-ranking" aria-label="Ranking">
              {ranking.map((r, i) => (
                <li key={r.option.id} className="card card--md tg-rank-card" aria-label={`Position ${i + 1}: ${r.option.name}, score ${Math.round(r.score)}`}>
                  <span className="tg-rank-score tnum">{Math.round(r.score)}</span>
                  <div className="grid gap-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link to={`/tagylym/option/${r.option.id}`} className="tg-rank-name">
                        {r.option.code} · {r.option.name}
                      </Link>
                      {i === 0 && <Chip tone="warm">leader</Chip>}
                      {Object.values(r.option.scores).some((s) => s.aiEstimate) && <em className="text-sm">AI estimate</em>}
                    </span>
                    <div className="tg-stack" aria-hidden="true">
                      {r.parts.map((p) => (
                        <span key={p.criterion} style={{ width: `${Math.max(0, p.value)}%`, background: COLORS[p.criterion] }} title={`${CRITERIA.find((c) => c.id === p.criterion)!.label}: ${p.value.toFixed(1)}`} />
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="tg-legend" aria-hidden="true">
              {CRITERIA.map((c) => (
                <span key={c.id}>
                  <i style={{ background: COLORS[c.id] }} /> {c.label}
                </span>
              ))}
            </div>

            <p className="m-0" aria-live="polite">
              {robust === null ? 'Checking robustness…' : `Leader stays #1 in ${Math.round(robust * 100)}% of weight variations.`}
              {gap < CLOSE_CALL && second && <strong className="tg-warm"> Close call: test both in Prototype v1.</strong>}
            </p>

            {canMerge(first?.option, second?.option) && (
              <GlassCard size="md" className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0">
                  {first.option.name} and {second.option.name} share the {first.option.controller}. Merge them into one platform and re-score?
                </p>
                <PillButton variant="secondary" onClick={() => void saveOption(mergeOptions(first.option, second.option, new Date()))}>
                  Merge as one platform
                </PillButton>
              </GlassCard>
            )}

            <GlassCard aria-labelledby="radar-h">
              <h2 id="radar-h" className="card-title">
                Top 3 by criterion
              </h2>
              <div className="tg-radar" role="img" aria-label={`Radar chart of ${top3.map((r) => r.option.name).join(', ')}`}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="var(--card-border-soft)" />
                    <PolarAngleAxis dataKey="criterion" tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={false} axisLine={false} />
                    {top3.map((r, i) => (
                      <Radar key={r.option.id} name={r.option.name} dataKey={r.option.code} stroke={RADAR[i]} fill={RADAR[i]} fillOpacity={0.12} isAnimationActive={false} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {first && !decision && (
              <PillButton className="justify-self-start text-lg" onClick={() => setSettleOpen(true)}>
                Settle on {first.option.name}
              </PillButton>
            )}
          </>
        )}
      </div>
      {first && (
        <SettleSheet open={settleOpen} onClose={() => setSettleOpen(false)} winner={first.option} runnerUp={second?.option} gap={gap} robust={robust ?? robustness(options, w)} weights={w} scores={scores} all={data.options} />
      )}
    </>
  );
}
