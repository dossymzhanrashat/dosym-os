import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BridgeSheet } from '../../../core/bridge/BridgeSheet';
import type { AnyBridgeJob } from '../../../core/bridge/bridge';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { FreezeFrontBar } from '../../../core/design/FreezeFront';
import { chatSearchJob, topicPackJob } from '../bridge/jobs';
import { IELTS_TOPICS } from '../bridge/schemas';
import type { WorkerIn, WorkerOut } from '../capture/importWorker';
import type { Pick, PickResult } from '../capture/picker';
import { addCandidates, loadExportState, logImport, markProcessed, seenKeys } from '../data/capture';
import { splitTarget } from './answer';
import { useImportHistory } from './captureHooks';
import './english.css';

/*
 * Import Center (SPEC § 3.5). Rows: Claude chats (the Bridge asks Claude Pro to search past chats),
 * Claude data export (conversations.json read and filtered in this browser, candidates picked
 * here), sharing from iPhone/Mac, photo scan, topic packs, manual add and seed packs; plus history.
 */

const SHOW = 120;
const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });

function ExportImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [includeMine, setIncludeMine] = useState(false);
  const [rescan, setRescan] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [structure, setStructure] = useState('');
  const [result, setResult] = useState<PickResult | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(SHOW);
  const [message, setMessage] = useState('');
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const run = async (file?: File) => {
    if (!file) return;
    worker.current?.terminate();
    setError('');
    setStructure('');
    setResult(null);
    setMessage('');
    setStep('Starting…');
    const [{ lemmas }, state] = await Promise.all([seenKeys(), loadExportState()]);
    const w = new Worker(new URL('../capture/importWorker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'progress') return setStep(m.step);
      setStep('');
      w.terminate();
      if (m.type === 'error') setError(m.message);
      else if (m.type === 'unknownFormat') setStructure(m.structure);
      else {
        setResult(m.result);
        setChosen(new Set(m.result.picks.slice(0, 30).map((p) => p.lemma)));
        setShown(SHOW);
      }
    };
    w.onerror = (e) => {
      setStep('');
      setError(e.message || 'The import stopped unexpectedly.');
    };
    w.postMessage({ file, options: { includeMine, processed: state.processed, knownLemmas: [...lemmas], rescanAll: rescan } } satisfies WorkerIn);
  };

  const send = async () => {
    if (!result) return;
    const picks = result.picks.filter((p) => chosen.has(p.lemma));
    const res = await addCandidates(
      picks.map((p) => {
        const ex = p.examples[0];
        return {
          item: {
            headword: p.lemma,
            kind: 'word' as const,
            exampleText: ex.text,
            exampleTarget: ex.target,
            // "amplifies" in one chat and "amplified" in another: one note, both sentences as examples.
            moreExamples: p.examples.slice(1).map((e) => ({ text: e.text, target: e.target, title: e.title, conversationId: e.conversationId, date: e.date })),
            family: [],
            collocations: [],
            synonymLadder: [],
            usefulness: p.score,
          },
          source: { kind: 'claudeExport' as const, title: ex.title || 'Claude chat', conversationId: ex.conversationId, date: ex.date },
        };
      }),
    );
    await markProcessed(result.processed);
    await logImport({ kind: 'claudeExport', label: `Claude export · ${result.stats.newConversations} chats`, added: res.added, duplicates: res.duplicates });
    setResult(null);
    setMessage(`${res.added} words sent to your inbox${res.duplicates ? ` (${res.duplicates} you already had)` : ''}. In the inbox, tap “Fill details with Claude” to add definitions and glosses.`);
  };

  const toggle = (p: Pick) =>
    setChosen((s) => {
      const n = new Set(s);
      if (n.has(p.lemma)) n.delete(p.lemma);
      else n.add(p.lemma);
      return n;
    });

  return (
    <GlassCard className="grid gap-3" aria-labelledby="export-h">
      <h2 id="export-h" className="card-title m-0">
        Claude data export
      </h2>
      <p className="m-0">
        Claude can email you a copy of your data: open claude.ai → <strong>Settings</strong> → <strong>Privacy</strong> → <strong>Export data</strong>. You get a link to a .zip. Open that .zip (or the conversations.json inside it) here.
      </p>
      <p className="m-0 text-sm">The file is read only in this browser. Nothing from it is uploaded: only the words you choose go to your inbox, with one example sentence each.</p>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="check" checked={includeMine} onChange={(e) => setIncludeMine(e.target.checked)} />
        <span>Include my own messages (they show my mistakes too)</span>
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="check" checked={rescan} onChange={(e) => setRescan(e.target.checked)} />
        <span>Read all chats again (normally only new or changed chats are read)</span>
      </label>
      <div>
        <PillButton disabled={!!step} onClick={() => fileRef.current?.click()}>
          Choose export (.zip or .json)
        </PillButton>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          hidden
          onChange={(e) => {
            void run(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {step && <FreezeFrontBar value={0.5} label="Import" valueText={step} />}
      {step && <p className="m-0 text-sm">{step}</p>}
      {error && (
        <p className="notice notice--danger m-0" role="alert">
          {error}
        </p>
      )}
      {structure && (
        <div className="notice notice--warm grid gap-2" role="alert">
          <p className="m-0">
            <strong>This export format is new to me.</strong> Nothing was imported. Below is its structure — key names only, none of your text. Send it to Claude Code so the importer can learn the new format.
          </p>
          <pre className="imp-structure">{structure}</pre>
          <PillButton variant="secondary" className="justify-self-start" onClick={() => void navigator.clipboard?.writeText(structure)}>
            Copy structure
          </PillButton>
        </div>
      )}
      {message && (
        <p className="notice m-0" role="status">
          {message} <Link to="/english/inbox">Open the inbox</Link>
        </p>
      )}

      {result && (
        <div className="grid gap-3">
          <p className="m-0" role="status">
            {result.stats.conversations.toLocaleString('en-GB')} conversations ({result.stats.newConversations.toLocaleString('en-GB')} new or changed) → {result.stats.sentences.toLocaleString('en-GB')} English sentences →{' '}
            {result.stats.sentencesWithNew.toLocaleString('en-GB')} with possible new words → <strong>{result.picks.length.toLocaleString('en-GB')} candidates</strong>.
          </p>
          {result.picks.length === 0 ? (
            <p className="m-0">0 new — everything here is already in your words or inbox.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <PillButton variant="secondary" onClick={() => setChosen(new Set(result.picks.slice(0, 30).map((p) => p.lemma)))}>
                  Top 30
                </PillButton>
                <PillButton variant="secondary" onClick={() => setChosen(new Set())}>
                  None
                </PillButton>
                <PillButton disabled={!chosen.size} onClick={() => void send()}>
                  Send {chosen.size} to inbox
                </PillButton>
              </div>
              <ul className="imp-picks">
                {result.picks.slice(0, shown).map((p) => {
                  const ex = p.examples[0];
                  const parts = splitTarget(ex.text, ex.target);
                  return (
                    <li key={p.lemma}>
                      <label className="imp-pick">
                        <input type="checkbox" className="check" checked={chosen.has(p.lemma)} onChange={() => toggle(p)} />
                        <span className="grid gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="imp-lemma">{p.lemma}</strong>
                            {p.academic && <Chip tone="violet">academic</Chip>}
                            <Chip>
                              ×{p.count} · {p.chats} {p.chats === 1 ? 'chat' : 'chats'}
                            </Chip>
                          </span>
                          <span className="text-sm">
                            {parts ? (
                              <>
                                {parts[0]}
                                <mark>{parts[1]}</mark>
                                {parts[2]}
                              </>
                            ) : (
                              ex.text
                            )}
                            {ex.title && <span className="imp-title"> · {ex.title}</span>}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {result.picks.length > shown && (
                <PillButton variant="secondary" className="justify-self-start" onClick={() => setShown(shown + SHOW)}>
                  Show more ({result.picks.length - shown} left)
                </PillButton>
              )}
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}

export function ImportPage() {
  const history = useImportHistory();
  const [job, setJob] = useState<AnyBridgeJob | null>(null);
  const [maxItems, setMaxItems] = useState(40);
  const [range, setRange] = useState<'all' | 'since'>('all');
  const [topic, setTopic] = useState<string>(IELTS_TOPICS[0]);
  const lastChats = useMemo(() => history.find((h) => h.kind === 'claudeChats'), [history]);

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Import
        </p>
        <h1 className="ff-title">Import words</h1>
        <p className="m-0">There is no way for a website to read your Claude chats directly, so there are two honest routes: ask Claude Pro to search them, or open Claude’s data export here.</p>
      </header>

      <div className="grid gap-3">
        <GlassCard className="grid gap-3" aria-labelledby="chats-h">
          <h2 id="chats-h" className="card-title m-0">
            From my Claude chats
          </h2>
          <p className="m-0">Claude Pro searches your past chats for English words and collocations useful for IELTS, and answers in a format this site checks before saving.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <span className="field-label">How many</span>
              <div className="seg" role="radiogroup" aria-label="How many words">
                {[20, 40].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={maxItems === n} className="seg-btn" onClick={() => setMaxItems(n)}>
                    Up to {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">Which chats</span>
              <div className="seg" role="radiogroup" aria-label="Which chats">
                <button type="button" role="radio" aria-checked={range === 'all'} className="seg-btn" onClick={() => setRange('all')}>
                  All
                </button>
                <button type="button" role="radio" aria-checked={range === 'since'} disabled={!lastChats} className="seg-btn" onClick={() => setRange('since')}>
                  Since {lastChats ? when.format(new Date(lastChats.at)).split(',')[0] : 'last time'}
                </button>
              </div>
            </div>
          </div>
          <PillButton className="justify-self-start" onClick={async () => setJob(await chatSearchJob({ maxItems, since: range === 'since' ? lastChats?.at : undefined }))}>
            Ask Claude
          </PillButton>
        </GlassCard>

        <ExportImport />

        <GlassCard className="grid gap-3" aria-labelledby="more-h">
          <h2 id="more-h" className="card-title m-0">
            More ways in
          </h2>
          <div className="en-links">
            <Link to="/english/share-setup" className="pill pill--secondary">
              Share from iPhone / Mac
            </Link>
            <Link to="/inbox/add" className="pill pill--secondary">
              Paste text
            </Link>
            <Link to="/english/scan" className="pill pill--secondary">
              Photo scan
            </Link>
            <Link to="/english/add" className="pill pill--secondary">
              Add a word
            </Link>
            <Link to="/english/packs" className="pill pill--secondary">
              Seed packs
            </Link>
          </div>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="topic-h">
          <h2 id="topic-h" className="card-title m-0">
            Topic pack
          </h2>
          <p className="m-0">One IELTS topic a week (Phases 1–2): Claude writes 25 words and collocations with example sentences, then you triage them.</p>
          <label className="field">
            <span className="field-label">Topic</span>
            <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {IELTS_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <PillButton variant="secondary" className="justify-self-start" onClick={async () => setJob(await topicPackJob(topic))}>
            Ask Claude for this pack
          </PillButton>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="hist-h">
          <h2 id="hist-h" className="card-title m-0">
            Import history
          </h2>
          {history.length === 0 ? (
            <p className="m-0">No imports yet.</p>
          ) : (
            <ul className="imp-history">
              {history.slice(0, 15).map((h) => (
                <li key={h.id}>
                  <span>{h.label}</span>
                  <span className="text-sm">
                    {h.kind === 'details' ? `${h.added} filled` : `${h.added} new${h.duplicates ? ` · ${h.duplicates} already had` : ''}`} · {when.format(new Date(h.at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <p className="m-0 text-sm">
          Common-word filter: NGSL 1.2 and NAWL 1.2 by Browne, C., Culligan, B., and Phillips, J. (
          <a href="https://www.newgeneralservicelist.com" target="_blank" rel="noopener noreferrer">
            newgeneralservicelist.com
          </a>
          ), licensed{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
            CC BY-SA 4.0
          </a>
          .
        </p>
      </div>
      <BridgeSheet job={job} onClose={() => setJob(null)} />
    </>
  );
}
