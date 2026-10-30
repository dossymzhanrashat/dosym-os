import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../core/design/components';
import { SaltDotsLoader } from '../../core/design/FreezeFront';
import { entryFor } from '../../core/planner/entries';
import {
  backPlanSteps,
  deleteEntry,
  pushToTomorrow,
  saveItem,
  saveMany,
  setDone,
  snooze,
  splitSteps,
  usePlannerItem,
} from '../../core/planner/store';
import { fmtTime } from '../../core/planner/time';
import type { Importance, PlannerItem, PlannerKind, PlannerSource, Recurrence } from '../../core/planner/types';
import { whenText } from './EntryRow';
import './planner.css';

/*
 * Item detail (SPEC.md › Pages): title, notes, time, repeat, reminders, linked object, checklist,
 * attachments, "push to tomorrow", "split into steps". A tapped notification opens this page,
 * so Done / Snooze 1 h / Tomorrow sit at the top.
 */

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

const KINDS: { value: PlannerKind; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'event', label: 'Plan' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'testMoment', label: 'Test moment' },
];
const SOURCES: { value: PlannerSource; label: string }[] = [
  { value: 'user', label: 'Me' },
  { value: 'english', label: 'English' },
  { value: 'frostpure', label: 'FrostPure' },
  { value: 'tagylym', label: 'Tagylym' },
  { value: 'radar', label: 'Radar' },
];
const IMPORTANCE: Importance[] = ['normal', 'important', 'critical'];
const OFFSETS = [
  { value: 0, label: 'At time' },
  { value: 10, label: '10 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 180, label: '3 h' },
  { value: 1440, label: '1 day' },
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Seg<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className="seg-btn" onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Editor({ item, occurrence }: { item: PlannerItem; occurrence?: string }) {
  const navigate = useNavigate();
  const entry = entryFor(item, occurrence) ?? { ...item, baseId: item.id };
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [newCheck, setNewCheck] = useState('');
  const [link, setLink] = useState({ title: '', url: '' });
  const [steps, setSteps] = useState('');
  const [flash, setFlash] = useState('');

  const commit = (patch: Partial<PlannerItem>) => void saveItem({ ...item, ...patch });
  const say = (text: string) => {
    setFlash(text);
    setTimeout(() => setFlash(''), 2500);
  };

  const r = item.recurrence;
  const setRepeat = (next: Recurrence | undefined) => commit({ recurrence: next });
  const toggleOffset = (min: number) => {
    const has = item.reminders.some((x) => x.offsetMinutes === min);
    commit({ reminders: has ? item.reminders.filter((x) => x.offsetMinutes !== min) : [...item.reminders, { offsetMinutes: min }].sort((a, b) => a.offsetMinutes - b.offsetMinutes) });
  };
  const alarm = item.reminders.some((x) => x.alarm);

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to={`/planner?view=day${entry.start || entry.dueDate ? `&date=${toLocalInput(entry.start ?? entry.dueDate).slice(0, 10)}` : ''}`}>Planner</Link> · {whenText(entry, true)}
        </p>
        <h1 className="ff-title" style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)' }}>
          {item.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          {entry.done ? <Chip tone="good">Done</Chip> : null}
          {item.kind === 'deadline' && <Chip tone="warm">Deadline</Chip>}
          {item.importance !== 'normal' && <Chip tone={item.importance === 'critical' ? 'danger' : 'violet'}>{item.importance === 'critical' ? 'Critical' : 'Important'}</Chip>}
          {item.recurrence && <Chip tone="ice">Repeats</Chip>}
          {item.snoozedUntil && new Date(item.snoozedUntil) > new Date() && <Chip>Snoozed until {fmtTime(item.snoozedUntil)}</Chip>}
        </div>
      </header>

      <div className="grid gap-3">
        <GlassCard size="md" aria-label="Actions">
          <div className="flex flex-wrap gap-2">
            <PillButton onClick={() => void setDone(entry, !entry.done).then(() => say(entry.done ? 'Marked not done' : 'Done. Nice.'))}>
              {entry.done ? 'Undo done' : 'Done'}
            </PillButton>
            <PillButton variant="secondary" onClick={() => void snooze(entry).then(() => say('Reminding you again in 1 hour'))}>
              Snooze 1 h
            </PillButton>
            <PillButton
              variant="secondary"
              onClick={() => void pushToTomorrow(entry).then(() => (entry.occurrence ? navigate('/planner') : say('Moved to tomorrow')))}
            >
              Tomorrow
            </PillButton>
          </div>
          <p className="m-0 mt-2 min-h-6 text-sm" role="status">
            {flash}
          </p>
        </GlassCard>

        <GlassCard size="md" aria-labelledby="details" className="grid gap-4">
          <h2 id="details" className="card-title m-0">
            Details
          </h2>
          {occurrence && <p className="notice m-0 text-sm">This plan repeats. Changes here apply to every day; Done, Snooze and Tomorrow apply only to {occurrence}.</p>}
          <label className="field">
            <span className="field-label">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== item.title && commit({ title: title.trim() })} />
          </label>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (item.notes ?? '') && commit({ notes: notes || undefined })} />
          </label>
          <Seg label="Kind" options={KINDS} value={KINDS.some((k) => k.value === item.kind) ? item.kind : 'task'} onChange={(kind) => commit({ kind })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Start</span>
              <input
                type="datetime-local"
                className="input"
                defaultValue={toLocalInput(item.start)}
                onBlur={(e) => {
                  const start = fromLocalInput(e.target.value);
                  if (start === item.start) return;
                  const length = item.start && item.end ? new Date(item.end).getTime() - new Date(item.start).getTime() : 3_600_000;
                  commit({ start, end: start ? new Date(new Date(start).getTime() + length).toISOString() : undefined });
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">End</span>
              <input type="datetime-local" className="input" defaultValue={toLocalInput(item.end)} onBlur={(e) => fromLocalInput(e.target.value) !== item.end && commit({ end: fromLocalInput(e.target.value) })} />
            </label>
            <label className="field">
              <span className="field-label">Due</span>
              <input type="datetime-local" className="input" defaultValue={toLocalInput(item.dueDate)} onBlur={(e) => fromLocalInput(e.target.value) !== item.dueDate && commit({ dueDate: fromLocalInput(e.target.value) })} />
            </label>
          </div>
          <Seg label="Importance" options={IMPORTANCE.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} value={item.importance} onChange={(importance) => commit({ importance, priority: importance === 'critical' ? 3 : importance === 'important' ? 2 : 0 })} />
          <Seg label="Module" options={SOURCES} value={item.source} onChange={(source) => commit({ source })} />
          {item.sourceRef && (
            <p className="m-0 text-sm">
              Linked to <code>{item.sourceRef}</code>
              {item.sourceRef.startsWith('planner:') && (
                <>
                  {' '}
                  · <Link to={`/planner/item/${item.sourceRef.slice(8)}`}>open</Link>
                </>
              )}
            </p>
          )}
        </GlassCard>

        <GlassCard size="md" aria-labelledby="repeat-h" className="grid gap-4">
          <h2 id="repeat-h" className="card-title m-0">
            Repeat and reminders
          </h2>
          <Seg
            label="Repeat"
            options={[
              { value: 'none', label: 'Once' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            value={r?.freq ?? 'none'}
            onChange={(f) => setRepeat(f === 'none' ? undefined : { freq: f as Recurrence['freq'], interval: r?.interval ?? 1 })}
          />
          {r && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="field w-28">
                <span className="field-label">Every</span>
                <input type="number" min={1} className="input" value={r.interval} onChange={(e) => setRepeat({ ...r, interval: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
              {r.freq === 'weekly' && (
                <div className="seg" role="group" aria-label="On weekdays">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const on = r.byWeekday?.includes(d) ?? false;
                    return (
                      <button
                        key={d}
                        type="button"
                        className="seg-btn"
                        aria-pressed={on}
                        onClick={() => setRepeat({ ...r, byWeekday: on ? r.byWeekday!.filter((x) => x !== d) : [...(r.byWeekday ?? []), d].sort() })}
                      >
                        {WEEKDAYS[d]}
                      </button>
                    );
                  })}
                </div>
              )}
              <label className="field">
                <span className="field-label">Until</span>
                <input type="date" className="input" defaultValue={r.until?.slice(0, 10) ?? ''} onBlur={(e) => setRepeat({ ...r, until: e.target.value ? new Date(`${e.target.value}T23:59`).toISOString() : undefined })} />
              </label>
            </div>
          )}
          <div className="field">
            <span className="field-label">Remind before</span>
            <div className="seg" role="group" aria-label="Remind before">
              {OFFSETS.map((o) => (
                <button key={o.value} type="button" className="seg-btn" aria-pressed={item.reminders.some((x) => x.offsetMinutes === o.value)} onClick={() => toggleOffset(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="check"
              checked={alarm}
              disabled={!item.reminders.length}
              onChange={(e) => commit({ reminders: item.reminders.map((x) => ({ ...x, alarm: e.target.checked || undefined })) })}
            />
            <span>Alarm — also sends during quiet hours (22:30–06:30)</span>
          </label>
          {item.importance === 'critical' && <p className="m-0 text-sm">Critical: also 7, 3 and 1 day before at 18:00 and 09:00 on the day.</p>}
        </GlassCard>

        <GlassCard size="md" aria-labelledby="check-h" className="grid gap-3">
          <h2 id="check-h" className="card-title m-0">
            Checklist
          </h2>
          {item.checklist?.length ? (
            <ul className="entry-list">
              {item.checklist.map((c) => (
                <li key={c.id} className={`entry-row mod-${item.source} ${c.done ? 'entry-row--done' : ''}`}>
                  <input
                    type="checkbox"
                    className="check"
                    checked={c.done}
                    aria-label={c.text}
                    onChange={(e) => commit({ checklist: item.checklist!.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })}
                  />
                  <span className="flex-1">{c.text}</span>
                  <button type="button" className="seg-btn" onClick={() => commit({ checklist: item.checklist!.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.text}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCheck.trim()) return;
              commit({ checklist: [...(item.checklist ?? []), { id: crypto.randomUUID(), text: newCheck.trim(), done: false }] });
              setNewCheck('');
            }}
          >
            <input className="input" value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add a checklist line" aria-label="New checklist line" />
            <PillButton type="submit" variant="secondary">
              Add
            </PillButton>
          </form>
        </GlassCard>

        <GlassCard size="md" aria-labelledby="links-h" className="grid gap-3">
          <h2 id="links-h" className="card-title m-0">
            Attachments
          </h2>
          <p className="m-0 text-sm">Links for now (Drive, YouTube, Canva). File uploads come with FrostPure in Phase 5.</p>
          {item.links?.map((l, i) => (
            <div key={`${l.url}-${i}`} className="flex items-center gap-2">
              <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 truncate">
                {l.title || l.url}
              </a>
              <button type="button" className="seg-btn" onClick={() => commit({ links: item.links!.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^https?:\/\//.test(link.url)) return;
              commit({ links: [...(item.links ?? []), { title: link.title.trim(), url: link.url.trim() }] });
              setLink({ title: '', url: '' });
            }}
          >
            <input className="input" value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} placeholder="Name" aria-label="Link name" />
            <input className="input" type="url" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" aria-label="Link address" />
            <PillButton type="submit" variant="secondary">
              Add link
            </PillButton>
          </form>
        </GlassCard>

        <GlassCard size="md" aria-labelledby="steps-h" className="grid gap-3">
          <h2 id="steps-h" className="card-title m-0">
            Steps
          </h2>
          {item.kind === 'deadline' && (
            <div className="flex flex-wrap items-center gap-3">
              <PillButton
                variant="secondary"
                onClick={() => {
                  const made = backPlanSteps(item);
                  void saveMany(made).then(() => say(made.length ? `Added ${made.length} steps: draft T-21, review T-10, submit T-2` : 'Too close to the deadline for back-planning'));
                }}
              >
                Back-plan this deadline
              </PillButton>
              <span className="text-sm">Draft 21 days before, review 10, submit 2.</span>
            </div>
          )}
          <label className="field">
            <span className="field-label">Split into steps (one per line)</span>
            <textarea className="input" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'Write outline\nCollect data\nFinal check'} />
          </label>
          <div>
            <PillButton
              variant="secondary"
              disabled={!steps.trim()}
              onClick={() => {
                const made = splitSteps(entry, steps.split('\n'));
                void saveMany(made).then(() => {
                  setSteps('');
                  say(`Added ${made.length} steps`);
                });
              }}
            >
              Split into steps
            </PillButton>
          </div>
        </GlassCard>

        <div className="flex flex-wrap gap-2">
          {occurrence && (
            <PillButton variant="secondary" onClick={() => void deleteEntry(entry).then(() => navigate('/planner'))}>
              Delete only {occurrence}
            </PillButton>
          )}
          <PillButton variant="secondary" onClick={() => void deleteEntry({ ...entry, occurrence: undefined }).then(() => navigate('/planner'))}>
            {item.recurrence ? 'Delete every repeat' : 'Delete'}
          </PillButton>
        </div>
      </div>
    </>
  );
}

export function ItemPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const item = usePlannerItem(id);

  if (item === undefined) return <SaltDotsLoader label="Opening item" />;
  if (item === null || item.deletedAt)
    return (
      <GlassCard>
        <h1 className="card-title">Not found</h1>
        <p>This item was deleted, or it has not synced to this device yet.</p>
        <Link to="/planner" className="pill pill--secondary">
          Back to Planner
        </Link>
      </GlassCard>
    );
  // key: reset the form when moving to another item
  return <Editor key={item.id} item={item} occurrence={params.get('on') ?? undefined} />;
}
