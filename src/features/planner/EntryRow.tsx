import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Chip } from '../../core/design/components';
import type { PlannerEntry } from '../../core/planner/entries';
import { isGenerated } from '../../core/planner/providers';
import { setDone } from '../../core/planner/store';
import { fmtTime } from '../../core/planner/time';

/** Generated items open their module page (sourceRef "/english/review"); the user's own open the item page. */
export const entryHref = (e: PlannerEntry) =>
  e.sourceRef?.startsWith('/') ? e.sourceRef : `/planner/item/${e.baseId}${e.occurrence ? `?on=${e.occurrence}` : ''}`;

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function whenText(e: PlannerEntry, withDate = false): string {
  const date = (iso: string) => (withDate ? `${dayFmt.format(new Date(iso))} ` : '');
  if (e.start) return `${date(e.start)}${fmtTime(e.start)}${e.end ? `–${fmtTime(e.end)}` : ''}`;
  if (e.dueDate) {
    const due = new Date(e.dueDate);
    const endOfDay = due.getHours() === 23 && due.getMinutes() === 59;
    return `${e.kind === 'deadline' ? 'Due ' : ''}${date(e.dueDate)}${endOfDay ? '' : fmtTime(due)}`.trim() || 'Today';
  }
  return 'Anytime';
}

/** One planner entry in a list: done checkbox, title (opens the item), time and tags. */
export function EntryRow({ entry, withDate = false, extra }: { entry: PlannerEntry; withDate?: boolean; extra?: ReactNode }) {
  return (
    <li className={`entry-row mod-${entry.source} ${entry.done ? 'entry-row--done' : ''}`}>
      <input
        type="checkbox"
        className="check"
        checked={entry.done}
        disabled={isGenerated(entry.baseId) && !!entry.recurrence}
        title={isGenerated(entry.baseId) && entry.recurrence ? 'Done automatically when the module’s minimum is met' : undefined}
        onChange={(e) => void setDone(entry, e.target.checked)}
        aria-label={`Done: ${entry.title}`}
      />
      <Link to={entryHref(entry)}>
        {entry.title}
        <span className="entry-meta tnum">{whenText(entry, withDate)}</span>
      </Link>
      {entry.kind === 'deadline' && <Chip tone="warm">Deadline</Chip>}
      {entry.importance === 'critical' && <Chip tone="danger">Critical</Chip>}
      {entry.importance === 'important' && <Chip tone="violet">Important</Chip>}
      {extra}
    </li>
  );
}
