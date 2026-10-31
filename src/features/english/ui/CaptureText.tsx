import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BridgeSheet } from '../../../core/bridge/BridgeSheet';
import type { AnyBridgeJob } from '../../../core/bridge/bridge';
import { GlassCard, PillButton } from '../../../core/design/components';
import { sentencesJob } from '../bridge/jobs';
import { isKnownForm, lemmatize, loadIndex, type LemmaIndex } from '../capture/lemma';
import { ENGLISH_MIN, englishScore, splitSentences, stripNoise } from '../capture/text';
import { addCandidates, logImport } from '../data/capture';
import type { SourceRef } from '../model/types';

/*
 * Shared by the share page (SPEC § 6.2) and the photo scan (§ 6.3): the text split into English
 * sentences; tap words to collect them (neighbouring taps join into one phrase), and the sentence
 * is kept as the example. Or let Claude pick from the sentences through the Bridge.
 */

interface Token {
  text: string;
  word: boolean;
}

const tokenize = (s: string): Token[] => s.split(/(\s+)/).filter(Boolean).map((t) => ({ text: t, word: /\p{L}/u.test(t) }));
const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname : undefined;
  } catch {
    return undefined;
  }
};
const clean = (t: string) => t.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '');

export function CaptureText({ text, title, kind, url }: { text: string; title?: string; kind: 'share' | 'ocr'; url?: string }) {
  const [index, setIndex] = useState<LemmaIndex | null>(null);
  const [picked, setPicked] = useState<Map<number, Set<number>>>(new Map());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<AnyBridgeJob | null>(null);

  useEffect(() => {
    void loadIndex().then(setIndex);
  }, []);

  const all = useMemo(() => splitSentences(stripNoise(text)), [text]);
  const sentences = useMemo(() => (index ? all.filter((s) => englishScore(s, (w) => isKnownForm(index, w)) >= ENGLISH_MIN) : []), [all, index]);
  const tokens = useMemo(() => sentences.map(tokenize), [sentences]);
  useEffect(() => setPicked(new Map()), [sentences]);

  const source: SourceRef = { kind, title: title?.trim() || (kind === 'ocr' ? 'Photo scan' : hostOf(url) ?? 'Shared text'), date: new Date().toISOString() };

  // Runs of neighbouring tapped words become one item: "pose" + "a" + "threat" → "pose a threat".
  const items = useMemo(() => {
    const out: { phrase: string; sentence: string }[] = [];
    picked.forEach((set, si) => {
      const ts = tokens[si];
      let run: string[] = [];
      const flush = () => {
        if (run.length) out.push({ phrase: run.join(' '), sentence: sentences[si] });
        run = [];
      };
      ts.forEach((t, ti) => {
        if (!t.word) return;
        if (set.has(ti)) run.push(clean(t.text));
        else flush();
      });
      flush();
    });
    return out.filter((i) => i.phrase);
  }, [picked, tokens, sentences]);

  const toggle = (si: number, ti: number) => {
    setMessage('');
    setPicked((m) => {
      const next = new Map(m);
      const set = new Set(next.get(si) ?? []);
      if (set.has(ti)) set.delete(ti);
      else set.add(ti);
      if (set.size) next.set(si, set);
      else next.delete(si);
      return next;
    });
  };

  const send = async () => {
    if (!index || !items.length) return;
    setBusy(true);
    const res = await addCandidates(
      items.map(({ phrase, sentence }) => {
        const multi = phrase.includes(' ');
        return {
          item: {
            headword: multi ? phrase.toLowerCase() : lemmatize(phrase, index),
            kind: multi ? ('collocation' as const) : ('word' as const),
            exampleText: sentence,
            exampleTarget: phrase,
            family: [],
            collocations: [],
            synonymLadder: [],
            usefulness: 0.9, // chosen by me: near the top of the inbox
          },
          source,
        };
      }),
    );
    await logImport({ kind, label: kind === 'ocr' ? 'Photo scan' : 'Shared text', added: res.added, duplicates: res.duplicates });
    setPicked(new Map());
    setBusy(false);
    setMessage(`${res.added} sent to your inbox${res.duplicates ? ` · ${res.duplicates} you already had` : ''}.`);
  };

  const claudePicks = async () => {
    const j = await sentencesJob({ mode: kind, groups: [{ title: source.title ?? '', source, sentences }], mustKeep: items.map((i) => i.phrase) });
    setJob(j);
  };

  if (!index) return <p className="m-0">Reading the text…</p>;

  const dropped = all.length - sentences.length;
  return (
    <div className="grid gap-3">
      {sentences.length === 0 ? (
        <p className="notice m-0">No English sentences found here{dropped ? ` (${dropped} non-English or code lines left out)` : ''}.</p>
      ) : (
        <GlassCard size="md" className="grid gap-2">
          <p className="m-0 text-sm">
            Tap the words to keep. Tap words next to each other to keep a phrase. {dropped > 0 && `${dropped} non-English or code lines were left out.`}
          </p>
          <div className="cap-text">
            {tokens.map((ts, si) => (
              <p key={si} className="cap-sentence">
                {ts.map((t, ti) =>
                  t.word ? (
                    <button key={ti} type="button" className="cap-word" aria-pressed={!!picked.get(si)?.has(ti)} onClick={() => toggle(si, ti)}>
                      {t.text}
                    </button>
                  ) : (
                    <span key={ti}>{t.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        </GlassCard>
      )}

      {items.length > 0 && (
        <p className="m-0" aria-live="polite">
          Selected: <strong>{items.map((i) => i.phrase).join(' · ')}</strong>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <PillButton disabled={!items.length || busy} onClick={() => void send()}>
          {items.length ? `Send ${items.length} to inbox` : 'Tap words to send them'}
        </PillButton>
        {sentences.length > 0 && (
          <PillButton variant="secondary" onClick={() => void claudePicks()}>
            Let Claude pick
          </PillButton>
        )}
      </div>
      {message && (
        <p className="notice m-0" role="status">
          {message} <Link to="/english/inbox">Open the inbox</Link>
        </p>
      )}
      <BridgeSheet job={job} onClose={() => setJob(null)} onSaved={(m) => setMessage(m)} />
    </div>
  );
}
