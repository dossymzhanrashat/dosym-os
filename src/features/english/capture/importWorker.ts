import { parseConversations } from './exportParser';
import { loadIndex } from './lemma';
import { pickCandidates, type PickOptions, type PickResult } from './picker';
import { readFileFromZip } from './zip';

/*
 * Runs the Claude export import off the main thread (SPEC § 13: huge exports must not freeze the
 * page). In: the file and the pick options. Out: progress messages, then the result or an error.
 */

export type WorkerIn = { file: File; options: Omit<PickOptions, 'knownLemmas'> & { knownLemmas: string[] } };
export type WorkerOut =
  | { type: 'progress'; step: string }
  | { type: 'done'; result: PickResult; skipped: number }
  | { type: 'unknownFormat'; structure: string }
  | { type: 'error'; message: string };

const post = (m: WorkerOut) => (self as unknown as { postMessage(m: WorkerOut): void }).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  try {
    const { file, options } = e.data;
    const isZip = /\.zip$/i.test(file.name) || file.type.includes('zip');
    post({ type: 'progress', step: isZip ? 'Unzipping…' : 'Reading the file…' });
    const text = isZip ? await readFileFromZip(file, 'conversations.json') : await file.text();
    post({ type: 'progress', step: 'Reading conversations…' });
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      post({ type: 'error', message: 'This file is not valid JSON. Choose conversations.json from the export, or the .zip itself.' });
      return;
    }
    const parsed = parseConversations(raw);
    if (!parsed.ok) {
      post({ type: 'unknownFormat', structure: parsed.structure });
      return;
    }
    post({ type: 'progress', step: `Finding English words in ${parsed.conversations.length.toLocaleString('en-GB')} conversations…` });
    const index = await loadIndex();
    const result = pickCandidates(parsed.conversations, index, { ...options, knownLemmas: new Set(options.knownLemmas) });
    post({ type: 'done', result, skipped: parsed.skipped });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
