import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../core/design/components';
import { FreezeFrontHeader, SaltDotsLoader } from '../../core/design/FreezeFront';
import { activeProject, saveFx, useFx, useTgData, useWeights } from './data/store';
import { rank } from './engine/decide';
import { bomTotal } from './engine/econ';
import { projectProgress, stageTitle } from './engine/pipeline';
import { Approx, kzt, STATUS_TONE, TgNav, usd } from './ui/common';

/*
 * Kit Studio home (SPEC Module 3): the options side by side — status, grades, BOM total
 * (approximate, in ₸ and $), live score — plus the active project's progress and the ₸/$ rate.
 */

export function TagylymPage() {
  const data = useTgData();
  const weights = useWeights();
  const fx = useFx();
  const [rate, setRate] = useState('');
  const ranked = useMemo(() => new Map(rank(data.options, weights).map((r, i) => [r.option.id, { score: r.score, place: i + 1 }])), [data.options, weights]);
  const project = activeProject(data);
  const current = project?.stages.find((s) => s.state !== 'done');

  if (!data.loaded) return <SaltDotsLoader label="Opening Kit Studio" />;
  const progress = project ? projectProgress(project.stages) : 0;

  return (
    <>
      <FreezeFrontHeader
        title="Tagylym Kit Studio"
        gloss="Тағылым"
        eyebrow="Robotics kits for grades 1–6"
        value={progress}
        valueLabel="Project progress"
        valueText={project ? `${Math.round(progress * 100)}% of checklist items done` : 'No project yet'}
      >
        <p className="m-0">
          {project ? (
            <>
              Building <strong>{data.options.find((o) => o.id === project.optionId)?.name}</strong>
              {current && (
                <>
                  {' '}
                  · now: <Link to={`/tagylym/pipeline?stage=${current.kind}`}>{stageTitle(current.kind)}</Link>
                </>
              )}
            </>
          ) : (
            'Compare the options, then settle on one in Decide.'
          )}
        </p>
      </FreezeFrontHeader>
      <TgNav />

      <div className="grid gap-3">
        <ul className="tg-options">
          {data.options.map((o) => {
            const t = bomTotal(o.bom, fx.usdToKzt);
            const r = ranked.get(o.id);
            return (
              <li key={o.id}>
                <Link to={`/tagylym/option/${o.id}`} className="card card--md tg-option-card">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="step-badge" aria-hidden="true">
                      {o.code}
                    </span>
                    <strong className="text-[var(--text)]">{o.name}</strong>
                    {o.nameKk && <span lang="kk">{o.nameKk}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Chip tone={STATUS_TONE[o.status]}>{o.status}</Chip>
                    {o.isTeacherBox && <Chip tone="ice">modifier</Chip>}
                    {o.source === 'ai' && <Chip>AI idea</Chip>}
                    {o.source === 'merge' && <Chip>merged</Chip>}
                    <Chip>
                      grades {o.gradeMin}–{o.gradeMax}
                    </Chip>
                  </span>
                  <span className="text-sm">
                    {o.isTeacherBox ? 'Extras' : 'BOM'} {kzt(t.kzt)} ({usd(t.kzt, fx.usdToKzt)}) <Approx checked={t.oldest} />
                    {t.incomplete && <span className="tg-warm"> · incomplete</span>}
                  </span>
                  {r && (
                    <span className="tg-score-line">
                      <span className="tnum">{Math.round(r.score)}</span> score · #{r.place}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <GlassCard size="md" className="grid gap-2">
          <p className="m-0">
            Exchange rate: <strong>1 USD ≈ {fx.usdToKzt} ₸</strong> <span className="text-sm">(approximate, updated {fx.updatedAt})</span>
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(rate);
              if (n > 0) void saveFx(fx, n).then(() => setRate(''));
            }}
          >
            <input className="input tg-narrow" type="number" min={1} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="new rate" aria-label="New tenge per dollar rate" />
            <PillButton type="submit" variant="secondary" disabled={!(Number(rate) > 0)}>
              Update rate
            </PillButton>
          </form>
          {fx.history.length > 0 && <p className="m-0 text-sm">Earlier: {fx.history.slice(0, 3).map((h) => `${h.rate} until ${h.until}`).join(' · ')}</p>}
        </GlassCard>
      </div>
    </>
  );
}
