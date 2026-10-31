import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { almatyDayKey } from '../../../core/planner/time';
import { progress } from '../engine/plan';
import { addDayKey, daysLeft, effectiveStatus, safeDayKey } from '../engine/time';
import type { Opportunity } from '../model/types';

/*
 * Glacier Timeline (SPEC § 4.8): the next 60 days. Each deadline is an ice block standing on the
 * freeze front; its height is the prep work still open (unticked requirements). Over the last
 * 14 days a block melts to 40 % of its height, its top rounds and meltwater drips into the brine
 * below. Overdue plan steps are salt dots sinking in the pool. Estimated dates are frosted blocks
 * with a dashed outline. Ice on top, brine below — never flipped. Reduce Motion stops the drips.
 */

const DAYS = 60;
const DAY_W = 18;
const PAD = 12;
const H = 190;
const FRONT = 128; // y of the freeze front line
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'Asia/Almaty' });
const LONG = new Intl.DateTimeFormat('en-GB', { month: 'long', day: 'numeric', timeZone: 'UTC' });

interface Block {
  key: string;
  oppId: string;
  x: number;
  h: number;
  melt: number; // 0 = solid, 1 = fully melted to 40 %
  estimated: boolean;
  label: string;
  urgent: boolean;
}

export function GlacierTimeline({ opps, done, now }: { opps: Opportunity[]; done: Record<string, string>; now: Date }) {
  const navigate = useNavigate();
  const today = almatyDayKey(now);

  const { blocks, salt, ticks } = useMemo(() => {
    const blocks: Block[] = [];
    let salt = 0;
    for (const o of opps) {
      if (o.deletedAt || o.cancelled || o.status === 'hidden' || o.status === 'result') continue;
      const p = progress(o.requirements);
      const open = p.total - p.done;
      for (const d of o.deadlines) {
        if (o.status === 'submitted' && d.type !== 'event' && d.type !== 'decision') continue;
        const days = daysLeft(d, now);
        if (days < 0 || days > DAYS) continue;
        const melt = days <= 14 ? 1 - days / 14 : 0;
        const full = 28 + Math.min(open, 8) * 10;
        const when = LONG.format(new Date(`${safeDayKey(d)}T12:00:00Z`));
        blocks.push({
          key: `${o.id}:${d.id}`,
          oppId: o.id,
          x: PAD + days * DAY_W,
          h: full * (1 - 0.6 * melt),
          melt,
          estimated: effectiveStatus(d, now) !== 'confirmed',
          urgent: days <= 7,
          label: `${o.name} ${d.type}, ${when}${effectiveStatus(d, now) === 'confirmed' ? '' : ' (estimated)'}, ${days === 0 ? 'today' : `${days} days`}, ${p.done} of ${p.total} requirements done.`,
        });
      }
      for (const t of o.plan?.tasks ?? []) if (t.day < today && !done[`gen:radar:task:${o.id}:${t.id}`]) salt++;
    }
    const ticks: { x: number; label: string }[] = [];
    for (let i = 0; i <= DAYS; i++) {
      const key = addDayKey(today, i);
      if (key.endsWith('-01') || i === 0) ticks.push({ x: PAD + i * DAY_W, label: i === 0 ? 'Today' : MONTH.format(new Date(`${key}T12:00:00+05:00`)) });
    }
    return { blocks: blocks.sort((a, b) => a.x - b.x), salt, ticks };
  }, [opps, done, now, today]);

  const width = PAD * 2 + DAYS * DAY_W;
  // Blocks on the same day stand side by side.
  const placed = blocks.map((b, i) => ({ ...b, x: b.x + 5 * blocks.slice(0, i).filter((o) => o.x === b.x).length }));

  return (
    <div className="glacier" role="group" aria-label={`Glacier timeline, next ${DAYS} days: ${blocks.length} deadlines${salt ? `, ${salt} overdue steps` : ''}`}>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="glacier-svg">
        <defs>
          <linearGradient id="gl-ice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e4ecff" />
            <stop offset="1" stopColor="var(--ice)" />
          </linearGradient>
          <linearGradient id="gl-brine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--violet)" stopOpacity="0.55" />
            <stop offset="1" stopColor="#9a6bff" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        <rect x="0" y={FRONT} width={width} height={H - FRONT} fill="url(#gl-brine)" />
        {Array.from({ length: Math.min(salt, 40) }, (_, i) => (
          <circle key={i} className="glacier-salt" cx={PAD + ((i * 37) % (width - PAD * 2))} cy={FRONT + 22 + ((i * 13) % 30)} r="3" style={{ animationDelay: `${(i % 7) * 0.4}s` }} />
        ))}
        <line x1="0" x2={width} y1={FRONT} y2={FRONT} className="glacier-front" />

        {ticks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={FRONT + 2} y2={H - 14} className="glacier-tick" />
            <text x={t.x + 3} y={H - 4} className="glacier-label">
              {t.label}
            </text>
          </g>
        ))}

        {placed.map((b) => {
          const w = 12;
          const r = 2 + b.melt * 5;
          return (
            <g
              key={b.key}
              className="glacier-block"
              role="link"
              tabIndex={0}
              aria-label={b.label}
              onClick={() => navigate(`/radar/o/${encodeURIComponent(b.oppId)}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/radar/o/${encodeURIComponent(b.oppId)}`);
                }
              }}
            >
              <title>{b.label}</title>
              <rect
                x={b.x - w / 2}
                y={FRONT - b.h}
                width={w}
                height={b.h}
                rx={r}
                fill="url(#gl-ice)"
                fillOpacity={b.estimated ? 0.45 : 0.95}
                stroke={b.urgent ? 'var(--warm)' : 'var(--ice)'}
                strokeWidth={b.estimated || b.urgent ? 1.5 : 0.75}
                strokeDasharray={b.estimated ? '3 3' : undefined}
              />
              {b.melt > 0 && <circle className="glacier-drip" cx={b.x} cy={FRONT + 6} r={1.5 + b.melt * 1.5} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
