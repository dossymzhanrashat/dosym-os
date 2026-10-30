import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../core/design/components';
import { anchorOf, entriesInRange, entryDayKey, type PlannerEntry } from '../../core/planner/entries';
import { LOAD_LIMIT_MIN, plannedMinutes } from '../../core/planner/layout';
import { isGeneratedRepeat } from '../../core/planner/providers';
import { pushToTomorrow, useFixedBlocks, usePlannerItems } from '../../core/planner/store';
import { addDays, addMonths, dayKey, fromDayKey, startOfDay, startOfWeek } from '../../core/planner/time';
import type { FixedBlock, PlannerItem } from '../../core/planner/types';
import { EntryRow, entryHref } from './EntryRow';
import { HourLabels, TimelineColumn } from './TimelineColumn';
import './planner.css';

type View = 'day' | 'week' | 'month';
const VIEWS: { value: View; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function byDay(entries: PlannerEntry[]): Map<string, PlannerEntry[]> {
  const map = new Map<string, PlannerEntry[]>();
  for (const e of entries) {
    const k = entryDayKey(e);
    if (k) map.set(k, [...(map.get(k) ?? []), e]);
  }
  return map;
}

// ---------- Day ----------

function DayView({ day, items, blocks }: { day: Date; items: PlannerItem[]; blocks: FixedBlock[] }) {
  const entries = useMemo(() => entriesInRange(items, day, addDays(day, 1)), [items, day]);
  const isToday = dayKey(day) === dayKey(new Date());
  const anytime = entries.filter((e) => !e.start);
  // Today's tray also holds undated tasks and anything overdue.
  const extra = useMemo(() => {
    if (!isToday) return [];
    const today = startOfDay(new Date());
    const undated = items.filter((i) => !i.deletedAt && !i.done && !anchorOf(i)).map((i) => ({ ...i, baseId: i.id }));
    const overdue = entriesInRange(items, addDays(today, -30), today).filter((e) => !e.done && !isGeneratedRepeat(e));
    return [...overdue, ...undated];
  }, [items, isToday]);

  const planned = plannedMinutes(entries);
  const movable = entries.filter((e) => e.start && !e.done && e.source === 'user' && e.importance !== 'critical').slice(-3);

  return (
    <div className="grid gap-3">
      {planned > LOAD_LIMIT_MIN && (
        <div className="notice notice--warm" role="status">
          <strong>{(planned / 60).toFixed(1)} hours planned</strong> — more than 8. Move something to tomorrow?
          {movable.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {movable.map((e) => (
                <PillButton key={e.id} variant="secondary" onClick={() => void pushToTomorrow(e)}>
                  Move “{e.title}”
                </PillButton>
              ))}
            </div>
          )}
        </div>
      )}

      <GlassCard size="md" aria-labelledby="anytime">
        <h2 id="anytime" className="card-title">
          Anytime
        </h2>
        {anytime.length + extra.length === 0 ? (
          <p className="m-0 text-sm">Nothing without a time. Tasks and deadlines for this day show here.</p>
        ) : (
          <ul className="entry-list">
            {anytime.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
            {extra.map((e) => (
              <EntryRow key={e.id} entry={e} withDate extra={anchorOf(e) ? <Chip tone="warm">Overdue</Chip> : undefined} />
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard size="md" className="p-2!">
        <div className="tl">
          <HourLabels />
          <TimelineColumn day={day} entries={entries} blocks={blocks} label={longDay.format(day)} />
        </div>
      </GlassCard>
    </div>
  );
}

// ---------- Week ----------

function WeekView({ day, items, blocks }: { day: Date; items: PlannerItem[]; blocks: FixedBlock[] }) {
  const monday = startOfWeek(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const grouped = useMemo(() => byDay(entriesInRange(items, monday, addDays(monday, 7))), [items, monday.getTime()]);
  const todayKey = dayKey(new Date());

  return (
    <GlassCard size="md" className="p-2!">
      <div className="week-scroll" tabIndex={0} aria-label="Week, scrolls sideways">
        <div className="week">
          <div aria-hidden="true" />
          {days.map((d) => {
            const k = dayKey(d);
            return (
              <div key={k} className="week-head">
                <Link to={`/planner?view=day&date=${k}`} className="week-day-link" aria-current={k === todayKey ? 'date' : undefined}>
                  {shortDay.format(d)}
                </Link>
                {(grouped.get(k) ?? [])
                  .filter((e) => !e.start)
                  .map((e) => (
                    <Link key={e.id} to={entryHref(e)} className={`week-allday mod-${e.source}`}>
                      {e.kind === 'deadline' ? '◆ ' : ''}
                      {e.title}
                    </Link>
                  ))}
              </div>
            );
          })}
          <HourLabels />
          {days.map((d) => (
            <TimelineColumn key={dayKey(d)} day={d} entries={grouped.get(dayKey(d)) ?? []} blocks={blocks} label={longDay.format(d)} />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

// ---------- Month ----------

function MonthView({ day, items }: { day: Date; items: PlannerItem[] }) {
  const first = new Date(day.getFullYear(), day.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const grouped = useMemo(() => byDay(entriesInRange(items, gridStart, addDays(gridStart, 42))), [items, gridStart.getTime()]);
  const todayKey = dayKey(new Date());

  return (
    <GlassCard size="md">
      <div className="month" role="grid" aria-label={monthFmt.format(first)}>
        {DOW.map((d) => (
          <div key={d} className="month-dow" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const k = dayKey(d);
          const list = grouped.get(k) ?? [];
          const open = list.filter((e) => !e.done);
          // Untimed tasks count as half an hour of load.
          const load = Math.min(1, (plannedMinutes(list) + open.filter((e) => !e.start).length * 30) / LOAD_LIMIT_MIN);
          const deadline = list.some((e) => e.kind === 'deadline' && !e.done);
          return (
            <Link
              key={k}
              role="gridcell"
              to={`/planner?view=day&date=${k}`}
              className={`month-day ${d.getMonth() !== first.getMonth() ? 'month-day--out' : ''}`}
              style={{ '--load': load } as CSSProperties}
              aria-current={k === todayKey ? 'date' : undefined}
              aria-label={`${longDay.format(d)}: ${open.length} open${deadline ? ', deadline' : ''}`}
            >
              {d.getDate()}
              {deadline && <span className="month-dot" aria-hidden="true" />}
              {open.length > 0 && <span className="month-count">{open.length}</span>}
            </Link>
          );
        })}
      </div>
      <div className="month-legend" aria-hidden="true">
        <span>
          <span className="month-swatch" style={{ background: 'color-mix(in srgb, var(--ice) 12%, transparent)' }} />
          Free
        </span>
        <span>
          <span className="month-swatch" style={{ background: 'color-mix(in srgb, var(--periwinkle) 85%, transparent)' }} />
          Full (8 h)
        </span>
        <span>
          <span className="month-swatch" style={{ background: 'var(--warm)', borderRadius: '50%', width: '0.5rem', height: '0.5rem' }} />
          Deadline
        </span>
      </div>
    </GlassCard>
  );
}

// ---------- Page ----------

export function PlannerPage() {
  const [params, setParams] = useSearchParams();
  const view = (['day', 'week', 'month'].includes(params.get('view') ?? '') ? params.get('view') : 'day') as View;
  const dateParam = params.get('date');
  const day = useMemo(() => (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? fromDayKey(dateParam) : startOfDay(new Date())), [dateParam]);
  const items = usePlannerItems();
  const blocks = useFixedBlocks();

  const go = (next: Partial<{ view: View; date: Date }>) => {
    const p = new URLSearchParams(params);
    if (next.view) p.set('view', next.view);
    if (next.date) p.set('date', dayKey(next.date));
    setParams(p, { replace: true });
  };
  const step = (dir: -1 | 1) =>
    go({ date: view === 'day' ? addDays(day, dir) : view === 'week' ? addDays(day, 7 * dir) : addMonths(day, dir) });

  const monday = startOfWeek(day);
  const title =
    view === 'day'
      ? longDay.format(day)
      : view === 'week'
        ? `${shortDay.format(monday)} – ${shortDay.format(addDays(monday, 6))}`
        : monthFmt.format(day);

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">Today · Planner</p>
        <h1 className="ff-title">Planner</h1>
      </header>

      <div className="planner-toolbar">
        <div className="seg" role="radiogroup" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" role="radio" aria-checked={view === v.value} className="seg-btn" onClick={() => go({ view: v.value })}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="planner-nav">
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <PillButton variant="secondary" onClick={() => go({ date: new Date() })}>
            Today
          </PillButton>
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => step(1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      <p className="planner-range" aria-live="polite">
        {title}
      </p>

      {view === 'day' && <DayView day={day} items={items} blocks={blocks} />}
      {view === 'week' && <WeekView day={day} items={items} blocks={blocks} />}
      {view === 'month' && <MonthView day={day} items={items} />}

      <p className="mt-6 flex flex-wrap gap-2">
        <Link to="/planner/review" className="pill pill--secondary">
          Weekly review
        </Link>
        <Link to="/settings" className="pill pill--secondary">
          Settings
        </Link>
      </p>
    </>
  );
}
