import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../core/design/components';
import { FreezeFrontHeader, SaltDotsLoader } from '../../core/design/FreezeFront';
import { getMeta, setMeta } from '../../core/db/db';
import { extrasFor } from './data/extras';
import { moveTo, refreshFeed, useLastFeed, usePending, useProfile, useRadarData } from './data/store';
import { verdict } from './engine/fit';
import { DEFAULT_FILTERS, filterFeed, type FeedFilters } from './engine/filter';
import { nextDeadline, progress } from './engine/plan';
import { daysLeft, describeDeadline } from './engine/time';
import type { OppCategory, Opportunity } from './model/types';
import { CATEGORY_LABEL, costLabel, DateStatusChip, daysText, FitRing, STATUS } from './ui/common';
import { GlacierTimeline } from './ui/GlacierTimeline';
import { HeatStrip } from './ui/HeatStrip';
import { PipelineBoard } from './ui/PipelineBoard';
import '../../core/bridge/bridge.css';
import './ui/radar.css';

/*
 * Radar home (SPEC § 4.3): Glacier Timeline (next 60 days), the Next-up card, the change bell,
 * then Feed · Pipeline · Calendar. Works from local data with the network off; the daily feed
 * only adds change cards.
 */

type View = 'feed' | 'pipeline' | 'calendar';
const FILTERS_KEY = 'radar:filters';
const checkedFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });

function NextUp({ opps, now }: { opps: Opportunity[]; now: Date }) {
  const pick = useMemo(() => {
    const rank = (o: Opportunity) => (o.status === 'preparing' ? 0 : o.status === 'watching' ? 1 : 2);
    return opps
      .filter((o) => !o.cancelled && (o.status === 'preparing' || o.status === 'watching'))
      .map((o) => ({ o, d: nextDeadline(o, now) }))
      .filter((x) => x.d)
      .sort((a, b) => rank(a.o) - rank(b.o) || daysLeft(a.d!, now) - daysLeft(b.d!, now))[0];
  }, [opps, now]);
  if (!pick) return null;
  const { o, d } = pick;
  const days = daysLeft(d!, now);
  const p = progress(o.requirements);
  const missing = o.requirements.filter((r) => !r.done).slice(0, 3);
  return (
    <GlassCard className="rd-next" aria-labelledby="next-h">
      <p className="eyebrow m-0">Next up · {STATUS[o.status as 'preparing' | 'watching'].label}</p>
      <div className="rd-next-row">
        <p className={`rd-days ${days <= 7 ? 'rd-warm' : ''}`}>
          {days}
          <span className="rd-days-unit">{days === 1 ? 'day' : 'days'}</span>
        </p>
        <div className="grid gap-1">
          <h2 id="next-h" className="card-title m-0">
            <Link to={`/radar/o/${encodeURIComponent(o.id)}`}>{o.name}</Link>
          </h2>
          <p className="m-0 text-sm">
            {d!.type} · {describeDeadline(d!)} <DateStatusChip d={d!} now={now} />
          </p>
          {p.total > 0 && (
            <p className="m-0 text-sm">
              {p.done} of {p.total} done{missing.length ? ` · still missing: ${missing.map((r) => r.title).join(', ')}` : ''}
            </p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function Filters({ f, set }: { f: FeedFilters; set: (f: FeedFilters) => void }) {
  const seg = <K extends keyof FeedFilters>(key: K, options: [FeedFilters[K], string][], label: string) => (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={f[key] === v} className="seg-btn" onClick={() => set({ ...f, [key]: v })}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  const toggleCat = (c: OppCategory) => set({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] });
  const active = JSON.stringify({ ...f, q: '' }) !== JSON.stringify({ ...DEFAULT_FILTERS, q: '' });
  return (
    <details className="bridge-details rd-filters" open={active}>
      <summary>Filters{active ? ' (on)' : ''}</summary>
      <div className="grid gap-3">
        <div className="field">
          <span className="field-label">Category</span>
          <div className="seg" role="group" aria-label="Category">
            {(Object.keys(CATEGORY_LABEL) as OppCategory[]).map((c) => (
              <button key={c} type="button" className="seg-btn" aria-pressed={f.categories.includes(c)} onClick={() => toggleCat(c)}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        {seg('window', [['any', 'Any'], [7, '7 days'], [30, '30 days'], [90, '90 days'], ['cycle', 'This cycle']], 'Deadline within')}
        {seg('cost', [['any', 'Any'], ['free', 'Free only'], ['aid', 'Free or aid']], 'Cost')}
        {seg('minFit', [[0, 'Any'], [50, '50+'], [70, '70+']], 'Fit')}
        {seg('format', [['any', 'Any'], ['online', 'Online'], ['inPerson', 'In person'], ['residential', 'Residential']], 'Format')}
        {seg('team', [['any', 'Either'], ['solo', 'Solo'], ['team', 'Team']], 'Team')}
        <div className="flex flex-wrap gap-4">
          {(
            [
              ['frostpure', 'Uses FrostPure'],
              ['eligibleOnly', 'Eligible only'],
              ['showHidden', 'Show hidden'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" className="check" checked={f[k]} onChange={(e) => set({ ...f, [k]: e.target.checked })} />
              <span>{l}</span>
            </label>
          ))}
        </div>
        {active && (
          <PillButton variant="secondary" className="justify-self-start" onClick={() => set({ ...DEFAULT_FILTERS, q: f.q })}>
            Clear filters
          </PillButton>
        )}
      </div>
    </details>
  );
}

function Feed({ opps, now }: { opps: Opportunity[]; now: Date }) {
  const profile = useProfile();
  const [f, setF] = useState<FeedFilters>(DEFAULT_FILTERS);
  useEffect(() => {
    void getMeta<FeedFilters>(FILTERS_KEY).then((saved) => saved && setF({ ...DEFAULT_FILTERS, ...saved }));
  }, []);
  const set = (next: FeedFilters) => {
    setF(next);
    void setMeta(FILTERS_KEY, next); // per device (SPEC: filters persist per device)
  };
  const rows = useMemo(() => filterFeed(opps, f, profile, now), [opps, f, profile, now]);

  return (
    <div className="grid gap-3">
      <input className="input" type="search" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} placeholder="Search opportunities" aria-label="Search opportunities" />
      <Filters f={f} set={set} />
      {rows.length === 0 ? (
        <GlassCard size="md">
          <p className="m-0">Nothing matches. Widen the window or clear a filter.</p>
        </GlassCard>
      ) : (
        <ul className="rd-feed">
          {rows.map(({ opp: o, fit, days }) => {
            const x = extrasFor(o.id);
            const next = nextDeadline(o, now);
            const v = verdict(o, x, profile, now);
            return (
              <li key={o.id} className={`card card--md rd-feed-card ${v.kind === 'notEligible' ? 'rd-dim' : ''}`}>
                <FitRing value={fit} />
                <div className="grid gap-1 min-w-0">
                  <Link to={`/radar/o/${encodeURIComponent(o.id)}`} className="rd-feed-name">
                    {o.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Chip>{CATEGORY_LABEL[o.category]}</Chip>
                    <Chip tone={costLabel(o) === 'Free' ? 'good' : 'plain'}>{costLabel(o)}</Chip>
                    <span>{x.team === 'team' ? 'Team' : x.team === 'solo' ? 'Solo' : 'Solo or team'}</span>
                    {o.status !== 'watching' && o.status !== 'hidden' && <Chip tone="ice">{STATUS[o.status].label}</Chip>}
                    {v.kind === 'notEligible' && <Chip tone="warm">Not eligible</Chip>}
                  </div>
                  <p className="m-0 text-sm">
                    {next ? (
                      <>
                        {next.type} · {describeDeadline(next)} · <span className={days! <= 7 ? 'rd-warm' : ''}>{daysText(days!)}</span> <DateStatusChip d={next} now={now} />
                      </>
                    ) : (
                      'Rolling or no date yet'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="pipe-move rd-hide"
                  onClick={() => void moveTo(o, o.status === 'hidden' ? 'watching' : 'hidden')}
                  aria-label={o.status === 'hidden' ? `Show ${o.name} again` : `Hide ${o.name}`}
                >
                  {o.status === 'hidden' ? 'Unhide' : 'Hide'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RadarPage() {
  const data = useRadarData();
  const last = useLastFeed();
  const pending = usePending(data.changes);
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'feed';
  const [message, setMessage] = useState('');
  const now = useMemo(() => new Date(), [data]);

  useEffect(() => void refreshFeed(), []);

  if (!data.loaded) return <SaltDotsLoader label="Opening Radar" />;
  const preparing = data.opps.filter((o) => o.status === 'preparing');
  const prepShare = preparing.length ? preparing.reduce((s, o) => s + progress(o.requirements).share, 0) / preparing.length : 0;

  return (
    <>
      <FreezeFrontHeader
        title="Radar"
        gloss="Радар"
        eyebrow={`${data.opps.filter((o) => o.status !== 'hidden').length} opportunities · ${preparing.length} preparing`}
        value={prepShare}
        valueLabel="Preparing checklists"
        valueText={`${Math.round(prepShare * 100)}% of preparing checklists done`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/radar/changes" className="pill pill--secondary" aria-label={`Change inbox, ${pending.length} pending`}>
            Changes {pending.length > 0 && <span className="rd-badge tnum">{pending.length}</span>}
          </Link>
          <Link to="/radar/settings" className="pill pill--secondary">
            Profile & feed
          </Link>
          <span className="text-sm tnum">
            Last checked {last.generatedAt ? checkedFmt.format(new Date(last.generatedAt)) : '—'}
            {last.error ? ' · offline, working from saved data' : ''}
          </span>
        </div>
      </FreezeFrontHeader>

      <div className="grid gap-3">
        <GlassCard size="md" className="rd-glacier-card">
          <GlacierTimeline opps={data.opps} done={data.done} now={now} />
        </GlassCard>
        <NextUp opps={data.opps} now={now} />

        <div className="seg" role="tablist" aria-label="Radar view">
          {(
            [
              ['feed', 'Feed'],
              ['pipeline', 'Pipeline'],
              ['calendar', 'Calendar'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} aria-pressed={view === v} className="seg-btn" onClick={() => setParams(v === 'feed' ? {} : { view: v }, { replace: true })}>
              {l}
            </button>
          ))}
        </div>

        {message && (
          <p className="notice m-0 flex flex-wrap items-center justify-between gap-2" role="status">
            <span>{message}</span>
            <PillButton variant="secondary" onClick={() => setMessage('')}>
              OK
            </PillButton>
          </p>
        )}

        {view === 'feed' && <Feed opps={data.opps} now={now} />}
        {view === 'pipeline' && <PipelineBoard opps={data.opps} now={now} onMessage={setMessage} />}
        {view === 'calendar' && (
          <GlassCard>
            <HeatStrip opps={data.opps} done={data.done} now={now} />
          </GlassCard>
        )}
      </div>
    </>
  );
}
