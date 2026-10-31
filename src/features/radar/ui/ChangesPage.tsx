import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { acceptAllHigh, acceptChange, rejectChange, usePending, useRadarData } from '../data/store';
import { acceptAllSet, changeTitle, NEW_FIELD } from '../engine/changes';
import { describeDeadline } from '../engine/time';
import type { Opportunity, RadarChange } from '../model/types';
import { hostOf } from './common';
import './radar.css';

/*
 * Change Inbox (SPEC § 4.3, § 4.5): every pending diff from the daily feed, old → new with the
 * old value struck through, source link, fetch time and confidence. Accept / Reject / Open source.
 * "Accept all high-confidence" never touches medium or low ones.
 */

const FETCHED = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });
const CONF_TONE = { high: 'good', medium: 'ice', low: 'warm' } as const;

/** Deadline values read as "Jan 14, 17:00 EST = Jan 15, 03:00 Almaty"; others as written. */
function shown(c: RadarChange, value: string | undefined, o?: Opportunity): string {
  if (value == null || value === '') return '—';
  const m = c.field.match(/^deadlines\[(\w+)\](\.date)?$/);
  if (m && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const tz = c.opportunity?.deadlines.find((d) => d.type === m[1])?.tz ?? o?.deadlines.find((d) => d.type === m[1])?.tz ?? 'Asia/Almaty';
    return describeDeadline({ date: value, tz });
  }
  return value;
}

export function ChangeCard({ c, opp, compact = false }: { c: RadarChange; opp?: Opportunity; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const isNew = c.field === NEW_FIELD;
  const f = c.opportunity;

  return (
    <GlassCard size="md" className="grid gap-2 rd-change">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[var(--text)]">{changeTitle(c, opp)}</strong>
        <Chip tone={CONF_TONE[c.confidence]}>{c.confidence}</Chip>
      </div>
      {isNew && f ? (
        <div className="grid gap-1 text-sm">
          <p className="m-0">{f.eligibility}</p>
          {f.deadlines[0] && (
            <p className="m-0">
              {f.deadlines[0].type}: {describeDeadline(f.deadlines[0])} ({f.deadlines[0].status})
            </p>
          )}
          {f.cost && <p className="m-0">Cost: {f.cost}</p>}
        </div>
      ) : (
        <p className="m-0 rd-diff">
          <s className="rd-old">{shown(c, c.old, opp)}</s> <span aria-hidden="true">→</span>
          <span className="sr-only">changes to</span> <strong>{shown(c, c.new, opp)}</strong>
        </p>
      )}
      <p className="m-0 text-sm">
        {c.sourceUrl ? hostOf(c.sourceUrl) : 'no source'} · checked {FETCHED.format(new Date(c.fetchedAt))}
      </p>
      {c.state === 'pending' ? (
        <div className="flex flex-wrap gap-2">
          <PillButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setNote((await acceptChange(c)) || 'Accepted.');
              } catch (e) {
                setNote(e instanceof Error ? e.message : String(e));
              }
              setBusy(false);
            }}
          >
            Accept
          </PillButton>
          <PillButton variant="secondary" disabled={busy} onClick={() => void rejectChange(c)}>
            Reject
          </PillButton>
          {c.sourceUrl && !compact && (
            <a className="pill pill--secondary" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
              Open source
            </a>
          )}
        </div>
      ) : (
        <p className="m-0 text-sm">{c.state[0].toUpperCase() + c.state.slice(1)}</p>
      )}
      {note && (
        <p className="m-0 text-sm" role="status">
          {note}
        </p>
      )}
    </GlassCard>
  );
}

export function ChangesPage() {
  const data = useRadarData();
  const pending = usePending(data.changes);
  const [message, setMessage] = useState('');
  const oppMap = useMemo(() => new Map(data.opps.map((o) => [o.id, o])), [data.opps]);
  const decided = useMemo(() => data.changes.filter((c) => c.state !== 'pending').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')).slice(0, 20), [data.changes]);
  const high = acceptAllSet(pending).length;

  if (!data.loaded) return <SaltDotsLoader label="Opening changes" />;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/radar">Radar</Link> · Changes
        </p>
        <h1 className="ff-title">Change inbox</h1>
        <p className="m-0">Nothing from the daily check is applied until you accept it. Pending changes expire after 7 days; a rejected one stays quiet for 30.</p>
      </header>
      <div className="grid gap-3">
        {pending.length === 0 ? (
          <GlassCard size="md">
            <p className="m-0">No changes to review.</p>
          </GlassCard>
        ) : (
          <>
            {high > 0 && (
              <PillButton
                className="justify-self-start"
                onClick={async () => {
                  const n = await acceptAllHigh(pending);
                  setMessage(`Accepted ${n} high-confidence change${n === 1 ? '' : 's'}. Medium and low ones are still here for you to check.`);
                }}
              >
                Accept all high-confidence ({high})
              </PillButton>
            )}
            {message && (
              <p className="notice m-0" role="status">
                {message}
              </p>
            )}
            {pending.map((c) => (
              <ChangeCard key={c.id} c={c} opp={oppMap.get(c.oppId)} />
            ))}
          </>
        )}
        {decided.length > 0 && (
          <details className="bridge-details">
            <summary>Earlier decisions ({decided.length})</summary>
            <div className="grid gap-2">
              {decided.map((c) => (
                <ChangeCard key={c.id} c={c} opp={oppMap.get(c.oppId)} compact />
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}
