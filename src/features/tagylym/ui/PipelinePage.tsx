import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { FreezeFrontBar, SaltDotsLoader } from '../../../core/design/FreezeFront';
import { almatyDayKey } from '../../../core/planner/time';
import { activeProject, saveProject, useTgData } from '../data/store';
import { gate, makeStages, projectProgress, rippleDays, STAGES, stageTitle } from '../engine/pipeline';
import type { KitProject, PipelineStage } from '../model/types';
import { TgNav, ToConfirm } from './common';

/*
 * Pipeline board (SPEC Module 3): 11 stage columns. The active project shows live progress:
 * checklist items (each a Planner task due 09:00 on its day), deliverable links, stage lengths
 * that ripple later stages, and the stage gate (required items + deliverable links, or an
 * override note). A parked option shows a read-only "what if" board from today.
 */

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const d = (k: string) => DAY.format(new Date(`${k}T12:00:00Z`));

function StageColumn({ s, i, project, readOnly, focus }: { s: PipelineStage; i: number; project?: KitProject; readOnly: boolean; focus: boolean }) {
  const [override, setOverride] = useState('');
  const [asking, setAsking] = useState(false);
  const [newItem, setNewItem] = useState('');
  const ref = useRef<HTMLElement>(null);
  const today = almatyDayKey(new Date());
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, [focus]);

  const setStage = (patch: Partial<PipelineStage>) => project && void saveProject({ ...project, stages: project.stages.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const g = gate(s);
  const doneCount = s.checklist.filter((c) => c.done).length;
  const late = s.state !== 'done' && s.end < today;
  const meta = STAGES[i];

  return (
    <section ref={ref} className={`tg-col tg-col--${s.state} ${focus ? 'tg-col--focus' : ''}`} aria-labelledby={`st-${s.kind}`}>
      <h3 id={`st-${s.kind}`} className="tg-col-head">
        <span className="step-badge" aria-hidden="true">
          {String(i + 1).padStart(2, '0')}
        </span>{' '}
        {stageTitle(s.kind)} {meta.toConfirm && <ToConfirm />}
      </h3>
      <p className="m-0 text-sm tnum">
        {d(s.start)} – {d(s.end)} · {s.kind === 'sales' ? 'ongoing' : `${s.days} days`}
        {late && <span className="tg-warm"> · late</span>}
      </p>
      {!readOnly && s.kind !== 'sales' && (
        <label className="flex items-center gap-2 text-sm">
          Days
          <input
            className="input tg-cell"
            type="number"
            min={1}
            defaultValue={s.days}
            key={`${s.kind}-${s.days}`}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (project && v > 0 && v !== s.days) void saveProject({ ...project, stages: rippleDays(project.stages, i, v) });
            }}
            aria-label={`${stageTitle(s.kind)} length in days (later stages move)`}
          />
        </label>
      )}
      <FreezeFrontBar value={s.checklist.length ? doneCount / s.checklist.length : 0} label={`${stageTitle(s.kind)} checklist`} valueText={`${doneCount} of ${s.checklist.length}`} />
      <ul className="tg-check">
        {s.checklist.map((c) => (
          <li key={c.id}>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="check"
                disabled={readOnly}
                checked={c.done}
                onChange={() => setStage({ checklist: s.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)), state: s.state === 'todo' ? 'active' : s.state })}
              />
              <span className={c.done ? 'tg-done' : ''}>
                {c.text}
                <span className="text-sm tnum"> · {d(c.due)}</span>
                {!c.required && <span className="text-sm"> (optional)</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim()) return;
            setStage({ checklist: [...s.checklist, { id: crypto.randomUUID(), text: newItem.trim(), required: false, due: s.end, done: false }] });
            setNewItem('');
          }}
        >
          <input className="input" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add item" aria-label={`Add an item to ${stageTitle(s.kind)}`} />
        </form>
      )}
      <div className="grid gap-1">
        <span className="field-label">Deliverables</span>
        {s.deliverables.map((dl, k) => (
          <label key={dl.title} className="grid gap-1 text-sm">
            <span>
              {dl.title} {dl.link ? <Chip tone="good">linked</Chip> : dl.required && !readOnly ? <Chip>needs a link</Chip> : null}
            </span>
            {!readOnly && (
              <input
                className="input"
                type="url"
                defaultValue={dl.link ?? ''}
                key={`${dl.title}-${dl.link ?? ''}`}
                placeholder="https:// (Drive, photo, doc)"
                onBlur={(e) => e.target.value.trim() !== (dl.link ?? '') && setStage({ deliverables: s.deliverables.map((x, j) => (j === k ? { ...x, link: e.target.value.trim() || undefined } : x)) })}
              />
            )}
          </label>
        ))}
      </div>
      {!readOnly &&
        (s.state === 'done' ? (
          <div className="grid gap-1">
            <Chip tone="good">done{s.overrideNote ? ' (override)' : ''}</Chip>
            {s.overrideNote && <span className="text-sm">Override: {s.overrideNote}</span>}
            <button type="button" className="pipe-move" onClick={() => setStage({ state: 'active', overrideNote: undefined })}>
              Reopen stage
            </button>
          </div>
        ) : g.ok ? (
          <PillButton onClick={() => setStage({ state: 'done' })}>Mark stage done</PillButton>
        ) : asking ? (
          <div className="grid gap-2">
            <p className="m-0 text-sm">Still open: {g.missing.join('; ')}.</p>
            <textarea className="input" rows={2} value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Why it is done anyway (required)" aria-label="Override note" />
            <PillButton variant="secondary" disabled={override.trim().length < 3} onClick={() => setStage({ state: 'done', overrideNote: override.trim() })}>
              Done with override
            </PillButton>
          </div>
        ) : (
          <PillButton variant="secondary" onClick={() => setAsking(true)}>
            Mark stage done…
          </PillButton>
        ))}
    </section>
  );
}

export function PipelinePage() {
  const data = useTgData();
  const [params] = useSearchParams();
  const project = activeProject(data);
  const whatIf = params.get('option');
  const option = data.options.find((o) => o.id === (whatIf ?? project?.optionId));
  const readOnly = !!whatIf && whatIf !== project?.optionId;
  const stages = useMemo(() => (readOnly || !project ? makeStages(almatyDayKey(new Date())) : project.stages), [readOnly, project]);
  const focus = params.get('stage');

  if (!data.loaded) return <SaltDotsLoader label="Opening the pipeline" />;

  if (!project && !whatIf)
    return (
      <>
        <header className="ff-header">
          <p className="eyebrow">
            <Link to="/tagylym">Kit Studio</Link> · Pipeline
          </p>
          <h1 className="ff-title">Pipeline</h1>
        </header>
        <TgNav />
        <GlassCard className="grid gap-3">
          <FreezeFrontBar value={0.5} label="Waiting" valueText="No stage started" />
          <p className="m-0">No stage started. Freeze the first idea: settle on one kit in Decide, or open a parked option’s “what-if” pipeline.</p>
          <Link to="/tagylym/decide" className="pill justify-self-start">
            Go to Decide
          </Link>
        </GlassCard>
      </>
    );

  const progress = projectProgress(stages);
  const open = stages.flatMap((s) => s.checklist.filter((c) => !c.done && c.due < almatyDayKey(new Date()))).length;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/tagylym">Kit Studio</Link> · Pipeline
        </p>
        <h1 className="ff-title">{option?.name ?? 'Kit'}</h1>
        <FreezeFrontBar value={progress} size="band" label="Project progress" valueText={`${Math.round(progress * 100)}% done${open ? `, ${open} overdue` : ''}`} salt={readOnly ? 0 : Math.min(open, 12)} />
        <p className="m-0 text-sm">
          {readOnly ? 'What if: projected from today, read-only. Settle on this option in Decide to make it real.' : `${project!.mode === 'backward' ? `Backward from launch ${project!.anchorDate}` : `Forward from ${project!.anchorDate}`} · each checklist item is a task in your Planner (09:00 on its day); stage ends are deadlines.`}
        </p>
      </header>
      <TgNav />
      <div className="tg-board" role="list" aria-label="Pipeline stages">
        {stages.map((s, i) => (
          <StageColumn key={s.kind} s={s} i={i} project={readOnly ? undefined : project} readOnly={readOnly} focus={focus === s.kind} />
        ))}
      </div>
    </>
  );
}
