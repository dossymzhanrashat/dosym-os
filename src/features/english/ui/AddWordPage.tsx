import { useState } from 'react';
import { Link } from 'react-router';
import { GlassCard, PillButton } from '../../../core/design/components';
import { addNote, cardTypesFor } from '../data/store';
import type { NoteKind } from '../model/types';
import { TYPE_LABEL } from './CardFace';
import './english.css';

/*
 * Manual add (SPEC § 6.3). Without the Claude Bridge (Phase 3) the user fills the fields; a word
 * saved without a definition is marked "Needs details" so the Bridge can enrich it later.
 */

const POS = ['n', 'v', 'adj', 'adv', 'phrase'];
const EMPTY = { headword: '', pos: '', definition: '', glossKK: '', glossRU: '', example: '', target: '', tip: '', spelling: false };

export function AddWordPage() {
  const [f, setF] = useState(EMPTY);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof EMPTY>) => setF({ ...f, ...patch });

  const save = async () => {
    const headword = f.headword.trim();
    if (!headword) return;
    setBusy(true);
    const kind: NoteKind = f.spelling ? 'spelling' : headword.includes(' ') ? 'collocation' : 'word';
    const source = { kind: 'manual' as const, date: new Date().toISOString() };
    const example = f.example.trim();
    const { note, created } = await addNote({
      kind,
      headword,
      lemma: headword.toLowerCase(),
      pos: f.pos || undefined,
      definition: f.definition.trim(),
      glossKK: f.glossKK.trim() || undefined,
      glossRU: f.glossRU.trim() || undefined,
      examples: example ? [{ text: example, target: f.target.trim() || headword, source }] : [],
      tip: f.tip.trim() || undefined,
      source,
      needsDetails: !f.definition.trim() && kind !== 'spelling',
    });
    setBusy(false);
    setMessage(
      created
        ? `Added “${note.headword}” with ${cardTypesFor(note).map((t) => TYPE_LABEL[t].toLowerCase()).join(', ')} cards.`
        : `“${note.headword}” is already in your words — the new example was merged in.`,
    );
    setF(EMPTY);
  };

  const field = (key: keyof typeof EMPTY, label: string, extra: Record<string, unknown> = {}) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" value={f[key] as string} onChange={(e) => set({ [key]: e.target.value })} {...extra} />
    </label>
  );

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Add a word
        </p>
        <h1 className="ff-title">Add a word</h1>
      </header>
      <GlassCard>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {field('headword', 'Word or collocation', { required: true, autoCapitalize: 'off', placeholder: 'pose a threat to' })}
          <div className="field">
            <span className="field-label">Part of speech</span>
            <div className="seg" role="radiogroup" aria-label="Part of speech">
              {POS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={f.pos === p} className="seg-btn" onClick={() => set({ pos: f.pos === p ? '' : p })}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {field('definition', 'Definition (simple English)')}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('glossKK', 'Kazakh', { lang: 'kk' })}
            {field('glossRU', 'Russian', { lang: 'ru' })}
          </div>
          {field('example', 'Example sentence (where you met it)')}
          {f.example && field('target', 'Exact words to blank in the gap card (if not the same as above)')}
          {field('tip', 'Tip (e.g. “Collocation: susceptible TO.” or “Spelling: …”)')}
          <label className="flex items-center gap-3">
            <input type="checkbox" className="check" checked={f.spelling} onChange={(e) => set({ spelling: e.target.checked })} />
            <span>Spelling word only (dictation card)</span>
          </label>
          <p className="m-0 text-sm">No definition yet? Save it anyway — it is marked “Needs details”, and Claude can fill it in through the Bridge (Phase 3).</p>
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit" disabled={busy || !f.headword.trim()}>
              Add word
            </PillButton>
            <Link to="/english/words" className="pill pill--secondary">
              My words
            </Link>
          </div>
          {message && (
            <p className="notice m-0" role="status">
              {message}
            </p>
          )}
        </form>
      </GlassCard>
    </>
  );
}
