import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PillButton } from '../../core/design/components';
import { Sheet } from '../../core/design/Sheet';
import { parseQuickAdd } from '../../core/planner/quickAdd';
import { newItem, saveItem } from '../../core/planner/store';
import { addDays, atMinutes, dayKey, fmtHHMM, fromDayKey, minutesOfDay, parseHHMM } from '../../core/planner/time';
import type { Importance, PlannerSource, Recurrence, ReminderOffset } from '../../core/planner/types';

/*
 * Quick Add (SPEC.md › Pages): a title field, then type, day and time pickers, and chips for
 * module, importance, reminders and repeat. Typing "Sat 10:00 !important" in the title still works
 * as a shortcut: it fills the pickers until you touch them. Opens from the floating pill, the `N`
 * key on laptops, or a drag on the Day timeline (which pre-fills the time). Enter saves.
 */

interface Prefill {
  text?: string;
  start?: Date;
  end?: Date;
}

const QuickAddContext = createContext<(prefill?: Prefill) => void>(() => {});
export const useQuickAdd = () => useContext(QuickAddContext);

const MODULES: { value: PlannerSource; label: string }[] = [
  { value: 'user', label: 'Me' },
  { value: 'english', label: 'English' },
  { value: 'frostpure', label: 'FrostPure' },
  { value: 'tagylym', label: 'Tagylym' },
  { value: 'radar', label: 'Radar' },
];
const IMPORTANCE: { value: Importance; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'critical', label: 'Critical' },
];
const REMIND: { value: number | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 0, label: 'At time' },
  { value: 10, label: '10 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 1440, label: '1 day' },
];
const REPEAT: { value: Recurrence['freq'] | null; label: string }[] = [
  { value: null, label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function Choice<T>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="field-label" id={`qa-${label}`}>
        {label}
      </span>
      <div className="seg" role="radiogroup" aria-labelledby={`qa-${label}`}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className="seg-btn" onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Kind = 'event' | 'task' | 'deadline';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'event', label: 'Plan at a time' },
  { value: 'task', label: 'Task for a day' },
  { value: 'deadline', label: 'Deadline' },
];

/** Picker values: "YYYY-MM-DD" and "HH:MM"; '' = not set. */
interface When {
  date: string;
  start: string;
  end: string;
}

const hhmm = (d: Date) => fmtHHMM(minutesOfDay(d));
const at = (date: string, time: string) => atMinutes(fromDayKey(date), parseHHMM(time));
const nextHour = () => fmtHHMM(Math.min(23 * 60, (Math.floor(minutesOfDay(new Date()) / 60) + 1) * 60));

function whenFrom(start?: Date, end?: Date, due?: Date): When {
  if (start) return { date: dayKey(start), start: hhmm(start), end: end ? hhmm(end) : '' };
  if (due) {
    const t = hhmm(due);
    return { date: dayKey(due), start: t === '23:59' ? '' : t, end: '' };
  }
  return { date: '', start: '', end: '' };
}

function QuickAddSheet({ prefill, onClose }: { prefill: Prefill; onClose: () => void }) {
  const [text, setText] = useState(prefill.text ?? '');
  // Pickers and chips override what the text says; undefined/null = follow the text.
  const [picked, setPicked] = useState<When | null>(prefill.start ? whenFrom(prefill.start, prefill.end) : null);
  const [kindPicked, setKindPicked] = useState<Kind>();
  const [source, setSource] = useState<PlannerSource>();
  const [importance, setImportance] = useState<Importance>();
  const [remind, setRemind] = useState<number | null>();
  const [alarm, setAlarm] = useState(false);
  const [repeat, setRepeat] = useState<Recurrence['freq'] | null>();
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const fromText = parsed.start || parsed.dueDate ? whenFrom(parsed.start, parsed.end, parsed.dueDate) : null;
  const when = picked ?? fromText ?? { date: '', start: '', end: '' };
  const kind: Kind = kindPicked ?? (parsed.kind === 'deadline' ? 'deadline' : when.start ? 'event' : 'task');
  const setWhen = (patch: Partial<When>) => setPicked({ ...when, ...patch });

  const finalImportance = importance ?? parsed.importance;
  const autoRemind = finalImportance === 'important' ? 30 : null; // spec: important plans default to 30 min before
  const remindValue = remind === undefined ? autoRemind : remind;
  const recurrence: Recurrence | undefined =
    repeat === undefined ? parsed.recurrence : repeat === null ? undefined : { freq: repeat, interval: 1 };

  useEffect(() => inputRef.current?.focus(), []);

  const today = dayKey(new Date());
  const tomorrow = dayKey(addDays(new Date(), 1));

  const chooseKind = (k: Kind) => {
    setKindPicked(k);
    // A plan needs a time: start at the next full hour, for one hour.
    if (k === 'event' && !when.start) {
      const start = nextHour();
      setWhen({ date: when.date || today, start, end: fmtHHMM(Math.min(parseHHMM(start) + 60, 23 * 60 + 59)) });
    }
  };

  const setStart = (start: string) => {
    if (!start) return setWhen({ start: '', end: '' });
    // Moving the start keeps the length; a first start gets one hour.
    const length = when.start && when.end ? (parseHHMM(when.end) - parseHHMM(when.start) + 1440) % 1440 : 60;
    setWhen({ date: when.date || today, start, end: kind === 'event' ? fmtHHMM((parseHHMM(start) + length) % 1440) : '' });
  };

  const save = async () => {
    if (saving || !text.trim()) return;
    setSaving(true);
    let start: Date | undefined;
    let end: Date | undefined;
    let dueDate: Date | undefined;
    if (kind === 'event') {
      const date = when.date || today;
      start = at(date, when.start || nextHour());
      end = when.end ? at(date, when.end) : new Date(start.getTime() + 3_600_000);
      if (end <= start) end = addDays(end, 1); // ends after midnight
    } else if (when.date) {
      dueDate = at(when.date, kind === 'deadline' && when.start ? when.start : '23:59');
    }
    const reminders: ReminderOffset[] = remindValue === null ? [] : [{ offsetMinutes: remindValue, ...(alarm ? { alarm: true } : {}) }];
    await saveItem(
      newItem({
        title: parsed.title,
        kind,
        start: start?.toISOString(),
        end: end?.toISOString(),
        dueDate: dueDate?.toISOString(),
        source: source ?? parsed.source,
        importance: finalImportance,
        priority: finalImportance === 'critical' ? 3 : finalImportance === 'important' ? 2 : 0,
        reminders,
        recurrence,
      }),
    );
    onClose();
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="field">
        <span className="field-label">What</span>
        <input
          ref={inputRef}
          className="input input--big"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="IELTS mock"
          autoComplete="off"
          enterKeyHint="done"
        />
      </label>

      <Choice label="Type" options={KINDS} value={kind} onChange={chooseKind} />

      <div className="field">
        <span className="field-label" id="qa-day">
          Day
        </span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="qa-day">
          {kind === 'task' && (
            <button type="button" className="seg-btn" aria-pressed={!when.date} onClick={() => setWhen({ date: '', start: '', end: '' })}>
              Anytime
            </button>
          )}
          <button type="button" className="seg-btn" aria-pressed={when.date === today} onClick={() => setWhen({ date: today })}>
            Today
          </button>
          <button type="button" className="seg-btn" aria-pressed={when.date === tomorrow} onClick={() => setWhen({ date: tomorrow })}>
            Tomorrow
          </button>
          <input
            type="date"
            className="input w-auto"
            aria-label="Pick a date"
            value={when.date}
            onChange={(e) => setWhen({ date: e.target.value })}
          />
        </div>
      </div>

      {kind === 'event' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span className="field-label">Starts</span>
            <input type="time" className="input" step={300} value={when.start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Ends</span>
            <input type="time" className="input" step={300} value={when.end} onChange={(e) => setWhen({ end: e.target.value })} />
          </label>
        </div>
      )}
      {kind === 'deadline' && (
        <label className="field">
          <span className="field-label">Due at (empty = end of the day)</span>
          <input type="time" className="input" step={300} value={when.start} onChange={(e) => setWhen({ date: when.date || today, start: e.target.value })} />
        </label>
      )}

      <Choice label="Module" options={MODULES} value={source ?? parsed.source} onChange={setSource} />
      <Choice label="Importance" options={IMPORTANCE} value={finalImportance} onChange={setImportance} />
      <Choice label="Remind before" options={REMIND} value={remindValue} onChange={setRemind} />
      <label className="flex items-center gap-3">
        <input type="checkbox" className="check" checked={alarm} disabled={remindValue === null} onChange={(e) => setAlarm(e.target.checked)} />
        <span>Alarm: also sends in quiet hours (22:30–06:30)</span>
      </label>
      <Choice label="Repeat" options={REPEAT} value={recurrence?.freq ?? null} onChange={setRepeat} />
      {finalImportance === 'critical' && (
        <p className="m-0 text-sm">Critical deadlines also remind you 7, 3 and 1 day before at 18:00, and at 09:00 on the day.</p>
      )}
      <PillButton type="submit" disabled={!text.trim() || saving}>
        Add to planner
      </PillButton>
    </form>
  );
}

const PLUS = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const open = useCallback((p?: Prefill) => setPrefill(p ?? {}), []);

  // `N` opens Quick Add on laptops (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
      e.preventDefault();
      open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <QuickAddContext.Provider value={open}>
      {children}
      <PillButton className="fab" onClick={() => open()} aria-keyshortcuts="N">
        {PLUS} Quick Add
      </PillButton>
      <Sheet open={prefill !== null} onClose={() => setPrefill(null)} title="Quick Add">
        {prefill && <QuickAddSheet prefill={prefill} onClose={() => setPrefill(null)} />}
      </Sheet>
    </QuickAddContext.Provider>
  );
}
