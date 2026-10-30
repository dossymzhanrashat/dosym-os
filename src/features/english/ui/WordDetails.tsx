import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { deleteNote, resetNote, setCardSuspended, setNoteSuspended, updateNote, useEnglishSettings } from '../data/store';
import type { ReviewLog, VocabCard, VocabNote } from '../model/types';
import { wordState } from '../srs/status';
import { SpeakButton, TYPE_LABEL } from './CardFace';
import { ForgettingCurve } from './ForgettingCurve';
import { splitTarget } from './answer';

const dueFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const STATE_CHIP: Record<ReturnType<typeof wordState>, { tone: 'plain' | 'ice' | 'violet' | 'warm' | 'good' | 'danger'; label: string }> = {
  new: { tone: 'plain', label: 'New' },
  learning: { tone: 'ice', label: 'Learning' },
  frozen: { tone: 'good', label: 'Frozen' },
  thawing: { tone: 'warm', label: 'Thawing' },
  salt: { tone: 'violet', label: 'Salt' },
  suspended: { tone: 'plain', label: 'Suspended' },
};

/** Word sheet (SPEC § 3.4): headword, audio, curve, meaning, examples, cards and actions. */
export function WordDetails({ note, cards, logs, compact = false }: { note: VocabNote; cards: VocabCard[]; logs: ReviewLog[]; compact?: boolean }) {
  const navigate = useNavigate();
  const settings = useEnglishSettings();
  const reviewed = cards.filter((c) => c.state !== 'new' && !c.deletedAt).sort((a, b) => a.stability - b.stability);
  const [chartCardId, setChartCardId] = useState<string | undefined>(reviewed[0]?.id);
  const chartCard = reviewed.find((c) => c.id === chartCardId) ?? reviewed[0];
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState({ definition: note.definition, glossKK: note.glossKK ?? '', glossRU: note.glossRU ?? '', mnemonic: note.mnemonic ?? '' });
  const now = new Date();
  const state = STATE_CHIP[wordState(note, cards, now)];

  return (
    <div className="grid gap-3">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="word-head">{note.headword}</h2>
          <SpeakButton text={note.headword} voiceURI={settings.voiceURI} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone={state.tone}>{state.label}</Chip>
          {note.pos && <Chip>{note.pos}</Chip>}
          {note.ipa && <Chip>{note.ipa}</Chip>}
          {note.cefr && <Chip>{note.cefr}</Chip>}
          {note.ieltsTopic && <Chip>{note.ieltsTopic}</Chip>}
          {note.isLeech && <Chip tone="violet">Leech</Chip>}
          {note.needsDetails && <Chip tone="warm">Needs details</Chip>}
        </div>
      </header>

      <GlassCard size="md" aria-labelledby="curve-h">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="curve-h" className="card-title m-0">
            Forgetting curve
          </h3>
          {reviewed.length > 1 && (
            <select className="input w-auto" value={chartCard?.id} onChange={(e) => setChartCardId(e.target.value)} aria-label="Card shown in the chart">
              {reviewed.map((c) => (
                <option key={c.id} value={c.id}>
                  {TYPE_LABEL[c.type]} · S {c.stability.toFixed(1)} d
                </option>
              ))}
            </select>
          )}
        </div>
        {chartCard ? <ForgettingCurve card={chartCard} logs={logs} /> : <p className="m-0 text-sm">No reviews yet — the curve starts after the first review.</p>}
      </GlassCard>

      <GlassCard size="md" className="grid gap-3" aria-label="Meaning">
        {editing ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void updateNote(note, {
                definition: draft.definition.trim(),
                glossKK: draft.glossKK.trim() || undefined,
                glossRU: draft.glossRU.trim() || undefined,
                mnemonic: draft.mnemonic.trim() || undefined,
                needsDetails: !draft.definition.trim() && note.kind !== 'spelling',
              }).then(() => setEditing(false));
            }}
          >
            {(['definition', 'glossKK', 'glossRU', 'mnemonic'] as const).map((f) => (
              <label key={f} className="field">
                <span className="field-label">{{ definition: 'Definition', glossKK: 'Kazakh', glossRU: 'Russian', mnemonic: 'Mnemonic (your own image or story)' }[f]}</span>
                <input className="input" value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} lang={f === 'glossKK' ? 'kk' : f === 'glossRU' ? 'ru' : undefined} />
              </label>
            ))}
            <div className="flex gap-2">
              <PillButton type="submit">Save</PillButton>
              <PillButton variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </PillButton>
            </div>
          </form>
        ) : (
          <dl className="kv">
            {note.definition && (
              <>
                <dt>Meaning</dt>
                <dd>{note.definition}</dd>
              </>
            )}
            {note.glossKK && (
              <>
                <dt>Kazakh</dt>
                <dd lang="kk">{note.glossKK}</dd>
              </>
            )}
            {note.glossRU && (
              <>
                <dt>Russian</dt>
                <dd lang="ru">{note.glossRU}</dd>
              </>
            )}
            {note.tip && (
              <>
                <dt>Tip</dt>
                <dd>{note.tip}</dd>
              </>
            )}
            {note.mnemonic && (
              <>
                <dt>Mnemonic</dt>
                <dd>{note.mnemonic}</dd>
              </>
            )}
            {note.collocations.length > 0 && (
              <>
                <dt>Collocations</dt>
                <dd>{note.collocations.join(', ')}</dd>
              </>
            )}
            {note.synonymLadder.length > 0 && (
              <>
                <dt>Ladder</dt>
                <dd>{note.synonymLadder.map((r) => r.word).join(' → ')}</dd>
              </>
            )}
            {note.examples.map((ex, i) => {
              const parts = splitTarget(ex.text, ex.target ?? note.headword);
              return (
                <div key={i} className="contents">
                  <dt>{i === 0 ? 'Examples' : ''}</dt>
                  <dd className="rv-example">
                    {parts ? (
                      <>
                        {parts[0]}
                        <mark>{parts[1]}</mark>
                        {parts[2]}
                      </>
                    ) : (
                      ex.text
                    )}
                    <span className="entry-meta">{ex.source.title ?? ex.source.kind}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </GlassCard>

      <GlassCard size="md" aria-labelledby="cards-h">
        <h3 id="cards-h" className="card-title">
          Cards
        </h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>State</th>
                <th>S (days)</th>
                <th>D (1–10)</th>
                <th>Next due</th>
                <th>
                  <span className="sr-only">Suspend</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td>{TYPE_LABEL[c.type]}</td>
                  <td>
                    {c.suspended ? 'suspended' : c.state}
                    {c.isLeech ? ' · leech' : ''}
                  </td>
                  <td>{c.state === 'new' ? '—' : c.stability.toFixed(1)}</td>
                  <td>{c.state === 'new' ? '—' : c.difficulty.toFixed(1)}</td>
                  <td>{c.state === 'new' ? 'new' : dueFmt.format(new Date(c.due))}</td>
                  <td>
                    <button type="button" className="seg-btn" onClick={() => void setCardSuspended(c, !c.suspended)}>
                      {c.suspended ? 'Resume' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {!compact && (
        <div className="flex flex-wrap gap-2">
          <PillButton variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </PillButton>
          <PillButton variant="secondary" onClick={() => void setNoteSuspended(note, note.status !== 'suspended')}>
            {note.status === 'suspended' ? 'Resume word' : 'Suspend word'}
          </PillButton>
          <PillButton variant="secondary" onClick={() => void resetNote(note)}>
            Reset progress
          </PillButton>
          <PillButton
            variant="secondary"
            onClick={() => (confirmDelete ? void deleteNote(note).then(() => navigate('/english/words')) : setConfirmDelete(true))}
          >
            {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </PillButton>
        </div>
      )}
    </div>
  );
}
