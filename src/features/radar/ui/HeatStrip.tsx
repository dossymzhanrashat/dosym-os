import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import { almatyDayKey, almatyParts } from '../../../core/planner/time';
import { addDayKey, describeDeadline, safeDayKey } from '../engine/time';
import type { Opportunity } from '../model/types';
import '../../planner/planner.css';

/*
 * Calendar heat strip (SPEC § 4.8): 12 weeks of days, colour = load (deadlines + planned steps),
 * from clear ice to the freeze-front blue; a hard deadline adds an amber dot. Tap a day, or drag
 * across the strip to scrub; the list below shows that day's items.
 */

const WEEKS = 12;
const HARD = new Set(['application', 'submission', 'registration', 'payment']);
const DAY_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

interface DayItem {
  oppId: string;
  title: string;
  detail: string;
  hard: boolean;
  step: boolean;
  done?: boolean;
}

export function HeatStrip({ opps, done, now }: { opps: Opportunity[]; done: Record<string, string>; now: Date }) {
  const today = almatyDayKey(now);
  const start = addDayKey(today, -((almatyParts(now).weekday + 6) % 7)); // Monday of this week
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => {
    const m = new Map<string, DayItem[]>();
    const push = (k: string, it: DayItem) => m.set(k, [...(m.get(k) ?? []), it]);
    for (const o of opps) {
      if (o.deletedAt || o.cancelled || o.status === 'hidden' || o.status === 'result') continue;
      for (const d of o.deadlines) {
        if (o.status === 'submitted' && d.type !== 'event' && d.type !== 'decision') continue;
        push(safeDayKey(d), { oppId: o.id, title: `${o.name} · ${d.type}`, detail: describeDeadline(d), hard: HARD.has(d.type), step: false });
      }
      for (const t of o.plan?.tasks ?? []) push(t.day, { oppId: o.id, title: t.title, detail: o.name, hard: false, step: true, done: !!done[`gen:radar:task:${o.id}:${t.id}`] });
    }
    return m;
  }, [opps, done]);

  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDayKey(start, i));
  const level = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3);

  const scrub = (e: ReactPointerEvent) => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const key = el?.closest<HTMLElement>('[data-day]')?.dataset.day;
    if (key) setSelected(key);
  };

  const items = byDay.get(selected) ?? [];
  const dayLabel = DAY_FMT.format(new Date(`${selected}T12:00:00Z`));

  return (
    <div className="grid gap-3">
      <div className="heat" onPointerMove={scrub} onPointerDown={scrub} role="grid" aria-label="Radar load, next 12 weeks">
        {days.map((k) => {
          const list = byDay.get(k) ?? [];
          const hard = list.some((i) => i.hard);
          return (
            <button
              key={k}
              type="button"
              data-day={k}
              className={`heat-cell heat-${level(list.length)} ${k === today ? 'heat-today' : ''} ${k < today ? 'heat-past' : ''}`}
              aria-pressed={k === selected}
              aria-label={`${DAY_FMT.format(new Date(`${k}T12:00:00Z`))}: ${list.length} item${list.length === 1 ? '' : 's'}${hard ? ', hard deadline' : ''}`}
              onClick={() => setSelected(k)}
            >
              {hard && <span className="heat-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3].map((l) => (
          <span key={l} className={`heat-cell heat-${l}`} />
        ))}
        <span>More</span>
        <span className="heat-cell heat-0">
          <span className="heat-dot" />
        </span>
        <span>hard deadline</span>
      </div>

      <div aria-live="polite">
        <p className="m-0 font-semibold text-[var(--text)]">
          {dayLabel}
          {selected === today ? ' · today' : ''}
        </p>
        {items.length === 0 ? (
          <p className="m-0 text-sm">Nothing on this day.</p>
        ) : (
          <ul className="entry-list">
            {items.map((it, i) => (
              <li key={i} className="entry-row mod-radar">
                <Link to={`/radar/o/${encodeURIComponent(it.oppId)}`}>
                  {it.done ? <s>{it.title}</s> : it.title}
                  <span className="entry-meta">
                    {it.step ? 'Planned step · ' : ''}
                    {it.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
