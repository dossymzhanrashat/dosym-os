import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import { BridgeSheet } from '../../../core/bridge/BridgeSheet';
import type { AnyBridgeJob } from '../../../core/bridge/bridge';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { Mascot } from '../../../core/design/Mascot';
import { enrichJob } from '../bridge/jobs';
import { decide, inboxOrder, needsDetails, undoDecision, type TriageUndo } from '../data/capture';
import { todayPlan, useEnglishData, useEnglishSettings } from '../data/store';
import type { Candidate, CandidateDecision, CandidateItem } from '../model/types';
import { studyDay } from '../srs/studyDay';
import { splitTarget } from './answer';
import { useCandidates } from './captureHooks';
import './english.css';

/*
 * Triage (SPEC § 3.3): one candidate at a time. Swipe right = Keep, left = Skip (never suggested
 * again), up = Already know (one check in 30 days), down = Later. The four buttons and the arrow
 * keys do the same, for screen readers and keyboards. Tap the gloss to edit it before keeping.
 */

const SWIPE_PX = 80;
const DETAILS_BATCH = 40;
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' });

const ACTIONS: { d: CandidateDecision; label: string; key: string; hint: string }[] = [
  { d: 'skip', label: 'Skip', key: 'ArrowLeft', hint: '←' },
  { d: 'later', label: 'Later', key: 'ArrowDown', hint: '↓' },
  { d: 'known', label: 'Already know', key: 'ArrowUp', hint: '↑' },
  { d: 'keep', label: 'Keep', key: 'ArrowRight', hint: '→' },
];
const DONE_TEXT: Record<CandidateDecision, string> = { keep: 'Kept', skip: 'Skipped', known: 'Marked as known', later: 'Moved to the back' };

export function sourceLabel(c: Candidate): string {
  const s = c.source;
  const kind = { claudeExport: 'Claude chat', share: 'Shared', ocr: 'Photo scan', manual: 'Added by hand', seed: 'Pack', errorLog: 'Error log' }[s.kind];
  const parts = [kind];
  if (s.title && s.title !== kind) parts.push(`“${s.title}”`);
  if (s.date) parts.push(shortDate.format(new Date(s.date)));
  return parts.join(' · ');
}

function Example({ item }: { item: CandidateItem }) {
  if (!item.exampleText) return null;
  const parts = item.exampleTarget ? splitTarget(item.exampleText, item.exampleTarget) : null;
  return (
    <p className="rv-example">
      {parts ? (
        <>
          {parts[0]}
          <mark>{parts[1]}</mark>
          {parts[2]}
        </>
      ) : (
        item.exampleText
      )}
      {item.exampleGenerated && <span className="tri-generated"> · sentence written by Claude</span>}
    </p>
  );
}

export function InboxPage() {
  const candidates = useCandidates();
  const data = useEnglishData();
  const settings = useEnglishSettings();
  const [undo, setUndo] = useState<TriageUndo | null>(null);
  const [last, setLast] = useState('');
  const [editing, setEditing] = useState<CandidateItem | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<AnyBridgeJob | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const stack = useMemo(() => inboxOrder(candidates), [candidates]);
  const current = stack[0];
  const bare = useMemo(() => stack.filter(needsDetails), [stack]);
  const today = studyDay(new Date());
  const keptToday = candidates.filter((c) => c.decision === 'keep' && c.decidedAt && studyDay(new Date(c.decidedAt)) === today).length;
  const cap = useMemo(() => todayPlan(data, settings).cap, [data, settings]);

  useEffect(() => setEditing(null), [current?.id]);

  const act = useCallback(
    async (d: CandidateDecision) => {
      if (!current || busy) return;
      setBusy(true);
      setUndo(await decide(current, d, editing ?? undefined));
      setLast(`${DONE_TEXT[d]}: ${(editing ?? current.item).headword}`);
      setDrag({ x: 0, y: 0 });
      setBusy(false);
    },
    [current, busy, editing],
  );

  const doUndo = async () => {
    if (!undo) return;
    await undoDecision(undo);
    setUndo(null);
    setLast('');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog[open]')) return;
      const a = ACTIONS.find((x) => x.key === e.key);
      if (a) {
        e.preventDefault();
        void act(a.d);
      } else if (e.key.toLowerCase() === 'u') void doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
    start.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (start.current) setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    const { x, y } = drag;
    if (Math.abs(x) > SWIPE_PX && Math.abs(x) > Math.abs(y)) void act(x > 0 ? 'keep' : 'skip');
    else if (Math.abs(y) > SWIPE_PX) void act(y < 0 ? 'known' : 'later');
    else setDrag({ x: 0, y: 0 });
  };
  const leaning: CandidateDecision | null = Math.abs(drag.x) > 30 && Math.abs(drag.x) > Math.abs(drag.y) ? (drag.x > 0 ? 'keep' : 'skip') : Math.abs(drag.y) > 30 ? (drag.y < 0 ? 'known' : 'later') : null;

  const fillDetails = () =>
    setJob(
      enrichJob(
        'candidates',
        bare.slice(0, DETAILS_BATCH).map((c) => ({ id: c.id, headword: c.item.headword, context: c.item.exampleText })),
      ),
    );

  if (!data.loaded) return <SaltDotsLoader label="Opening the inbox" />;
  const item = editing ?? current?.item;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Inbox
        </p>
        <h1 className="ff-title">Word inbox</h1>
        <p className="m-0" aria-live="polite">
          {stack.length} to triage · Kept {keptToday} · today’s new cap {cap}
        </p>
      </header>

      <div className="grid gap-3">
        {bare.length > 0 && (
          <GlassCard size="md" className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0">
              {bare.length} {bare.length === 1 ? 'word has' : 'words have'} no definition yet.
            </p>
            <PillButton variant="secondary" onClick={fillDetails}>
              Fill details with Claude{bare.length > DETAILS_BATCH ? ` (${DETAILS_BATCH})` : ''}
            </PillButton>
          </GlassCard>
        )}

        {!current || !item ? (
          <GlassCard className="grid gap-4">
            <div className="flex items-center gap-4">
              <Mascot mood="happy" size={56} />
              <p className="m-0">
                <strong>Inbox clear.</strong> Bring in more words when you are ready.
              </p>
            </div>
            <div className="en-links">
              <Link to="/english/import" className="pill">
                Import Claude chats
              </Link>
              <Link to="/english/packs" className="pill pill--secondary">
                Add a seed pack
              </Link>
              <Link to="/english/add" className="pill pill--secondary">
                Add a word
              </Link>
            </div>
          </GlassCard>
        ) : (
          <>
            <GlassCard
              className={`tri-card ${leaning ? `tri-card--${leaning}` : ''}`}
              style={{ transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 30}deg)` }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => {
                start.current = null;
                setDrag({ x: 0, y: 0 });
              }}
              aria-label={`Candidate: ${item.headword}`}
              aria-roledescription="swipe card"
            >
              {leaning && <span className="tri-lean">{ACTIONS.find((a) => a.d === leaning)!.label}</span>}
              <p className="rv-head">{item.headword}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {item.cefr && <Chip tone="ice">{item.cefr}</Chip>}
                {item.ieltsTopic && <Chip>{item.ieltsTopic}</Chip>}
                {item.pos && <Chip>{item.pos}</Chip>}
                {item.kind !== 'word' && <Chip tone="violet">{item.kind}</Chip>}
              </div>

              {editing ? (
                <div className="grid gap-2 text-left">
                  {(['headword', 'definition', 'glossKK', 'glossRU'] as const).map((f) => (
                    <label key={f} className="field">
                      <span className="field-label">{{ headword: 'Word or collocation', definition: 'Definition', glossKK: 'Kazakh', glossRU: 'Russian' }[f]}</span>
                      <input className="input" value={editing[f] ?? ''} lang={f === 'glossKK' ? 'kk' : f === 'glossRU' ? 'ru' : undefined} onChange={(e) => setEditing({ ...editing, [f]: e.target.value })} />
                    </label>
                  ))}
                  <PillButton variant="secondary" className="justify-self-start" onClick={() => setEditing(null)}>
                    Cancel edits
                  </PillButton>
                </div>
              ) : (
                <>
                  {item.definition ? <p className="rv-def">{item.definition}</p> : <p className="rv-hint">No definition yet — keep it and fill it later, or use “Fill details with Claude”.</p>}
                  <button type="button" className="tri-gloss" onClick={() => setEditing({ ...item })} aria-label="Edit the word, definition and glosses">
                    <span>
                      KZ <span lang="kk">{item.glossKK || '—'}</span>
                    </span>
                    <span>
                      RU <span lang="ru">{item.glossRU || '—'}</span>
                    </span>
                    <span className="tri-edit">Edit</span>
                  </button>
                </>
              )}
              <Example item={item} />
              <p className="rv-hint">{sourceLabel(current)}</p>
            </GlassCard>

            <div className="tri-actions" role="group" aria-label="Decide">
              {ACTIONS.map((a) => (
                <PillButton key={a.d} variant={a.d === 'keep' ? 'primary' : 'secondary'} disabled={busy} onClick={() => void act(a.d)} aria-keyshortcuts={a.key}>
                  <span aria-hidden="true">{a.hint}</span> {a.label}
                </PillButton>
              ))}
            </div>
            <p className="m-0 text-sm">Swipe: right keep · left skip (never again) · up already know (check in 30 days) · down later. Keys: arrows, U to undo.</p>
          </>
        )}

        {last && (
          <p className="notice m-0 flex flex-wrap items-center justify-between gap-2" role="status">
            <span>{last}</span>
            {undo && (
              <PillButton variant="secondary" onClick={() => void doUndo()}>
                Undo
              </PillButton>
            )}
          </p>
        )}
        {keptToday > cap && <p className="m-0 text-sm">You kept more than today’s cap: the extra words wait in the New queue and are not lost.</p>}

        <nav className="en-links" aria-label="Inbox pages">
          <Link to="/english/import" className="pill pill--secondary">
            Import more
          </Link>
          <Link to="/english/words" className="pill pill--secondary">
            My words
          </Link>
        </nav>
      </div>
      <BridgeSheet job={job} onClose={() => setJob(null)} />
    </>
  );
}
