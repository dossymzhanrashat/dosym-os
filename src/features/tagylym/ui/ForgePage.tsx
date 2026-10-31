import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BridgeSheet } from '../../../core/bridge/BridgeSheet';
import type { AnyBridgeJob } from '../../../core/bridge/bridge';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { saveSetting, useSetting } from '../../../core/planner/store';
import { CRITIQUES, critiqueJob, generateJob, IDEAS, optionFromIdea, type Constraints, type Critique, type Idea } from '../bridge';
import { CRITERIA } from '../data/seed';
import { saveOption, useFx, useTgData, useWeights } from '../data/store';
import { bomTotal } from '../engine/econ';
import { TgNav } from './common';

/*
 * Idea Forge (SPEC Module 3 › Brainstorm assistant) through the Claude Bridge: Generate new kit
 * ideas within constraints, or Critique an option against the criteria. Ideas become options
 * marked "AI estimate"; suggested score changes are accepted one at a time.
 */

const MATERIALS = ['cardboard', 'plywood', '3D print', 'felt', 'recycled plastic'];
const NO_IDEAS: (Idea & { id: string })[] = [];
const NO_CRITIQUES: Record<string, Critique & { at: string }> = {};

export function ForgePage() {
  const data = useTgData();
  const weights = useWeights();
  const fx = useFx();
  const [params] = useSearchParams();
  const ideas = useSetting(IDEAS, NO_IDEAS);
  const critiques = useSetting(CRITIQUES, NO_CRITIQUES);
  const options = data.options.filter((o) => !o.isTeacherBox);
  const [mode, setMode] = useState<'generate' | 'critique'>(params.get('critique') ? 'critique' : 'generate');
  const [target, setTarget] = useState(params.get('critique') ?? 'kit-b');
  const [prompt, setPrompt] = useState('');
  const [c, setC] = useState<Constraints>({ maxCostKZT: 10000, grades: [1, 6], screenFree: false, offlineOnly: true, materials: [] });
  const [job, setJob] = useState<AnyBridgeJob | null>(null);
  const [msg, setMsg] = useState('');

  if (!data.loaded) return <SaltDotsLoader label="Opening Idea Forge" />;
  const t = options.find((o) => o.id === target) ?? options[0];
  const crit = t ? critiques[t.id] : undefined;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/tagylym">Kit Studio</Link> · Idea Forge
        </p>
        <h1 className="ff-title">Idea Forge</h1>
        <p className="m-0">Claude Pro as a design partner, through the Bridge: copy the prompt, paste the answer; it is checked before anything is saved.</p>
      </header>
      <TgNav />

      <div className="grid gap-3">
        <GlassCard className="grid gap-3">
          <div className="seg" role="radiogroup" aria-label="Mode">
            <button type="button" role="radio" aria-checked={mode === 'generate'} className="seg-btn" onClick={() => setMode('generate')}>
              Generate ideas
            </button>
            <button type="button" role="radio" aria-checked={mode === 'critique'} className="seg-btn" onClick={() => setMode('critique')}>
              Critique an option
            </button>
          </div>

          {mode === 'generate' ? (
            <>
              <label className="field">
                <span className="field-label">What are you looking for? (optional)</span>
                <textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="a kit that teaches sorting with camels and sheep" />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="field">
                  <span className="field-label">Max cost per kit, ₸</span>
                  <input className="input" type="number" min={0} value={c.maxCostKZT ?? ''} onChange={(e) => setC({ ...c, maxCostKZT: e.target.value ? Number(e.target.value) : undefined })} />
                </label>
                <label className="field">
                  <span className="field-label">Grades from</span>
                  <input className="input" type="number" min={1} max={6} value={c.grades[0]} onChange={(e) => setC({ ...c, grades: [Number(e.target.value) || 1, c.grades[1]] })} />
                </label>
                <label className="field">
                  <span className="field-label">to</span>
                  <input className="input" type="number" min={1} max={6} value={c.grades[1]} onChange={(e) => setC({ ...c, grades: [c.grades[0], Number(e.target.value) || 6] })} />
                </label>
              </div>
              <div className="seg" role="group" aria-label="Constraints">
                <button type="button" className="seg-btn" aria-pressed={c.screenFree} onClick={() => setC({ ...c, screenFree: !c.screenFree })}>
                  No screens
                </button>
                <button type="button" className="seg-btn" aria-pressed={c.offlineOnly} onClick={() => setC({ ...c, offlineOnly: !c.offlineOnly })}>
                  Offline only
                </button>
                {MATERIALS.map((m) => (
                  <button key={m} type="button" className="seg-btn" aria-pressed={c.materials.includes(m)} onClick={() => setC({ ...c, materials: c.materials.includes(m) ? c.materials.filter((x) => x !== m) : [...c.materials, m] })}>
                    {m}
                  </button>
                ))}
              </div>
              <PillButton className="justify-self-start" onClick={() => setJob(generateJob(prompt.trim(), c, weights, data.options, fx.usdToKzt))}>
                Ask Claude for ideas
              </PillButton>
            </>
          ) : (
            <>
              <div className="seg" role="radiogroup" aria-label="Option to critique">
                {options.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={o.id === t?.id} className="seg-btn" onClick={() => setTarget(o.id)}>
                    {o.code} · {o.name}
                  </button>
                ))}
              </div>
              {t && (
                <PillButton className="justify-self-start" onClick={() => setJob(critiqueJob(t, weights, data.options, fx.usdToKzt, bomTotal(t.bom, fx.usdToKzt).kzt))}>
                  Ask Claude to critique {t.name}
                </PillButton>
              )}
            </>
          )}
          {msg && (
            <p className="notice m-0" role="status">
              {msg}
            </p>
          )}
        </GlassCard>

        {mode === 'critique' && t && crit && (
          <GlassCard className="grid gap-3" aria-labelledby="crit-h">
            <h2 id="crit-h" className="card-title m-0">
              Critique of {t.name} <span className="text-sm">· {new Date(crit.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="eyebrow m-0">Strengths</p>
                <ul className="tg-list">
                  {crit.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow m-0">Weaknesses</p>
                <ul className="tg-list">
                  {crit.weaknesses.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            {crit.criterionNotes.length > 0 && (
              <div className="grid gap-2">
                <p className="eyebrow m-0">Suggested score changes</p>
                {crit.criterionNotes.map((n) => {
                  const cur = t.scores[n.criterion].value;
                  const label = CRITERIA.find((x) => x.id === n.criterion)?.label;
                  return (
                    <div key={n.criterion} className="flex flex-wrap items-center gap-2">
                      <span>
                        {label}: <s>{cur}</s> → <strong>{n.suggestedScore}</strong> <span className="text-sm">— {n.reason}</span>
                      </span>
                      {cur === n.suggestedScore ? (
                        <Chip tone="good">applied</Chip>
                      ) : (
                        <button type="button" className="pipe-move" onClick={() => void saveOption({ ...t, scores: { ...t.scores, [n.criterion]: { value: n.suggestedScore } } })}>
                          Accept
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="m-0">
              <strong>Cheapest test this week:</strong> {crit.cheapestTestThisWeek}
            </p>
            {crit.killerQuestions.length > 0 && (
              <div>
                <p className="eyebrow m-0">Killer questions</p>
                <ul className="tg-list">
                  {crit.killerQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {crit.unknownsToConfirm.length > 0 && (
              <p className="m-0 text-sm">
                To confirm: {crit.unknownsToConfirm.join(' · ')} <Chip tone="warm">to confirm</Chip>
              </p>
            )}
          </GlassCard>
        )}

        {mode === 'generate' &&
          ideas.map((idea) => (
            <GlassCard key={idea.id} size="md" className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[var(--text)]">{idea.name}</strong>
                {idea.nameKk && <span lang="kk">{idea.nameKk}</span>}
                <Chip>
                  grades {idea.grades[0]}–{idea.grades[1]}
                </Chip>
                <Chip>
                  ≈ ${idea.approxUnitCostUSD} (≈ {Math.round(idea.approxUnitCostUSD * fx.usdToKzt).toLocaleString('en-GB')} ₸) approx.
                </Chip>
              </div>
              <p className="m-0">{idea.concept}</p>
              <p className="m-0 text-sm">
                Parts: {idea.keyComponents.map((k) => `${k.qty}× ${k.name}`).join(', ')} · Risk: {idea.biggestRisk} · First test: {idea.firstExperiment}
              </p>
              <p className="m-0 text-sm">
                <em>AI estimate:</em> {CRITERIA.map((x) => `${x.label} ${idea.estimatedScores[x.id]}`).join(' · ')}
              </p>
              <div className="flex flex-wrap gap-2">
                <PillButton
                  variant="secondary"
                  onClick={async () => {
                    const n = data.options.filter((o) => o.source === 'ai').length + 1;
                    await saveOption(optionFromIdea(idea, `AI-${n}`));
                    await saveSetting(IDEAS, ideas.filter((x) => x.id !== idea.id));
                    setMsg(`${idea.name} added as option AI-${n}; its scores say “AI estimate” until you edit them.`);
                  }}
                >
                  Add as option
                </PillButton>
                <PillButton variant="secondary" onClick={() => void saveSetting(IDEAS, ideas.filter((x) => x.id !== idea.id))}>
                  Dismiss
                </PillButton>
              </div>
            </GlassCard>
          ))}
      </div>
      <BridgeSheet job={job} onClose={() => setJob(null)} onSaved={setMsg} />
    </>
  );
}
