import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import { Chip, GlassCard, PillButton, StatTile } from '../../../core/design/components';
import { FreezeFrontBar, SaltDotsLoader } from '../../../core/design/FreezeFront';
import { Mascot } from '../../../core/design/Mascot';
import { Sheet } from '../../../core/design/Sheet';
import { almatyParts } from '../../../core/planner/time';
import { useQuickAdd } from '../../planner/QuickAdd';
import { gradeCard, markEmptyQueueDay, schedulerConfig, todayPlan, undoGrade, useEnglishData, useEnglishSettings, type UndoSnapshot } from '../data/store';
import type { Grade, VocabCard } from '../model/types';
import { WEEKLY_PATTERN } from '../srs/phase';
import { intervalLabel, preview } from '../srs/scheduler';
import { isSalt } from '../srs/status';
import { studyDay } from '../srs/studyDay';
import { CardFace, TYPE_LABEL } from './CardFace';
import { warmUpVoices } from './speech';
import { WordDetails } from './WordDetails';
import './english.css';

/*
 * Review session (SPEC § 3.2): one card at a time. Tap or Space flips; Again / Hard / Good / Easy
 * (keys 1–4) each show the next interval. Swipe left = Again, right = Good. Long-press opens the
 * word sheet. One-level undo (U). Active time ignores idle gaps over 30 s.
 */

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 1, label: 'Again', cls: 'grade--again' },
  { g: 2, label: 'Hard', cls: '' },
  { g: 3, label: 'Good', cls: '' },
  { g: 4, label: 'Easy', cls: '' },
];
const IDLE_MS = 30_000;
const SWIPE_PX = 80;

const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export function ReviewPage() {
  const data = useEnglishData();
  const settings = useEnglishSettings();
  const openQuickAdd = useQuickAdd();

  // Cards graded in this session, applied on top of live data until the database catches up.
  const [overrides, setOverrides] = useState<Map<string, VocabCard>>(new Map());
  const [flipped, setFlipped] = useState(false);
  const [suggested, setSuggested] = useState<Grade | undefined>();
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [session, setSession] = useState({ reviewed: 0, again: 0, frozen: 0, activeMs: 0 });
  const [startSalt, setStartSalt] = useState<number | null>(null);
  const [startTotal, setStartTotal] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const lastActivity = useRef(Date.now());
  const cardActive = useRef(0);
  const pointer = useRef<{ x: number; y: number; t: number; timer?: ReturnType<typeof setTimeout>; long: boolean } | null>(null);

  useEffect(() => warmUpVoices(), []);

  const merged = useMemo(() => {
    if (!overrides.size) return data;
    const cards = data.cards.map((c) => {
      const o = overrides.get(c.id);
      return o && o.updatedAt > c.updatedAt ? o : c;
    });
    return { ...data, cards };
  }, [data, overrides]);

  const plan = useMemo(() => todayPlan(merged, settings, now), [merged, settings, now]);
  // The card on screen stays until it is graded; learning cards that come due join behind it.
  const [pinned, setPinned] = useState<string | null>(null);
  const current = plan.queue.order.find((c) => c.id === pinned) ?? plan.queue.order[0];
  useEffect(() => {
    if (current && current.id !== pinned) setPinned(current.id);
  }, [current, pinned]);
  const showingCard = useRef(false);
  showingCard.current = !!current;
  const note = current ? merged.noteMap.get(current.noteId) : undefined;
  const salt = useMemo(() => [...merged.cardsByNote.values()].filter((cs) => isSalt(cs, now)).length, [merged, now]);

  useEffect(() => {
    if (data.loaded && startTotal === null) {
      setStartTotal(plan.queue.order.length);
      setStartSalt(salt);
    }
  }, [data.loaded, startTotal, plan.queue.order.length, salt]);

  // Clock: session timer, active time (idle > 30 s not counted), learning cards coming due.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      if (n - lastActivity.current <= IDLE_MS && document.visibilityState === 'visible' && showingCard.current && !finished) {
        cardActive.current += 1000;
        setSession((s) => ({ ...s, activeMs: s.activeMs + 1000 }));
      }
      setNow(new Date());
    }, 1000);
    const touch = () => (lastActivity.current = Date.now());
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [finished]);

  // A new card: reset the flip and its timer.
  useEffect(() => {
    setFlipped(false);
    setSuggested(undefined);
    cardActive.current = 0;
  }, [current?.id]);

  // Interval labels for the four buttons, worked out once per card.
  const previews = useMemo(() => (current ? { at: new Date(), p: preview(current, new Date(), schedulerConfig(settings)) } : null), [current, settings]);

  const reveal = useCallback((g?: Grade) => {
    setFlipped(true);
    if (g) setSuggested(g);
  }, []);

  const grade = useCallback(
    async (g: Grade) => {
      if (!current || busy || !flipped) return;
      setBusy(true);
      const res = await gradeCard(current.id, g, Math.max(cardActive.current, 1000), new Date());
      setOverrides((m) => new Map(m).set(res.card.id, res.card));
      setPinned(null);
      setUndo(res.undo);
      setSession((s) => ({ ...s, reviewed: s.reviewed + 1, again: s.again + (g === 1 ? 1 : 0), frozen: s.frozen + (res.froze ? 1 : 0) }));
      setNow(new Date());
      setBusy(false);
    },
    [current, busy, flipped],
  );

  const doUndo = useCallback(async () => {
    if (!undo) return;
    await undoGrade(undo);
    setOverrides((m) => new Map(m).set(undo.cardBefore.id, { ...undo.cardBefore, updatedAt: new Date().toISOString() }));
    setPinned(undo.cardBefore.id);
    setSession((s) => ({ ...s, reviewed: Math.max(0, s.reviewed - 1), again: s.again - (undo.log.grade === 1 ? 1 : 0) }));
    setUndo(null);
    setNow(new Date());
  }, [undo]);

  // Keyboard: Space/Enter flip, 1–4 grade, U undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog[open]')) return;
      if ((e.key === ' ' || e.key === 'Enter') && !flipped) {
        e.preventDefault();
        reveal();
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        void grade(Number(e.key) as Grade);
      } else if (e.key.toLowerCase() === 'u') void doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, grade, reveal, doUndo]);

  // Empty queue after ≥ 5 active minutes also completes the minimum day.
  useEffect(() => {
    if (data.loaded && !current && session.reviewed > 0 && session.activeMs >= 300_000) void markEmptyQueueDay(studyDay(new Date()));
  }, [data.loaded, current, session.reviewed, session.activeMs]);

  const onPointerDown = (e: ReactPointerEvent) => {
    pointer.current = {
      x: e.clientX,
      y: e.clientY,
      t: Date.now(),
      long: false,
      timer: setTimeout(() => {
        if (pointer.current) {
          pointer.current.long = true;
          setSheetOpen(true);
        }
      }, 550),
    };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = pointer.current;
    if (p && (Math.abs(e.clientX - p.x) > 10 || Math.abs(e.clientY - p.y) > 10)) clearTimeout(p.timer);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.long) return;
    const dx = e.clientX - p.x;
    if (flipped && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - p.y)) void grade(dx < 0 ? 1 : 3);
    else if (!flipped && Math.abs(dx) < 10 && !(e.target as HTMLElement).closest('button, input, form')) reveal();
  };

  if (!data.loaded) return <SaltDotsLoader label="Opening your cards" />;

  const total = Math.max(startTotal ?? 0, session.reviewed + plan.queue.order.length);
  const done = total - plan.queue.order.length;
  const waitMs = plan.queue.nextLearningAt ? new Date(plan.queue.nextLearningAt).getTime() - now.getTime() : Infinity;

  // ---------- Finished ----------
  if (!current && (finished || waitMs > 15 * 60_000 || session.reviewed === 0)) {
    const stats = plan.stats;
    const dayTask = WEEKLY_PATTERN[almatyParts(new Date()).weekday];
    const saltDelta = startSalt === null ? 0 : salt - startSalt;
    return (
      <div className="grid gap-3">
        <header className="ff-header">
          <p className="eyebrow">English · Review</p>
          <h1 className="ff-title">{session.reviewed ? 'Session done' : 'Nothing due'}</h1>
          <FreezeFrontBar value={1} label="Today's session" size="band" valueText="Done" />
        </header>
        <GlassCard className="flex items-center gap-4">
          <Mascot mood="happy" size={64} bounce={session.frozen > 0} />
          <p className="m-0">
            {session.reviewed
              ? stats.activeSeconds >= 600
                ? 'Minimum day done. The ice is holding.'
                : `Done for now. ${Math.max(0, Math.ceil((600 - stats.activeSeconds) / 60))} more minutes of cards make the minimum day.`
              : data.notes.length
                ? 'No cards are due right now. Come back later, or add new words.'
                : 'No words yet. Add a seed pack or a word to start.'}
          </p>
        </GlassCard>
        {session.reviewed > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={session.reviewed} label="Reviewed" />
            <StatTile value={stats.retention === undefined ? '—' : `${Math.round(stats.retention * 100)}%`} label="Retention today" />
            <StatTile value={session.frozen} label="Newly frozen" />
            <StatTile value={saltDelta > 0 ? `+${saltDelta}` : saltDelta} label="Salt added / removed" />
          </div>
        )}
        <GlassCard size="md" className="grid gap-3">
          <p className="m-0">
            Today's skill block: <strong>{dayTask}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <PillButton variant="secondary" onClick={() => openQuickAdd({ text: `IELTS ${dayTask} #english` })}>
              Plan it
            </PillButton>
            <Link to="/english" className="pill pill--secondary">
              Back to English
            </Link>
            {!data.notes.length && (
              <Link to="/english/packs" className="pill">
                Add a seed pack
              </Link>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div>
      <div className="rv-top">
        <Link to="/english" className="icon-btn" aria-label="Close review">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <FreezeFrontBar value={total ? done / total : 0} label="Session progress" valueText={`${done} of ${total}`} />
        <span className="rv-count" aria-label={`${plan.queue.order.length} cards left`}>
          {plan.queue.order.length}
        </span>
        <span className="rv-timer" aria-label="Active time">
          {mmss(session.activeMs)}
        </span>
      </div>

      {!current ? (
        <GlassCard className="grid justify-items-center gap-3 text-center">
          <p className="m-0">Next learning card in {mmss(Math.max(0, waitMs))}.</p>
          <PillButton variant="secondary" onClick={() => setFinished(true)}>
            Finish now
          </PillButton>
        </GlassCard>
      ) : (
        note && (
          <>
            <GlassCard
              className="rv-card"
              role="button"
              tabIndex={0}
              aria-label={flipped ? 'Card answer. Grade it below.' : 'Card. Tap or press Space to show the answer.'}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (pointer.current = null)}
            >
              <span className="rv-kind">
                <Chip tone={current.state === 'new' ? 'violet' : current.isLeech ? 'warm' : 'ice'}>
                  {current.state === 'new' ? 'New' : TYPE_LABEL[current.type]}
                </Chip>
              </span>
              <CardFace key={current.id} card={current} note={note} flipped={flipped} onReveal={reveal} voiceURI={settings.voiceURI} />
            </GlassCard>

            {flipped ? (
              <div className="grades" role="group" aria-label="How well did you know it?">
                {GRADES.map(({ g, label, cls }) => (
                  <button key={g} type="button" className={`grade ${cls}`} aria-pressed={suggested === g} aria-keyshortcuts={String(g)} disabled={busy} onClick={() => void grade(g)}>
                    {label}
                    <small>{previews ? intervalLabel(previews.p[g], previews.at) : ''}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid">
                <PillButton onClick={() => reveal()}>Show answer</PillButton>
              </div>
            )}
            <p className="rv-hint mt-3 text-center">
              {flipped ? 'Swipe left = Again, right = Good · keys 1–4' : 'Tap or Space to flip · hold the card for word details'}
              {undo && (
                <>
                  {' · '}
                  <button type="button" className="seg-btn" onClick={() => void doUndo()}>
                    Undo last
                  </button>
                </>
              )}
            </p>
            <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Word">
              <WordDetails note={note} cards={merged.cardsByNote.get(note.id) ?? []} logs={merged.logs} compact />
            </Sheet>
          </>
        )
      )}
    </div>
  );
}
