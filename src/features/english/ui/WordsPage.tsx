import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BridgeSheet } from '../../../core/bridge/BridgeSheet';
import type { AnyBridgeJob } from '../../../core/bridge/bridge';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { enrichJob } from '../bridge/jobs';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { useEnglishData } from '../data/store';
import { wordState, type WordState } from '../srs/status';
import { STATE_CHIP, WordDetails } from './WordDetails';
import './english.css';

const FILTERS: { value: WordState | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'thawing', label: 'Thawing' },
  { value: 'salt', label: 'Salt' },
  { value: 'suspended', label: 'Suspended' },
];

/** All words, searchable and filterable by state. */
export function WordsPage() {
  const data = useEnglishData();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<WordState | 'all'>('all');
  const [job, setJob] = useState<AnyBridgeJob | null>(null);
  const bare = useMemo(() => data.notes.filter((n) => n.needsDetails), [data]);
  const now = useMemo(() => new Date(), [data]);
  const rows = useMemo(
    () =>
      data.notes
        .map((n) => ({ n, state: wordState(n, data.cardsByNote.get(n.id) ?? [], now) }))
        .filter(({ n, state }) => (filter === 'all' || state === filter) && `${n.headword} ${n.glossKK ?? ''} ${n.glossRU ?? ''} ${n.definition}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.n.headword.localeCompare(b.n.headword)),
    [data, q, filter, now],
  );

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Words
        </p>
        <h1 className="ff-title">Words</h1>
      </header>
      <div className="grid gap-3">
        {bare.length > 0 && (
          <GlassCard size="md" className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0">
              {bare.length} {bare.length === 1 ? 'word needs' : 'words need'} details.
            </p>
            <PillButton variant="secondary" onClick={() => setJob(enrichJob('notes', bare.slice(0, 40).map((n) => ({ id: n.id, headword: n.headword, context: n.examples[0]?.text }))))}>
              Fill details with Claude{bare.length > 40 ? ' (40)' : ''}
            </PillButton>
          </GlassCard>
        )}
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words, glosses, meanings" aria-label="Search words" />
        <div className="seg" role="radiogroup" aria-label="Filter by state">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} className="seg-btn" onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        {!data.loaded ? (
          <SaltDotsLoader label="Loading words" />
        ) : rows.length === 0 ? (
          <GlassCard size="md">
            <p className="m-0">
              {data.notes.length ? 'No words match.' : 'No words yet.'} <Link to="/english/packs">Add a seed pack</Link> or <Link to="/english/add">add a word</Link>.
            </p>
          </GlassCard>
        ) : (
          <ul className="entry-list">
            {rows.map(({ n, state }) => (
              <li key={n.id} className="entry-row mod-english">
                <Link to={`/english/word/${n.id}`}>
                  {n.headword}
                  <span className="entry-meta">{[n.glossKK, n.glossRU].filter(Boolean).join(' · ') || n.definition || '—'}</span>
                </Link>
                <Chip tone={STATE_CHIP[state].tone}>{STATE_CHIP[state].label}</Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
      <BridgeSheet job={job} onClose={() => setJob(null)} />
    </>
  );
}

/** One word's sheet as a page (/english/word/:id). */
export function WordPage() {
  const { id } = useParams();
  const data = useEnglishData();
  const note = id ? data.noteMap.get(id) : undefined;
  if (!data.loaded) return <SaltDotsLoader label="Opening word" />;
  if (!note)
    return (
      <GlassCard>
        <p className="m-0">
          This word was deleted or has not synced yet. <Link to="/english/words">All words</Link>
        </p>
      </GlassCard>
    );
  return (
    <>
      <p className="eyebrow mb-3">
        <Link to="/english">English</Link> · <Link to="/english/words">Words</Link>
      </p>
      <WordDetails note={note} cards={data.cardsByNote.get(note.id) ?? []} logs={data.logs.filter((l) => l.noteId === note.id)} />
    </>
  );
}
