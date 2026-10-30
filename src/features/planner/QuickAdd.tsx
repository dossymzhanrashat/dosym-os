import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chip, PillButton } from '../../core/design/components';
import { Sheet } from '../../core/design/Sheet';
import { parseQuickAdd } from '../../core/planner/quickAdd';
import { newItem, saveItem } from '../../core/planner/store';
import { fmtTime } from '../../core/planner/time';
import type { Importance, PlannerSource, Recurrence, ReminderOffset } from '../../core/planner/types';

/*
 * Quick Add (SPEC.md › Pages): one field with natural-language parsing, chips for module,
 * importance, reminders and repeat. Opens from the floating pill, the `N` key on laptops, or a
 * drag on the Day timeline (which pre-fills the time). Enter saves.
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

function QuickAddSheet({ prefill, onClose }: { prefill: Prefill; onClose: () => void }) {
  const [text, setText] = useState(prefill.text ?? '');
  // Chips override what the text says; undefined = follow the text.
  const [source, setSource] = useState<PlannerSource>();
  const [importance, setImportance] = useState<Importance>();
  const [remind, setRemind] = useState<number | null>();
  const [repeat, setRepeat] = useState<Recurrence['freq'] | null>();
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const timeFromText = parsed.start !== undefined || parsed.dueDate !== undefined;
  const start = timeFromText ? parsed.start : prefill.start;
  const end = timeFromText ? parsed.end : prefill.end;
  const finalImportance = importance ?? parsed.importance;
  const autoRemind = finalImportance === 'important' ? 30 : null; // spec: important plans default to 30 min before
  const remindValue = remind === undefined ? autoRemind : remind;
  const recurrence: Recurrence | undefined =
    repeat === undefined ? parsed.recurrence : repeat === null ? undefined : { freq: repeat, interval: 1 };

  useEffect(() => inputRef.current?.focus(), []);

  const save = async () => {
    if (saving || !text.trim()) return;
    setSaving(true);
    const reminders: ReminderOffset[] = remindValue === null ? [] : [{ offsetMinutes: remindValue }];
    await saveItem(
      newItem({
        title: parsed.title,
        kind: start && parsed.kind === 'task' ? 'event' : parsed.kind,
        start: start?.toISOString(),
        end: end?.toISOString(),
        dueDate: parsed.dueDate?.toISOString(),
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
        <span className="sr-only">What and when</span>
        <input
          ref={inputRef}
          className="input input--big"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="IELTS mock Sat 10:00 2h !important"
          autoComplete="off"
          enterKeyHint="done"
        />
      </label>
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {!timeFromText && start && (
          <Chip tone="ice">
            {fmtTime(start)}–{end ? fmtTime(end) : ''}
          </Chip>
        )}
        {parsed.matched.map((m) => (
          <Chip key={m} tone="ice">
            {m}
          </Chip>
        ))}
        {!start && !parsed.dueDate && text.trim() && <Chip>Anytime</Chip>}
      </div>
      <Choice label="Module" options={MODULES} value={source ?? parsed.source} onChange={setSource} />
      <Choice label="Importance" options={IMPORTANCE} value={finalImportance} onChange={setImportance} />
      <Choice label="Remind before" options={REMIND} value={remindValue} onChange={setRemind} />
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
