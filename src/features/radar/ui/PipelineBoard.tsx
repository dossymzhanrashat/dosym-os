import { useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { Chip, PillButton } from '../../../core/design/components';
import { FreezeFrontBar } from '../../../core/design/FreezeFront';
import { Mascot } from '../../../core/design/Mascot';
import { Sheet } from '../../../core/design/Sheet';
import { moveTo } from '../data/store';
import { nextDeadline, progress } from '../engine/plan';
import { daysLeft, shortDay } from '../engine/time';
import type { Opportunity, PipelineStatus, ResultOutcome } from '../model/types';
import { daysText, RESULT_LABEL, STATUS } from './common';

/*
 * Pipeline board (SPEC § 4.3, § 4.8): Watching → Preparing → Submitted → Result, styled as ice
 * layers. Drag a card to another column (laptop), or use its move buttons (phone, keyboard,
 * screen reader). Preparing builds the backward plan; Submitted asks for a confirmation number;
 * Result asks for the outcome. Accepted or Award brings out the droplet once.
 */

const COLUMNS: Exclude<PipelineStatus, 'hidden'>[] = ['watching', 'preparing', 'submitted', 'result'];
const SHOW = 12;

type Ask = { opp: Opportunity; to: 'submitted' | 'result' } | null;

const NEXT_ACTION: Partial<Record<PipelineStatus, string>> = { watching: 'Start preparing', preparing: 'Mark submitted', submitted: 'Record result', hidden: 'Start watching' };

/** `single`: the detail page's version — the next-step button (and a step back) instead of four columns. */
export function PipelineBoard({ opps, now, onMessage, single = false }: { opps: Opportunity[]; now: Date; onMessage: (m: string) => void; single?: boolean }) {
  const [ask, setAsk] = useState<Ask>(null);
  const [confirmation, setConfirmation] = useState('');
  const [outcome, setOutcome] = useState<ResultOutcome>('accepted');
  const [celebrate, setCelebrate] = useState(false);
  const [over, setOver] = useState<PipelineStatus | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const go = async (o: Opportunity, to: PipelineStatus) => {
    if (to === o.status && to !== 'result') return;
    if (to === 'submitted' || to === 'result') {
      setConfirmation(o.confirmationNumber ?? '');
      setOutcome(o.result ?? 'accepted');
      setAsk({ opp: o, to });
      return;
    }
    const r = await moveTo(o, to, {}, new Date());
    if (to === 'preparing') {
      if (r.noDeadline) onMessage(`${o.name} is in Preparing, but it has no upcoming deadline, so no steps were planned.`);
      else if (r.plan?.compressed) onMessage(`Plan compressed: ${r.plan.compressed.days} days instead of ${r.plan.compressed.insteadOf}. ${r.plan.tasks.length} steps for ${o.name} are in the Planner.`);
      else if (r.plan) onMessage(`${r.plan.tasks.length} steps for ${o.name} are in the Planner, counted back from the deadline.`);
    } else onMessage(`${o.name} moved to ${STATUS[to as keyof typeof STATUS]?.label ?? 'Hidden'}.`);
  };

  const confirmAsk = async () => {
    if (!ask) return;
    if (ask.to === 'submitted') await moveTo(ask.opp, 'submitted', { confirmationNumber: confirmation.trim() || undefined });
    else {
      await moveTo(ask.opp, 'result', { result: outcome });
      if ((outcome === 'accepted' || outcome === 'award') && ask.opp.result !== outcome) setCelebrate(true);
    }
    onMessage(`${ask.opp.name} moved to ${STATUS[ask.to].label}.`);
    setAsk(null);
  };

  const onDrop = (e: DragEvent, to: PipelineStatus) => {
    e.preventDefault();
    setOver(null);
    const o = opps.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (o) void go(o, to);
  };

  return (
    <>
      {celebrate && (
        <div className="notice notice--good flex items-center gap-3" role="status">
          <Mascot mood="happy" size={56} bounce label="Celebrating droplet" />
          <p className="m-0">
            <strong>Congratulations!</strong> One more line for your Common App Honors.
          </p>
          <PillButton variant="secondary" className="ml-auto" onClick={() => setCelebrate(false)}>
            Close
          </PillButton>
        </div>
      )}
      {single && opps[0] && (
        <div className="flex flex-wrap gap-2">
          {NEXT_ACTION[opps[0].status] && (
            <PillButton onClick={() => void go(opps[0], opps[0].status === 'hidden' ? 'watching' : COLUMNS[COLUMNS.indexOf(opps[0].status as (typeof COLUMNS)[number]) + 1])}>
              {NEXT_ACTION[opps[0].status]}
            </PillButton>
          )}
          {opps[0].status === 'result' && (
            <PillButton variant="secondary" onClick={() => void go(opps[0], 'result')}>
              Change result
            </PillButton>
          )}
          {COLUMNS.indexOf(opps[0].status as (typeof COLUMNS)[number]) > 0 && (
            <PillButton variant="secondary" onClick={() => void go(opps[0], COLUMNS[COLUMNS.indexOf(opps[0].status as (typeof COLUMNS)[number]) - 1])}>
              Back to {STATUS[COLUMNS[COLUMNS.indexOf(opps[0].status as (typeof COLUMNS)[number]) - 1]].label}
            </PillButton>
          )}
        </div>
      )}
      <div className="pipe" hidden={single}>
        {COLUMNS.map((col) => {
          const list = opps
            .filter((o) => !o.deletedAt && o.status === col)
            .map((o) => ({ o, next: nextDeadline(o, now) }))
            .sort((a, b) => (a.next ? daysLeft(a.next, now) : 1e9) - (b.next ? daysLeft(b.next, now) : 1e9) || a.o.name.localeCompare(b.o.name));
          const shown = expanded.has(col) ? list : list.slice(0, SHOW);
          return (
            <section
              key={col}
              className={`pipe-col pipe-col--${col} ${over === col ? 'pipe-col--over' : ''}`}
              aria-labelledby={`pipe-${col}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => onDrop(e, col)}
            >
              <h3 id={`pipe-${col}`} className="pipe-head">
                {STATUS[col].label} <span className="tnum">{list.length}</span>
                <span className="pipe-gloss">
                  <span lang="kk">{STATUS[col].kk}</span> · <span lang="ru">{STATUS[col].ru}</span>
                </span>
              </h3>
              <ul className="pipe-list">
                {shown.map(({ o, next }) => {
                  const p = progress(o.requirements);
                  const days = next ? daysLeft(next, now) : undefined;
                  const i = COLUMNS.indexOf(col);
                  return (
                    <li key={o.id} className="pipe-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)}>
                      <Link to={`/radar/o/${encodeURIComponent(o.id)}`} className="pipe-name">
                        {o.name}
                      </Link>
                      <p className="m-0 text-sm">
                        {next ? (
                          <>
                            {next.type} {shortDay(next)} · <span className={days !== undefined && days <= 7 ? 'rd-warm' : ''}>{daysText(days!)}</span>
                          </>
                        ) : col === 'result' && o.result ? (
                          RESULT_LABEL[o.result]
                        ) : (
                          'No upcoming date'
                        )}
                        {col === 'submitted' && o.confirmationNumber && <> · #{o.confirmationNumber}</>}
                      </p>
                      {p.total > 0 && <FreezeFrontBar value={p.share} label={`${o.name} checklist`} valueText={`${p.done} of ${p.total} done`} />}
                      {col === 'result' && o.result && <Chip tone={o.result === 'accepted' || o.result === 'award' ? 'good' : 'plain'}>{RESULT_LABEL[o.result]}</Chip>}
                      <div className="pipe-moves">
                        {i > 0 && (
                          <button type="button" className="pipe-move" onClick={() => void go(o, COLUMNS[i - 1])} aria-label={`Move ${o.name} back to ${STATUS[COLUMNS[i - 1]].label}`}>
                            ← {STATUS[COLUMNS[i - 1]].label}
                          </button>
                        )}
                        {i < COLUMNS.length - 1 && (
                          <button type="button" className="pipe-move" onClick={() => void go(o, COLUMNS[i + 1])} aria-label={`Move ${o.name} to ${STATUS[COLUMNS[i + 1]].label}`}>
                            {STATUS[COLUMNS[i + 1]].label} →
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {list.length > SHOW && !expanded.has(col) && (
                <button type="button" className="pipe-move" onClick={() => setExpanded(new Set([...expanded, col]))}>
                  Show all {list.length}
                </button>
              )}
              {list.length === 0 && <p className="m-0 text-sm">Drop a card here.</p>}
            </section>
          );
        })}
      </div>

      <Sheet open={!!ask} onClose={() => setAsk(null)} title={ask?.to === 'submitted' ? 'Mark submitted' : 'Record the result'}>
        {ask && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmAsk();
            }}
          >
            <p className="m-0">{ask.opp.name}</p>
            {ask.to === 'submitted' ? (
              <label className="field">
                <span className="field-label">Confirmation number (optional)</span>
                <input className="input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
                <span className="text-sm">Keep the confirmation e-mail or a screenshot too; files arrive with the document vault.</span>
              </label>
            ) : (
              <div className="field">
                <span className="field-label">Outcome</span>
                <div className="seg" role="radiogroup" aria-label="Outcome">
                  {(Object.keys(RESULT_LABEL) as ResultOutcome[]).map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={outcome === r} className="seg-btn" onClick={() => setOutcome(r)}>
                      {RESULT_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <PillButton type="submit">Save</PillButton>
              <PillButton variant="secondary" onClick={() => setAsk(null)}>
                Cancel
              </PillButton>
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}
