import { collectConversations } from './exportParser';
import { loadIndex } from './lemma';
import { pickCandidates, type PickOptions, type PickResult } from './picker';
import { readJsonEntries } from './zip';

/*
 * Runs the Claude export import off the main thread (SPEC § 13: huge exports must not freeze the
 * page). In: the chosen files (.zip parts and/or .json) and the pick options. Out: progress
 * messages, then the result or an error.
 */

export type WorkerIn = { files: File[]; options: Omit<PickOptions, 'knownLemmas'> & { knownLemmas: string[] } };
export type WorkerOut =
  | { type: 'progress'; step: string }
  | { type: 'done'; result: PickResult; skipped: number }
  | { type: 'unknownFormat'; structure: string }
  | { type: 'error'; message: string };

const post = (m: WorkerOut) => (self as unknown as { postMessage(m: WorkerOut): void }).postMessage(m);
const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type.includes('zip');

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  try {
    const { files, options } = e.data;
    const texts: { name: string; text: string }[] = [];
    for (const [i, file] of files.entries()) {
      post({ type: 'progress', step: `${isZip(file) ? 'Unzipping' : 'Reading'} ${file.name} (${i + 1} of ${files.length})…` });
      if (isZip(file)) texts.push(...(await readJsonEntries(file, /conversation/i)));
      else texts.push({ name: file.name, text: await file.text() });
    }
    post({ type: 'progress', step: 'Reading conversations…' });
    const found = collectConversations(texts);
    if (!found.ok) {
      if (found.reason === 'manifest')
        post({
          type: 'error',
          message:
            'This is the export’s list of download links (manifest), not the chats. Open the Claude export email or page while signed in, download conversations-000.zip (and -001, -002 … if there are more), then choose those here.',
        });
      else if (found.reason === 'notJson') post({ type: 'error', message: 'No chats found in these files. Choose conversations-000.zip (or conversations.json) from the Claude export.' });
      else post({ type: 'unknownFormat', structure: found.structure ?? '' });
      return;
    }
    post({ type: 'progress', step: `Finding English words in ${found.conversations.length.toLocaleString('en-GB')} conversations…` });
    const index = await loadIndex();
    const result = pickCandidates(found.conversations, index, { ...options, knownLemmas: new Set(options.knownLemmas) });
    post({ type: 'done', result, skipped: found.skipped });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
