import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { GlassCard, PillButton } from '../../../core/design/components';
import { useSyncStatus } from '../../../core/db/sync';
import { CaptureText } from './CaptureText';
import './english.css';

/*
 * /inbox/add?text=…&title=…&url=… — where the iOS Shortcut "Add to Dosym", the Mac bookmarklet
 * and the Android/Chrome share target land (WEB EDITION, replaces the Share Extension).
 * Opened with no text, it is a paste box.
 */

export function ShareAddPage() {
  const [params] = useSearchParams();
  const [text, setText] = useState(params.get('text') ?? '');
  const [draft, setDraft] = useState('');
  const sync = useSyncStatus();

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Add to Dosym
        </p>
        <h1 className="ff-title">Add to Dosym</h1>
        {params.get('title') && <p className="m-0">From “{params.get('title')}”</p>}
      </header>

      <div className="grid gap-3">
        {sync.state === 'signed-out' && (
          <p className="notice notice--warm m-0">
            You are not signed in in this browser, so words saved here stay in this browser only. <Link to="/settings">Sign in</Link> to send them to your other devices.
          </p>
        )}

        {text ? (
          <>
            <CaptureText text={text} title={params.get('title') ?? undefined} url={params.get('url') ?? undefined} kind="share" />
            <PillButton variant="secondary" className="justify-self-start" onClick={() => setText('')}>
              Use different text
            </PillButton>
          </>
        ) : (
          <GlassCard className="grid gap-3">
            {params.get('url') && <p className="m-0">Only a link arrived. Select the sentences first, then share — or paste the text here.</p>}
            <label className="field">
              <span className="field-label">Paste English text</span>
              <textarea className="input" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A paragraph from a Claude chat, an article or a book" />
            </label>
            <div className="flex flex-wrap gap-2">
              <PillButton disabled={!draft.trim()} onClick={() => setText(draft)}>
                Find words
              </PillButton>
              <Link to="/english/share-setup" className="pill pill--secondary">
                Set up sharing
              </Link>
            </div>
          </GlassCard>
        )}
      </div>
    </>
  );
}
