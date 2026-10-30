import { useState } from 'react';
import { Link } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { addPack, SEED_PACKS } from '../data/seedPacks';
import { useEnglishData } from '../data/store';
import './english.css';

/** Seed packs (SPEC § 6.4). Adding a pack again only adds what is missing. */
export function PacksPage() {
  const data = useEnglishData();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Seed packs
        </p>
        <h1 className="ff-title">Seed packs</h1>
      </header>
      <div className="grid gap-3">
        {SEED_PACKS.map((p) => {
          const have = data.notes.filter((n) => n.packId === p.id).length;
          const complete = have >= p.notes.length;
          return (
            <GlassCard key={p.id} className="grid gap-3" aria-labelledby={`pack-${p.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`pack-${p.id}`} className="card-title m-0">
                  {p.title}
                </h2>
                <Chip tone={complete ? 'good' : 'plain'}>
                  {have} of {p.notes.length} added
                </Chip>
              </div>
              <p className="m-0">{p.description}</p>
              <p className="m-0 text-sm">Examples: {p.notes.slice(0, 5).map((n) => n.headword).join(' · ')}</p>
              <div>
                <PillButton
                  variant={complete ? 'secondary' : 'primary'}
                  disabled={busy !== null || complete}
                  onClick={() => {
                    setBusy(p.id);
                    void addPack(p).then(({ added }) => {
                      setBusy(null);
                      setMessage(`${p.title}: added ${added} word${added === 1 ? '' : 's'}. New words come in at up to 15 a day.`);
                    });
                  }}
                >
                  {complete ? 'Added' : busy === p.id ? 'Adding…' : have ? 'Add the missing ones' : 'Add pack'}
                </PillButton>
              </div>
            </GlassCard>
          );
        })}
        {message && (
          <p className="notice m-0" role="status">
            {message} <Link to="/english/review">Start reviewing</Link>
          </p>
        )}
        <GlassCard size="md">
          <p className="m-0 text-sm">
            Topic packs (16 IELTS topics) are made with Claude through the Bridge in Phase 3. The Academic Word List waits until its licence is confirmed.
          </p>
        </GlassCard>
      </div>
    </>
  );
}
