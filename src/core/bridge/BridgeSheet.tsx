import { useEffect, useRef, useState } from 'react';
import { PillButton, StepBadge } from '../design/components';
import { Sheet } from '../design/Sheet';
import { checkAnswer, CLAUDE_NEW_CHAT, fixUpMessage, type BridgeJob, type CheckResult } from './bridge';
import './bridge.css';

/*
 * The Claude Bridge sheet: 01 Copy prompt → 02 Open Claude → 03 Paste answer → Check → Save.
 * The answer is checked with the job's zod schema; if anything is wrong nothing is saved and the
 * problems are listed, with a ready-made message to send back to Claude.
 */

async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older Safari or no permission: select the visible text and use the legacy copy command.
    if (!fallback) return false;
    fallback.hidden = false;
    fallback.select();
    return document.execCommand('copy');
  }
}

export function BridgeSheet<T>({ job, onClose, onSaved }: { job: BridgeJob<T> | null; onClose: () => void; onSaved?: (message: string) => void }) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<CheckResult<T> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [fixCopied, setFixCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // A new job starts clean.
  useEffect(() => {
    setCopied('no');
    setAnswer('');
    setResult(null);
    setSaved('');
    setFixCopied(false);
  }, [job?.id, job?.prompt]);

  if (!job) return null;

  const check = (text: string) => {
    setAnswer(text);
    setResult(text.trim() ? checkAnswer(job, text) : null);
    setFixCopied(false);
  };

  const pasteFromClipboard = async () => {
    try {
      check(await navigator.clipboard.readText());
    } catch {
      setResult({ ok: false, problems: ['The browser did not allow reading the clipboard. Tap the box below and paste (long-press → Paste, or ⌘V).'] });
    }
  };

  const save = async () => {
    if (!result?.ok) return;
    setSaving(true);
    try {
      const msg = await job.save(result.data);
      setSaved(msg);
      onSaved?.(msg);
    } catch (e) {
      setResult({ ok: false, problems: [`Saving failed: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.`] });
    }
    setSaving(false);
  };

  const words = job.prompt.split(/\s+/).length;
  const canRead = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  return (
    <Sheet open onClose={onClose} title={job.title}>
      <div className="grid gap-4">
        <p className="m-0">{job.intro}</p>

        <ol className="bridge-steps">
          <li className="bridge-step">
            <StepBadge n={1} />
            <div className="grid gap-2">
              <p className="bridge-step-title">Copy the prompt</p>
              <div className="flex flex-wrap items-center gap-2">
                <PillButton
                  variant={copied === 'yes' ? 'secondary' : 'primary'}
                  onClick={async () => setCopied((await copyText(job.prompt, promptRef.current)) ? 'yes' : 'failed')}
                >
                  {copied === 'yes' ? 'Copied ✓' : 'Copy prompt'}
                </PillButton>
                <span className="text-sm">About {words.toLocaleString('en-GB')} words</span>
              </div>
              {copied === 'failed' && <p className="m-0 text-sm">Copy did not work here: select all the text in the box below and copy it.</p>}
              <details className="bridge-details">
                <summary>Show the prompt</summary>
                <textarea ref={promptRef} className="input bridge-text" readOnly value={job.prompt} rows={8} aria-label="Prompt for Claude" />
              </details>
            </div>
          </li>

          <li className="bridge-step">
            <StepBadge n={2} />
            <div className="grid gap-2">
              <p className="bridge-step-title">Open Claude and send it</p>
              <a className="pill pill--secondary justify-self-start" href={CLAUDE_NEW_CHAT} target="_blank" rel="noopener noreferrer">
                Open Claude
              </a>
              <p className="m-0 text-sm">Paste the prompt into the new chat and send it. When Claude finishes, tap the Copy button under its reply.</p>
            </div>
          </li>

          <li className="bridge-step">
            <StepBadge n={3} />
            <div className="grid gap-2">
              <p className="bridge-step-title">Paste Claude’s answer</p>
              {canRead && (
                <PillButton variant="secondary" className="justify-self-start" onClick={() => void pasteFromClipboard()}>
                  Paste answer
                </PillButton>
              )}
              <textarea
                className="input bridge-text"
                rows={5}
                value={answer}
                onChange={(e) => check(e.target.value)}
                placeholder='{"items": [ … ] }'
                aria-label="Claude’s answer"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
          </li>
        </ol>

        {result && !result.ok && (
          <div className="notice notice--danger grid gap-2" role="alert">
            <p className="m-0">
              <strong>Nothing was saved.</strong> The answer does not match what this job needs:
            </p>
            <ul className="bridge-problems">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <PillButton
              variant="secondary"
              className="justify-self-start"
              onClick={async () => setFixCopied(await copyText(fixUpMessage(result.problems), null))}
            >
              {fixCopied ? 'Copied ✓ — paste it to Claude' : 'Copy a fix-up message for Claude'}
            </PillButton>
          </div>
        )}

        {result?.ok && !saved && (
          <div className="notice grid gap-3" role="status">
            <p className="m-0">
              <strong>Looks right:</strong> {result.summary}.
            </p>
            <PillButton className="justify-self-start" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </PillButton>
          </div>
        )}

        {saved && (
          <div className="notice notice--good grid gap-3" role="status">
            <p className="m-0">
              <strong>Saved.</strong> {saved}
            </p>
            <PillButton variant="secondary" className="justify-self-start" onClick={onClose}>
              Done
            </PillButton>
          </div>
        )}
      </div>
    </Sheet>
  );
}
