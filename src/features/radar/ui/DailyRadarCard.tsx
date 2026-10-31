import { useMemo } from 'react';
import { Link } from 'react-router';
import { GlassCard } from '../../../core/design/components';
import { useLastFeed, usePending, useRadarData } from '../data/store';
import { changeTitle } from '../engine/changes';
import { nextDeadline } from '../engine/plan';
import { daysLeft, describeDeadline } from '../engine/time';
import { daysText } from './common';
import './radar.css';

/*
 * Daily Radar card on Today (SPEC § 4.8): pending changes with the most important one, the next
 * deadline that matters, or "Radar checked N items at 06:00. No changes."
 */

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' });
const RANK = { high: 0, medium: 1, low: 2 } as const;

export function DailyRadarCard() {
  const data = useRadarData();
  const last = useLastFeed();
  const pending = usePending(data.changes);
  const now = useMemo(() => new Date(), [data]);

  const top = useMemo(() => [...pending].sort((a, b) => (a.field.startsWith('deadlines') ? 0 : 1) - (b.field.startsWith('deadlines') ? 0 : 1) || RANK[a.confidence] - RANK[b.confidence])[0], [pending]);
  const next = useMemo(
    () =>
      data.opps
        .filter((o) => !o.cancelled && (o.status === 'preparing' || o.status === 'watching'))
        .map((o) => ({ o, d: nextDeadline(o, now) }))
        .filter((x) => x.d)
        .sort((a, b) => (a.o.status === 'preparing' ? 0 : 1) - (b.o.status === 'preparing' ? 0 : 1) || daysLeft(a.d!, now) - daysLeft(b.d!, now))[0],
    [data.opps, now],
  );
  const opp = top && data.opps.find((o) => o.id === top.oppId);
  const checked = last.generatedAt ? new Date(last.generatedAt) : undefined;

  return (
    <GlassCard aria-labelledby="radar-card" className="today-module">
      <h2 id="radar-card" className="card-title">
        <Link to="/radar">Daily Radar</Link>
      </h2>
      <div className="grid gap-2">
        {pending.length > 0 && top ? (
          <p className="m-0">
            <Link to="/radar/changes">
              {pending.length} change{pending.length === 1 ? '' : 's'} to review
            </Link>
            : {changeTitle(top, opp)}
            {top.old !== undefined && top.new !== undefined && (
              <>
                {' '}
                <s>{top.old}</s> → <strong>{top.new}</strong>
              </>
            )}
          </p>
        ) : (
          <p className="m-0">
            {checked ? `Radar checked ${data.opps.length} items on ${DAY.format(checked)} at ${TIME.format(checked)}. No changes.` : `Radar has ${data.opps.length} items. The daily check has not run yet.`}
          </p>
        )}
        {next && (
          <p className="m-0">
            Next: <Link to={`/radar/o/${encodeURIComponent(next.o.id)}`}>{next.o.name}</Link> · {describeDeadline(next.d!)} ·{' '}
            <span className={daysLeft(next.d!, now) <= 7 ? 'rd-warm' : ''}>{daysText(daysLeft(next.d!, now))}</span>
          </p>
        )}
      </div>
    </GlassCard>
  );
}
