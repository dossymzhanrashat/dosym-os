import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { FreezeFrontBar, SaltDotsLoader } from '../../../core/design/FreezeFront';
import { almatyDayKey } from '../../../core/planner/time';
import { extrasFor } from '../../radar/data/extras';
import { useRadarData } from '../../radar/data/store';
import { mainDeadline } from '../../radar/engine/plan';
import { dayDiff, daysLeft, describeDeadline, safeDayKey } from '../../radar/engine/time';
import { saveComp, useFrostData } from '../data/store';
import { briefProgress, currentPhase, wordCount } from '../engine/compete';
import type { Competition, CompPhase, CompRequirement } from '../model/types';
import { FrostNav } from './common';

/*
 * Compete (SPEC Module 2 › 5): a timeline from Aug 2026 to Apr 2027 with phase bands and a
 * "today" line; competition cards with next deadline, days left and progress ("Brief 4/10
 * sections"); Radar items that can carry FrostPure, one tap to track. Detail: every requirement,
 * Brief sections with a word counter against the limit (red when over), milestones.
 */

const START = '2026-08-01';
const END = '2027-04-30';
const MONTHS = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'];
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const DAYS = dayDiff(START, END);
const x = (day: string) => `${Math.min(100, Math.max(0, (dayDiff(START, day) / DAYS) * 100))}%`;

function Timeline({ comp, now }: { comp: Competition; now: Date }) {
  const today = almatyDayKey(now);
  const phases = comp.phases.filter((p) => p.deadline);
  return (
    <div className="fp-timeline" role="img" aria-label={`${comp.name} timeline: ${phases.map((p) => `${p.name} ${describeDeadline(p.deadline!)}`).join('; ')}`}>
      {MONTHS.map((m) => (
        <span key={m} className="fp-tl-month" style={{ left: x(`${m}-01`) }}>
          {MONTH.format(new Date(`${m}-15T00:00:00Z`))}
        </span>
      ))}
      {phases.map((p, i) => {
        const end = safeDayKey(p.deadline!);
        const start = p.start ?? (i > 0 ? safeDayKey(phases[i - 1].deadline!) : end);
        return (
          <span
            key={p.id}
            className={`fp-tl-band ${p.doneAt ? 'fp-tl-band--done' : ''}`}
            style={{ left: x(start), width: `max(6px, calc(${x(end)} - ${x(start)}))`, top: `${18 + (i % 2) * 18}px` }}
            title={`${p.name}: ${describeDeadline(p.deadline!)}`}
          >
            <span className="fp-tl-label">{p.name}</span>
          </span>
        );
      })}
      {today >= START && today <= END && <span className="fp-tl-today" style={{ left: x(today) }} aria-hidden="true" />}
    </div>
  );
}

function progressText(p: CompPhase): string {
  const b = briefProgress(p);
  const others = p.requirements.filter((r) => r.kind !== 'brief');
  const done = others.filter((r) => r.doneAt || (r.kind === 'link' && r.url)).length;
  return [b.total ? `Brief ${b.done}/${b.total} sections` : '', others.length ? `${done}/${others.length} other items` : ''].filter(Boolean).join(' · ');
}

export function CompetePage() {
  const data = useFrostData();
  const radar = useRadarData();
  const now = useMemo(() => new Date(), [data]);
  const conrad = data.comps.find((c) => c.id === 'comp-conrad-2026-27');

  // Radar items that can carry FrostPure and are not tracked here yet.
  const candidates = radar.opps.filter((o) => !o.deletedAt && o.status !== 'hidden' && extrasFor(o.id).tags.some((t) => t === 'frostpure' || t === 'water') && !data.comps.some((c) => c.id === `radar-${o.id}`) && o.id !== 'conrad-2026-27');

  const track = async (oppId: string) => {
    const o = radar.opps.find((x) => x.id === oppId)!;
    const d = mainDeadline(o, now);
    await saveComp({
      id: `radar-${o.id}`,
      name: o.name,
      url: o.url || undefined,
      status: 'watching',
      source: 'radar',
      phases: d ? [{ id: 'main', name: d.type[0].toUpperCase() + d.type.slice(1), deadline: { date: d.date, tz: d.tz }, verified: d.status === 'confirmed', sourceUrl: d.sourceUrl, requirements: o.requirements.map((r) => ({ id: r.id, title: r.title, kind: 'task', estHours: 2, dependsOn: [], weight: 20 })) }] : [],
      milestones: [],
      notes: `From Radar (${o.id}).`,
      updatedAt: new Date().toISOString(),
    });
  };

  if (!data.loaded) return <SaltDotsLoader label="Opening Compete" />;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · Compete
        </p>
        <h1 className="ff-title">Compete</h1>
      </header>
      <FrostNav />
      <div className="grid gap-3">
        {conrad && (
          <GlassCard className="grid gap-2">
            <h2 className="card-title m-0">Conrad Challenge 2026–27</h2>
            <Timeline comp={conrad} now={now} />
          </GlassCard>
        )}
        <ul className="fp-comps">
          {data.comps.map((c) => {
            const p = currentPhase(c, now);
            const days = p?.deadline ? daysLeft(p.deadline, now) : undefined;
            return (
              <li key={c.id}>
                <Link to={`/frostpure/compete/${encodeURIComponent(c.id)}`} className="card card--md fp-comp-card">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-[var(--text)]">{c.name}</strong>
                    <Chip tone={c.status === 'preparing' ? 'ice' : c.status === 'done' ? 'good' : 'plain'}>{c.status}</Chip>
                  </span>
                  {p?.deadline ? (
                    <span className="text-sm">
                      {p.name} · {describeDeadline(p.deadline)} · <span className={days! <= 7 ? 'fp-warm' : ''}>{days} days</span>
                      {!p.verified && ' (to confirm)'}
                    </span>
                  ) : (
                    <span className="text-sm">{c.notes || 'No dates yet'}</span>
                  )}
                  {p && progressText(p) && <span className="text-sm">{progressText(p)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        {candidates.length > 0 && (
          <GlassCard className="grid gap-2">
            <h2 className="card-title m-0">From Radar: can carry FrostPure</h2>
            <ul className="fp-check">
              {candidates.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/radar/o/${encodeURIComponent(o.id)}`}>{o.name}</Link>
                  <button type="button" className="pipe-move" onClick={() => void track(o.id)}>
                    Track for FrostPure
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>
    </>
  );
}

function RequirementRow({ comp, phase, r }: { comp: Competition; phase: CompPhase; r: CompRequirement }) {
  const [text, setText] = useState(r.text ?? '');
  const [url, setUrl] = useState(r.url ?? '');
  const save = (patch: Partial<CompRequirement>) =>
    saveComp({ ...comp, phases: comp.phases.map((p) => (p.id === phase.id ? { ...p, requirements: p.requirements.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) } : p)) });
  const words = wordCount(text);
  const over = r.wordLimit !== undefined && words > r.wordLimit;

  return (
    <li className="fp-req">
      <label className="flex items-center gap-3">
        <input type="checkbox" className="check" checked={!!r.doneAt} onChange={() => void save({ doneAt: r.doneAt ? undefined : new Date().toISOString() })} />
        <strong className={r.doneAt ? 'fp-done' : 'text-[var(--text)]'}>{r.title}</strong>
        {r.wordLimit !== undefined && (
          <span className={`tnum text-sm ${over ? 'fp-over' : ''}`} aria-live="polite">
            {words} / {r.wordLimit} words
          </span>
        )}
      </label>
      {r.kind === 'brief' && (
        <textarea className={`input ${over ? 'fp-input-over' : ''}`} rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== (r.text ?? '') && void save({ text })} aria-label={`${r.title} draft`} />
      )}
      {r.kind === 'link' && (
        <input className="input" type="url" value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== (r.url ?? '') && void save({ url: url.trim() || undefined })} aria-label={`${r.title} link`} />
      )}
      {r.dependsOn.some((d) => d.startsWith('runs:')) && <span className="text-sm">Needs data from {r.dependsOn.find((d) => d.startsWith('runs:'))!.slice(5)} completed run(s).</span>}
    </li>
  );
}

export function CompetitionPage() {
  const { id } = useParams();
  const data = useFrostData();
  const now = useMemo(() => new Date(), [data]);
  const c = data.comps.find((x) => x.id === id);

  if (!data.loaded) return <SaltDotsLoader label="Opening" />;
  if (!c)
    return (
      <GlassCard>
        <p className="m-0">
          Not found. <Link to="/frostpure/compete">Back to Compete</Link>
        </p>
      </GlassCard>
    );

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · <Link to="/frostpure/compete">Compete</Link>
        </p>
        <h1 className="ff-title">{c.name}</h1>
        <div className="flex flex-wrap gap-2">
          <div className="seg" role="radiogroup" aria-label="Status">
            {(['watching', 'preparing', 'submitted', 'done'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={c.status === s} className="seg-btn" onClick={() => void saveComp({ ...c, status: s })}>
                {s}
              </button>
            ))}
          </div>
          {c.url && (
            <a className="pill pill--secondary" href={c.url} target="_blank" rel="noopener noreferrer">
              Official site
            </a>
          )}
        </div>
        {c.notes && <p className="m-0 text-sm">{c.notes}</p>}
      </header>
      <FrostNav />
      <div className="grid gap-3">
        {c.phases.map((p) => {
          const b = briefProgress(p);
          const days = p.deadline ? daysLeft(p.deadline, now) : undefined;
          return (
            <GlassCard key={p.id} className="grid gap-3" aria-labelledby={`ph-${p.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={`ph-${p.id}`} className="card-title m-0">
                  {p.name}
                </h2>
                {p.doneAt && <Chip tone="good">done</Chip>}
                {p.verified ? <Chip tone="good">from the official guide</Chip> : <Chip tone="warm">to confirm</Chip>}
              </div>
              {p.deadline && (
                <p className="m-0">
                  {describeDeadline(p.deadline)}
                  {days !== undefined && days >= 0 && !p.doneAt && <span className={days <= 7 ? 'fp-warm' : ''}> · {days} days left</span>}
                  {p.sourceUrl && (
                    <>
                      {' · '}
                      <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                        source
                      </a>
                    </>
                  )}
                </p>
              )}
              {b.total > 0 && <FreezeFrontBar value={Math.min(1, b.words / b.limit)} label="Brief words" valueText={`${b.words} of ${b.limit} words · ${b.done}/${b.total} sections`} />}
              {p.requirements.length > 0 && (
                <ul className="fp-reqs">
                  {p.requirements.map((r) => (
                    <RequirementRow key={r.id} comp={c} phase={p} r={r} />
                  ))}
                </ul>
              )}
              <PillButton variant="secondary" className="justify-self-start" onClick={() => void saveComp({ ...c, phases: c.phases.map((x) => (x.id === p.id ? { ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() } : x)) })}>
                {p.doneAt ? 'Mark phase not done' : 'Mark phase done'}
              </PillButton>
            </GlassCard>
          );
        })}
        {c.milestones.length > 0 && (
          <GlassCard className="grid gap-2" aria-labelledby="ms-h">
            <h2 id="ms-h" className="card-title m-0">
              Milestones (suggested, editable)
            </h2>
            <ul className="fp-check">
              {c.milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3">
                  <input type="checkbox" className="check" checked={!!m.doneAt} aria-label={`${m.title} done`} onChange={() => void saveComp({ ...c, milestones: c.milestones.map((x) => (x.id === m.id ? { ...x, doneAt: x.doneAt ? undefined : new Date().toISOString() } : x)) })} />
                  <span className={m.doneAt ? 'fp-done' : ''}>{m.title}</span>
                  <input
                    className="input fp-date"
                    type="date"
                    value={m.day}
                    aria-label={`${m.title} date`}
                    onChange={(e) => e.target.value && void saveComp({ ...c, milestones: c.milestones.map((x) => (x.id === m.id ? { ...x, day: e.target.value } : x)) })}
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>
    </>
  );
}
