import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import type { PlannerEntry } from '../../core/planner/entries';
import { DAY_END, DAY_START, layoutDay } from '../../core/planner/layout';
import { moveTo } from '../../core/planner/store';
import { atMinutes, fmtHHMM, fmtTime, minutesOfDay, parseHHMM, startOfDay } from '../../core/planner/time';
import type { FixedBlock } from '../../core/planner/types';
import { entryHref } from './EntryRow';
import { useQuickAdd } from './QuickAdd';

const RANGE = DAY_END - DAY_START;
const SNAP = 15;
const LONG_PRESS_MS = 350;
const pct = (min: number) => `${((min - DAY_START) / RANGE) * 100}%`;

interface Drag {
  mode: 'create' | 'resize';
  pointerId: number;
  anchor: number; // minute where the drag started (create) or the entry's start (resize)
  entry?: PlannerEntry;
  startY: number;
  active: boolean; // touch: becomes true after a long press
  moved: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export function HourLabels() {
  return (
    <div className="tl-labels" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => DAY_START + i * 60)
        .slice(1)
        .map((m) => (
          <span key={m} className="tl-label" style={{ top: pct(m) }}>
            {fmtHHMM(m)}
          </span>
        ))}
    </div>
  );
}

/**
 * One day of the 06:00–24:00 timeline. Drag on empty space to create (mouse: drag; touch: hold,
 * then drag), tap to add one hour there, drag an item's bottom edge to resize it.
 */
export function TimelineColumn({ day, entries, blocks, label }: { day: Date; entries: PlannerEntry[]; blocks: FixedBlock[]; label: string }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<{ a: number; b: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; end: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const openQuickAdd = useQuickAdd();

  const isToday = startOfDay(now).getTime() === startOfDay(day).getTime();
  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [isToday]);

  // While a touch drag is active, stop the page from scrolling (needs a non-passive listener).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  const minuteAt = (clientY: number) => {
    const r = gridRef.current!.getBoundingClientRect();
    const m = DAY_START + ((clientY - r.top) / r.height) * RANGE;
    return Math.min(Math.max(Math.round(m / SNAP) * SNAP, DAY_START), DAY_END);
  };

  const reset = () => {
    clearTimeout(drag.current?.timer);
    drag.current = null;
    setGhost(null);
    setResizing(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tl-entry')) return;
    const m = minuteAt(e.clientY);
    const d: Drag = { mode: 'create', pointerId: e.pointerId, anchor: m, startY: e.clientY, active: e.pointerType !== 'touch', moved: false };
    drag.current = d;
    if (d.active) gridRef.current!.setPointerCapture(e.pointerId);
    else {
      d.timer = setTimeout(() => {
        d.active = true;
        gridRef.current?.setPointerCapture(d.pointerId);
        setGhost({ a: m, b: Math.min(m + 60, DAY_END) });
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    }
  };

  const startResize = (e: ReactPointerEvent<HTMLSpanElement>, entry: PlannerEntry, startMin: number) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { mode: 'resize', pointerId: e.pointerId, anchor: startMin, entry, startY: e.clientY, active: true, moved: false };
    gridRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) > 8) reset(); // it is a scroll, not a press
      return;
    }
    const m = minuteAt(e.clientY);
    if (Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    if (d.mode === 'resize') setResizing({ id: d.entry!.id, end: Math.max(d.anchor + SNAP, m) });
    else setGhost(m >= d.anchor ? { a: d.anchor, b: Math.max(m, d.anchor + SNAP) } : { a: m, b: d.anchor });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const m = minuteAt(e.clientY);
    if (d.mode === 'resize' && d.moved) {
      const end = Math.max(d.anchor + SNAP, m);
      const entry = d.entry!;
      void moveTo(entry, new Date(entry.start!), atMinutes(day, end));
    } else if (d.mode === 'create') {
      // A plain tap or click adds one hour at that slot; a drag uses the dragged range.
      const range = d.moved && ghost ? ghost : { a: d.anchor, b: Math.min(d.anchor + 60, DAY_END) };
      if (d.active || !d.moved) openQuickAdd({ start: atMinutes(day, range.a), end: atMinutes(day, range.b) });
    }
    reset();
  };

  const placed = layoutDay(entries, day);
  const nowMin = minutesOfDay(now);

  return (
    <div
      ref={gridRef}
      className="tl-col"
      role="group"
      aria-label={`${label} timeline. Tap an empty time to add a plan.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
    >
      {blocks
        .filter((b) => b.days.includes(day.getDay()))
        .flatMap((b) => {
          const s = parseHHMM(b.start);
          const e = parseHHMM(b.end);
          // A block over midnight (sleep 22:30–06:30) shows its evening part.
          const parts = e > s ? [[s, e]] : [[s, DAY_END]];
          return parts
            .map(([a, z]) => [Math.max(a, DAY_START), Math.min(z, DAY_END)])
            .filter(([a, z]) => z > a)
            .map(([a, z]) => (
              <div key={`${b.id}-${a}`} className="tl-block" style={{ top: pct(a), height: `${((z - a) / RANGE) * 100}%` }}>
                {b.label}
              </div>
            ));
        })}

      {placed.map(({ entry, startMin, endMin, lane, lanes }) => {
        const end = resizing?.id === entry.id ? resizing.end : endMin;
        return (
          <Link
            key={entry.id}
            to={entryHref(entry)}
            className={`tl-entry mod-${entry.source} ${entry.done ? 'tl-entry--done' : ''}`}
            style={{
              top: pct(startMin),
              height: `${((end - startMin) / RANGE) * 100}%`,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
            }}
            draggable={false}
          >
            {entry.title}
            <span className="tl-entry-time">
              {fmtTime(entry.start!)}
              {entry.end ? `–${resizing?.id === entry.id ? fmtHHMM(end) : fmtTime(entry.end)}` : ''}
            </span>
            {entry.end && (
              <span className="tl-resize" aria-hidden="true" onPointerDown={(e) => startResize(e, entry, startMin)} onClick={(e) => e.preventDefault()} />
            )}
          </Link>
        );
      })}

      {ghost && (
        <div className="tl-ghost" style={{ top: pct(ghost.a), height: `${((ghost.b - ghost.a) / RANGE) * 100}%` }}>
          {fmtHHMM(ghost.a)}–{fmtHHMM(ghost.b)}
        </div>
      )}
      {isToday && nowMin >= DAY_START && <div className="tl-now" style={{ top: pct(nowMin) }} aria-hidden="true" />}
    </div>
  );
}
