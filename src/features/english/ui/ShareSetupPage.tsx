import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { GlassCard, PillButton, StepBadge } from '../../../core/design/components';
import '../../../core/bridge/bridge.css';
import './english.css';

/*
 * How to send text to Dosym from other apps (WEB EDITION, replaces the iOS Share Extension):
 * an iOS Shortcut in the share sheet, a Mac bookmarklet, and (on Android / Chrome) the installed
 * app's own share target. All three open /inbox/add?text=….
 */

const ADD_URL = `${location.origin}${import.meta.env.BASE_URL}inbox/add`;

const BOOKMARKLET = `javascript:(()=>{const s=String(getSelection()).trim();if(!s){alert('Select some English text first, then click Add to Dosym.');return}window.open('${ADD_URL}?text='+encodeURIComponent(s.slice(0,6000))+'&title='+encodeURIComponent(document.title)+'&url='+encodeURIComponent(location.href),'_blank')})()`;

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="setup-steps">
      {steps.map((s, i) => (
        <li key={i}>
          <StepBadge n={i + 1} />
          <div>{s}</div>
        </li>
      ))}
    </ol>
  );
}

export function ShareSetupPage() {
  const link = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState('');

  // React blocks javascript: URLs in JSX, so the bookmarklet's href is set directly.
  useEffect(() => link.current?.setAttribute('href', BOOKMARKLET), []);

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied('');
    }
  };

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · <Link to="/english/import">Import</Link> · Sharing
        </p>
        <h1 className="ff-title">Share words to Dosym</h1>
        <p className="m-0">Select a sentence anywhere, share it, tap the words to keep. They go to your inbox.</p>
      </header>

      <div className="grid gap-3">
        <GlassCard className="grid gap-3" aria-labelledby="ios-h">
          <h2 id="ios-h" className="card-title m-0">
            iPhone: the “Add to Dosym” Shortcut
          </h2>
          <p className="m-0 text-sm">One-time setup, about 3 minutes, in Apple’s Shortcuts app.</p>
          <Steps
            steps={[
              <>
                Open the <strong>Shortcuts</strong> app and tap <strong>+</strong> (top right) to make a new shortcut.
              </>,
              <>
                Tap the name at the top → <strong>Rename</strong> → type <strong>Add to Dosym</strong>.
              </>,
              <>
                Tap the <strong>ⓘ</strong> (or the arrow next to the name → <strong>Details</strong>) and switch on <strong>Show in Share Sheet</strong>. Tap <strong>Done</strong>. A block “Receive <em>Any</em> input from <em>Share Sheet</em>” appears.
              </>,
              <>
                In that block, tap <strong>Any</strong> and leave only <strong>Text</strong>, <strong>Rich Text</strong>, <strong>URLs</strong> and <strong>Safari web pages</strong> on. Then tap <strong>Continue</strong> (where it says “If there’s no input”) and choose <strong>Get Clipboard</strong>.
              </>,
              <>
                Tap <strong>Search Actions</strong>, add <strong>URL Encode</strong>. It should read “URL Encode <em>Shortcut Input</em>” (tap the blue word and pick <em>Shortcut Input</em> if not).
              </>,
              <>
                Add the action <strong>Text</strong>. Tap <strong>Copy link start</strong> below, paste it into the Text box, then tap the end of it and insert the variable <strong>URL Encoded Text</strong> (it appears above the keyboard).
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <PillButton variant="secondary" onClick={() => void copy('start', `${ADD_URL}?text=`)}>
                    {copied === 'start' ? 'Copied ✓' : 'Copy link start'}
                  </PillButton>
                  <code className="setup-code">{ADD_URL}?text=</code>
                </div>
              </>,
              <>
                Add the action <strong>Open URLs</strong>. It should read “Open <em>Text</em>”. Tap <strong>Done</strong>.
              </>,
              <>
                Try it: in the Claude app, select a sentence in a reply (or long-press the reply) and tap <strong>Share…</strong>, then <strong>Add to Dosym</strong> in the share sheet (scroll down the list of actions if you don’t see it). In Safari: select text → <strong>Share</strong> → <strong>Add to Dosym</strong>. Safari opens this site with the text.
              </>,
            ]}
          />
          <p className="notice m-0 text-sm">
            The Shortcut opens Dosym in <strong>Safari</strong>, not in the Home Screen app (iPhone does not allow that). Sign in once in Safari too — then the words sync to the Home Screen app within a minute. Share a paragraph, not a whole chat: very long text can be cut off.
          </p>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="mac-h">
          <h2 id="mac-h" className="card-title m-0">
            Mac: the bookmarklet
          </h2>
          <Steps
            steps={[
              <>
                Show the bookmarks bar: in Safari <strong>View → Show Favorites Bar</strong> (⇧⌘B); in Chrome <strong>⇧⌘B</strong>.
              </>,
              <>
                Drag this button onto the bar:{' '}
                <a ref={link} className="pill pill--secondary setup-bookmarklet" onClick={(e) => e.preventDefault()} draggable>
                  Add to Dosym
                </a>
              </>,
              <>
                Use it: on claude.ai (in the browser, not the desktop app) or any page, select a sentence and click <strong>Add to Dosym</strong> in the bar. A new tab opens with the text.
              </>,
            ]}
          />
          <details className="bridge-details">
            <summary>Dragging doesn’t work? Make it by hand</summary>
            <div className="grid gap-2">
              <p className="m-0 text-sm">
                Bookmark any page (⌘D) into the bar, then right-click the bookmark → <strong>Edit Address</strong> (Safari) or <strong>Edit…</strong> (Chrome), and replace the address with this code:
              </p>
              <textarea className="input bridge-text" readOnly rows={4} value={BOOKMARKLET} aria-label="Bookmarklet code" />
              <PillButton variant="secondary" className="justify-self-start" onClick={() => void copy('code', BOOKMARKLET)}>
                {copied === 'code' ? 'Copied ✓' : 'Copy code'}
              </PillButton>
            </div>
          </details>
          <p className="m-0 text-sm">In the Claude desktop app, copy the text and use the paste box instead.</p>
        </GlassCard>

        <GlassCard size="md" className="grid gap-2">
          <h2 className="card-title m-0">Android or Chrome</h2>
          <p className="m-0">Install Dosym from Chrome’s menu (Add to Home screen); “Dosym OS” then appears in the share menu by itself.</p>
        </GlassCard>

        <div className="en-links">
          <Link to="/inbox/add" className="pill pill--secondary">
            Open the paste box
          </Link>
          <Link to="/english/inbox" className="pill pill--secondary">
            Inbox
          </Link>
        </div>
      </div>
    </>
  );
}
