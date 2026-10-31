import { useEffect, useMemo, useRef, useState } from 'react';
import { Chip, PillButton } from '../../../core/design/components';
import { collocationTip } from '../data/store';
import { saveUseItAnswer, useItPrompt } from '../data/useIt';
import { studyDay } from '../srs/studyDay';
import type { Grade, VocabCard, VocabNote } from '../model/types';
import { seededUnit } from '../srs/scheduler';
import { gradeTyped, letterDiff, splitTarget } from './answer';
import { speak } from './speech';

/*
 * Front and back of one card (SPEC § 7). Typed cards pre-select a grade by match quality;
 * the collocation card pre-selects Good for the right chip and Again for a wrong one.
 */

export const TYPE_LABEL: Record<VocabCard['type'], string> = {
  recognition: 'Recognise',
  production: 'Produce',
  cloze: 'Fill the gap',
  listening: 'Listen',
  spelling: 'Spell it',
  collocation: 'Collocation',
  synonymLadder: 'Climb the ladder',
  wordFamily: 'Word family',
  useIt: 'Use it',
  palace: 'Memory palace',
};

const SPEAKER = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);

export function SpeakButton({ text, rate, voiceURI, label = 'Play audio' }: { text: string; rate?: number; voiceURI?: string; label?: string }) {
  return (
    <button
      type="button"
      className="icon-btn rv-speak"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        speak(text, { rate, voiceURI });
      }}
    >
      {SPEAKER}
    </button>
  );
}

function Example({ note, blank = false }: { note: VocabNote; blank?: boolean }) {
  const ex = note.examples[0];
  if (!ex) return null;
  const parts = splitTarget(ex.text, ex.target ?? note.headword);
  if (!parts) return <p className="rv-example">{ex.text}</p>;
  return (
    <p className="rv-example">
      {parts[0]}
      {blank ? (
        <span className="rv-blank" aria-label="blank">
          {parts[1][0]}
          {'_'.repeat(Math.max(3, parts[1].length - 1))}
        </span>
      ) : (
        <mark>{parts[1]}</mark>
      )}
      {parts[2]}
    </p>
  );
}

function Glosses({ note }: { note: VocabNote }) {
  if (!note.glossKK && !note.glossRU) return null;
  return (
    <p className="rv-gloss">
      {note.glossKK && (
        <span>
          KZ <span lang="kk">{note.glossKK}</span>
        </span>
      )}
      {note.glossRU && (
        <span>
          RU <span lang="ru">{note.glossRU}</span>
        </span>
      )}
    </p>
  );
}

function Meaning({ note, voiceURI }: { note: VocabNote; voiceURI?: string }) {
  return (
    <>
      <p className="rv-head">{note.headword}</p>
      <div className="flex items-center justify-center gap-2">
        {note.pos && <Chip>{note.pos}</Chip>}
        <SpeakButton text={note.headword} voiceURI={voiceURI} />
      </div>
      {note.definition && <p className="rv-def">{note.definition}</p>}
      <Glosses note={note} />
      <Example note={note} />
      {note.tip && <p className="rv-hint">Tip: {note.tip}</p>}
    </>
  );
}

function TypedAnswer({ answer, onDone, label }: { answer: string; onDone: (typed: string, g: Grade) => void; label: string }) {
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <form
      className="flex gap-2"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        onDone(typed, gradeTyped(typed, answer));
      }}
    >
      <input
        ref={ref}
        className="input"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label={label}
        placeholder={label}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
      />
      <PillButton type="submit" variant="secondary">
        Check
      </PillButton>
    </form>
  );
}

const PREPS = ['to', 'for', 'with', 'of', 'on', 'in', 'at', 'about', 'from', 'by'];

interface Props {
  card: VocabCard;
  note: VocabNote;
  flipped: boolean;
  onReveal: (suggested?: Grade) => void;
  voiceURI?: string;
}

/** Content of the card; the review page draws the card box, flip and grading around it. */
export function CardFace({ card, note, flipped, onReveal, voiceURI }: Props) {
  const [typed, setTyped] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const colloc = collocationTip(note.tip);
  const chips = useMemo(() => {
    if (!colloc) return [];
    const others = PREPS.filter((p) => p !== colloc.prep).sort((a, b) => seededUnit(`${card.id}${a}`) - seededUnit(`${card.id}${b}`));
    return [colloc.prep, ...others.slice(0, 3)].sort((a, b) => seededUnit(`${card.id}:${a}`) - seededUnit(`${card.id}:${b}`));
  }, [card.id, colloc?.prep]);

  // Listening and spelling play the audio as the card appears.
  useEffect(() => {
    if (!flipped && (card.type === 'listening' || card.type === 'spelling')) speak(note.headword, { rate: card.type === 'spelling' ? 0.75 : 0.9, voiceURI });
  }, [card.id]);

  switch (card.type) {
    case 'recognition':
      return flipped ? (
        <Meaning note={note} voiceURI={voiceURI} />
      ) : (
        <>
          <p className="rv-head">{note.headword}</p>
          <div className="flex items-center justify-center gap-2">
            {note.pos && <Chip>{note.pos}</Chip>}
            <SpeakButton text={note.headword} voiceURI={voiceURI} />
          </div>
          <p className="rv-hint">What does it mean? Tap to check.</p>
        </>
      );

    case 'production':
      return flipped ? (
        <>
          {typed !== null && <p className="rv-sub">You typed: {typed || '—'}</p>}
          <Meaning note={note} voiceURI={voiceURI} />
        </>
      ) : (
        <>
          <p className="rv-def">{note.definition || '(no definition yet)'}</p>
          <Glosses note={note} />
          <p className="rv-hint">Say or type the English word.</p>
          <TypedAnswer
            answer={note.headword}
            label="Type the word (optional)"
            onDone={(t, g) => {
              setTyped(t);
              onReveal(t.trim() ? g : undefined);
            }}
          />
        </>
      );

    case 'cloze':
      return flipped ? (
        <>
          {typed !== null && <p className="rv-sub">You typed: {typed || '—'}</p>}
          <Example note={note} />
          <p className="rv-head" style={{ fontSize: '1.5rem' }}>
            {note.headword}
          </p>
          {note.definition && <p className="rv-def">{note.definition}</p>}
          <Glosses note={note} />
        </>
      ) : (
        <>
          <Example note={note} blank />
          <p className="rv-hint">Which word fits the gap?</p>
          <TypedAnswer
            answer={note.examples[0]?.target ?? note.headword}
            label="Type the missing word (optional)"
            onDone={(t, g) => {
              setTyped(t);
              onReveal(t.trim() ? g : undefined);
            }}
          />
        </>
      );

    case 'listening':
      return flipped ? (
        <Meaning note={note} voiceURI={voiceURI} />
      ) : (
        <>
          <SpeakButton text={note.headword} voiceURI={voiceURI} label="Play again" />
          <p className="rv-hint">Listen. How is it spelled, and what does it mean?</p>
        </>
      );

    case 'spelling':
      return flipped ? (
        <>
          {typed !== null && (
            <p className="rv-letters" aria-label={`You typed ${typed}`}>
              {letterDiff(typed, note.headword).map((l, i) => (
                <span key={i} className={l.ok ? '' : 'bad'}>
                  {l.ch}
                </span>
              ))}
            </p>
          )}
          <p className="rv-head">{note.headword}</p>
          <SpeakButton text={note.headword} rate={0.75} voiceURI={voiceURI} />
          {note.tip && <p className="rv-hint">Tip: {note.tip}</p>}
          {note.definition && <p className="rv-def">{note.definition}</p>}
        </>
      ) : (
        <>
          <SpeakButton text={note.headword} rate={0.75} voiceURI={voiceURI} label="Play the word" />
          <p className="rv-hint">Type what you hear.</p>
          <TypedAnswer
            answer={note.headword}
            label="Spelling"
            onDone={(t, g) => {
              setTyped(t);
              onReveal(g);
            }}
          />
        </>
      );

    case 'collocation':
      if (!colloc) return <Meaning note={note} voiceURI={voiceURI} />;
      return (
        <>
          <p className="rv-head">
            {colloc.base} <span className="rv-blank">{flipped ? colloc.prep : '___'}</span>
          </p>
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Choose the word that fits">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className="seg-btn"
                aria-pressed={picked === c}
                disabled={flipped}
                onClick={(e) => {
                  e.stopPropagation();
                  setPicked(c);
                  onReveal(c === colloc.prep ? 3 : 1);
                }}
              >
                {c}
                {flipped && c === colloc.prep ? ' ✓' : ''}
              </button>
            ))}
          </div>
          {flipped && (
            <>
              {picked && picked !== colloc.prep && (
                <p className="rv-sub">
                  “{colloc.base} {picked}” is not natural; we say “{colloc.base} {colloc.prep}”.
                </p>
              )}
              <Example note={note} />
            </>
          )}
        </>
      );

    case 'synonymLadder': {
      const basic = note.synonymLadder.filter((r) => r.band < 7);
      const high = note.synonymLadder.filter((r) => r.band >= 7);
      return (
        <>
          <p className="rv-head">{note.headword}</p>
          <p className="rv-sub">Basic: {basic.map((r) => r.word).join(', ')}</p>
          {flipped ? (
            <ol className="rv-ladder" aria-label="High-level options">
              {high.map((r) => (
                <li key={r.word} className="rv-rung rv-rung--high">
                  {r.word}
                </li>
              ))}
            </ol>
          ) : (
            <p className="rv-hint">Climb higher: say the high-level ones you remember ({high.length}).</p>
          )}
        </>
      );
    }

    case 'useIt':
      return <UseItFace card={card} note={note} flipped={flipped} onReveal={onReveal} voiceURI={voiceURI} />;

    default:
      return <Meaning note={note} voiceURI={voiceURI} />;
  }
}

/** Use it (SPEC § 7): write one sentence; it is saved for the weekly Claude feedback batch. */
function UseItFace({ card, note, flipped, onReveal, voiceURI }: Props) {
  const prompt = useMemo(() => useItPrompt(note, card.id, studyDay(new Date())), [note, card.id]);
  const [sentence, setSentence] = useState('');
  const [saved, setSaved] = useState(false);

  if (flipped)
    return (
      <>
        {saved ? <p className="rv-sub">You wrote: {sentence}</p> : <p className="rv-sub">No sentence this time.</p>}
        <Meaning note={note} voiceURI={voiceURI} />
        {saved && <p className="rv-hint">Saved for this week’s feedback from Claude. For now, grade yourself against the example.</p>}
      </>
    );

  return (
    <>
      <p className="rv-hint">Write one sentence using</p>
      <p className="rv-head">{note.headword}</p>
      <p className="rv-sub">{prompt}</p>
      <form
        className="grid gap-2"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!sentence.trim()) return onReveal();
          await saveUseItAnswer(card, note, prompt, sentence);
          setSaved(true);
          onReveal();
        }}
      >
        <textarea className="input" rows={3} value={sentence} onChange={(e) => setSentence(e.target.value)} aria-label={`Your sentence with ${note.headword}`} placeholder="Your sentence" autoCapitalize="sentences" />
        <PillButton type="submit" variant="secondary" className="justify-self-center">
          {sentence.trim() ? 'Save and check' : 'Show the answer'}
        </PillButton>
      </form>
    </>
  );
}
