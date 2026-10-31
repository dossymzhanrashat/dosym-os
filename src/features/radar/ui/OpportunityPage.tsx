import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { FreezeFrontBar, SaltDotsLoader } from '../../../core/design/FreezeFront';
import { almatyDayKey } from '../../../core/planner/time';
import { extrasFor } from '../data/extras';
import { addRequirement, moveTo, saveNotes, setStepDone, toggleRequirement, useProfile, useRadarData } from '../data/store';
import { fit, verdict } from '../engine/fit';
import { planTaskItemId, progress } from '../engine/plan';
import { daysLeft, describeDeadline, isUpcoming } from '../engine/time';
import { CATEGORY_LABEL, DateStatusChip, daysText, hostOf, RESULT_LABEL, STATUS } from './common';
import { PipelineBoard } from './PipelineBoard';
import '../../../core/bridge/bridge.css';
import './radar.css';

/*
 * Opportunity detail (SPEC § 4.3): deadlines with source and last check, eligibility verdict,
 * requirements checklist, the backward plan, cost and aid, fit breakdown, notes and History.
 */

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Almaty' });

export function OpportunityPage() {
  const { id } = useParams();
  const data = useRadarData();
  const profile = useProfile();
  const [message, setMessage] = useState('');
  const [newReq, setNewReq] = useState('');
  const now = useMemo(() => new Date(), [data]);
  const o = data.opps.find((x) => x.id === id);

  if (!data.loaded) return <SaltDotsLoader label="Opening" />;
  if (!o)
    return (
      <GlassCard>
        <p className="m-0">
          This opportunity is not in your list (or has not synced yet). <Link to="/radar">Back to Radar</Link>
        </p>
      </GlassCard>
    );

  const x = extrasFor(o.id);
  const v = verdict(o, x, profile, now);
  const f = fit(o, x, profile, now);
  const p = progress(o.requirements);
  const today = almatyDayKey(now);
  const status = o.status === 'hidden' ? null : STATUS[o.status];

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/radar">Radar</Link> · {CATEGORY_LABEL[o.category]}
        </p>
        <h1 className="ff-title">{o.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="ice">{status ? status.label : 'Hidden'}</Chip>
          {o.result && <Chip tone={o.result === 'accepted' || o.result === 'award' ? 'good' : 'plain'}>{RESULT_LABEL[o.result]}</Chip>}
          {o.cancelled && <Chip tone="warm">Cancelled</Chip>}
          {o.url && (
            <a className="pill pill--secondary" href={o.url} target="_blank" rel="noopener noreferrer">
              Official page · {hostOf(o.url)}
            </a>
          )}
        </div>
      </header>

      <div className="grid gap-3">
        {message && (
          <p className="notice m-0" role="status">
            {message}
          </p>
        )}

        <GlassCard className="grid gap-3" aria-labelledby="dl-h">
          <h2 id="dl-h" className="card-title m-0">
            Deadlines
          </h2>
          {o.deadlines.length === 0 ? (
            <p className="m-0">No dates yet (rolling or not announced).</p>
          ) : (
            <ul className="rd-deadlines">
              {o.deadlines.map((d) => {
                const days = daysLeft(d, now);
                return (
                  <li key={d.id} className={isUpcoming(d, now) ? '' : 'rd-past'}>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="rd-dl-type">{d.type}</strong>
                      <DateStatusChip d={d} now={now} />
                      {d.manual && <Chip>edited by hand</Chip>}
                      <span className={`tnum ${days >= 0 && days <= 7 ? 'rd-warm' : ''}`}>{daysText(days)}</span>
                    </div>
                    <p className="m-0">{describeDeadline(d)}</p>
                    <p className="m-0 text-sm">
                      {d.sourceUrl ? (
                        <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer">
                          Source: {hostOf(d.sourceUrl)}
                        </a>
                      ) : (
                        'No source yet'
                      )}
                      {' · '}
                      checked {d.lastVerified ? WHEN.format(new Date(d.lastVerified)) : 'never'} · confidence {d.confidence}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="move-h">
          <h2 id="move-h" className="card-title m-0">
            Pipeline
          </h2>
          <PipelineBoard opps={[o]} now={now} onMessage={setMessage} single />
          <PillButton variant="secondary" className="justify-self-start" onClick={() => void moveTo(o, o.status === 'hidden' ? 'watching' : 'hidden')}>
            {o.status === 'hidden' ? 'Show in Radar again' : 'Hide from Radar'}
          </PillButton>
        </GlassCard>

        <GlassCard className="grid gap-2" aria-labelledby="el-h">
          <h2 id="el-h" className="card-title m-0">
            Eligibility
          </h2>
          <p className="m-0">
            <Chip tone={v.kind === 'eligible' ? 'good' : v.kind === 'check' ? 'warm' : 'danger'}>{v.kind === 'eligible' ? 'Eligible' : v.kind === 'check' ? 'Check' : 'Not eligible'}</Chip>{' '}
            {v.reason}
            {v.reason?.includes('Radar settings') && (
              <>
                {' '}
                <Link to="/radar/settings">Open settings</Link>
              </>
            )}
          </p>
          <p className="m-0">{o.eligibility}</p>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="req-h">
          <h2 id="req-h" className="card-title m-0">
            Requirements
          </h2>
          {p.total > 0 && <FreezeFrontBar value={p.share} label="Checklist" valueText={`${p.done} of ${p.total} done`} />}
          <ul className="rd-checklist">
            {o.requirements.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="check" checked={r.done} onChange={() => void toggleRequirement(o, r.id)} />
                  <span className={r.done ? 'rd-done' : ''}>{r.title}</span>
                  <span className="text-sm">{r.kind}</span>
                </label>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newReq.trim()) void addRequirement(o, newReq.trim()).then(() => setNewReq(''));
            }}
          >
            <input className="input" value={newReq} onChange={(e) => setNewReq(e.target.value)} placeholder="Add a requirement" aria-label="Add a requirement" />
            <PillButton type="submit" variant="secondary" disabled={!newReq.trim()}>
              Add
            </PillButton>
          </form>
        </GlassCard>

        {o.plan && (
          <GlassCard className="grid gap-3" aria-labelledby="plan-h">
            <h2 id="plan-h" className="card-title m-0">
              Plan (in your Planner)
            </h2>
            {o.plan.compressed && (
              <p className="notice notice--warm m-0">
                Plan compressed: {o.plan.compressed.days} days instead of {o.plan.compressed.insteadOf}.
              </p>
            )}
            <ul className="rd-checklist">
              {o.plan.tasks.map((t) => {
                const done = !!data.done[planTaskItemId(o.id, t.id)];
                return (
                  <li key={t.id}>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="check" checked={done} onChange={() => void setStepDone(o.id, t.id, !done)} />
                      <span className={done ? 'rd-done' : !done && t.day < today ? 'rd-warm' : ''}>{t.title}</span>
                      <span className="text-sm tnum">{DAY_FMT.format(new Date(`${t.day}T12:00:00Z`))}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        )}

        <GlassCard className="grid gap-2" aria-labelledby="cost-h">
          <h2 id="cost-h" className="card-title m-0">
            Cost and aid
          </h2>
          <p className="m-0">{o.cost ?? 'Cost not known'}</p>
          {o.aid && <p className="m-0">Aid: {o.aid}</p>}
        </GlassCard>

        <GlassCard className="grid gap-2" aria-labelledby="fit-h">
          <h2 id="fit-h" className="card-title m-0">
            Fit {f.total}
          </h2>
          <ul className="rd-fit-parts">
            <li>Skill match {f.skillMatch} × 0.30</li>
            <li>Project reuse {f.projectReuse} × 0.20{x.tags.includes('frostpure') ? ' (FrostPure fits)' : ''}</li>
            <li>Weight {f.weight} × 0.20</li>
            <li>Feasibility {f.feasibility} × 0.15</li>
            <li>
              Timing {f.timing} × 0.15{!profile.resultsBy && ' (set a results-by date in settings)'}
            </li>
            {v.kind === 'notEligible' && <li>Not eligible: capped at 10</li>}
          </ul>
        </GlassCard>

        <GlassCard className="grid gap-2" aria-labelledby="notes-h">
          <h2 id="notes-h" className="card-title m-0">
            Notes
          </h2>
          <textarea
            className="input"
            rows={4}
            defaultValue={o.notes}
            key={o.id}
            onBlur={(e) => e.target.value !== o.notes && void saveNotes(o, e.target.value)}
            aria-label="Notes"
            placeholder="Anything to remember: contacts, ideas, links"
          />
        </GlassCard>

        <GlassCard className="grid gap-2" aria-labelledby="hist-h">
          <h2 id="hist-h" className="card-title m-0">
            History
          </h2>
          {o.history.length === 0 ? (
            <p className="m-0">No changes yet.</p>
          ) : (
            <ul className="rd-history">
              {[...o.history].reverse().map((h, i) => (
                <li key={i}>
                  <span className="text-sm tnum">{WHEN.format(new Date(h.at))}</span> {h.field}: {h.old && <s>{h.old}</s>} → <strong>{h.new ?? '—'}</strong>
                  {h.sourceUrl && (
                    <>
                      {' '}
                      ·{' '}
                      <a href={h.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {hostOf(h.sourceUrl)}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </>
  );
}
