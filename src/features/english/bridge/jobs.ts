import { answerFormat, type BridgeJob } from '../../../core/bridge/bridge';
import { addCandidates, enrichCandidates, enrichNotes, itemFromExtract, logImport, seenKeys } from '../data/capture';
import { updateNote } from '../data/store';
import { applyGradeResults } from '../data/useIt';
import type { SourceRef, UseItAnswer, VocabNote } from '../model/types';
import {
  enrichSchema,
  extractVocabSchema,
  gradeBatchSchema,
  idProblems,
  IELTS_TOPICS,
  mnemonicSchema,
  type Enrich,
  type ExtractItem,
  type ExtractVocab,
  type GradeBatch,
  type Mnemonic,
} from './schemas';

/*
 * The English Bridge jobs (SPEC § 12 through the Claude Bridge). Each builder returns a BridgeJob:
 * the prompt (task + data as text + exact JSON schema) and what to save when the answer passes.
 */

const LEARNER =
  'I am Dosym, an English learner in Almaty, Kazakhstan, at B2 level, preparing for IELTS Academic (target band 8.0, test on 10 June 2027). My first languages are Kazakh and Russian.';

const ITEM_RULES = [
  '- Prefer collocations and fixed phrases ("pose a threat to", "a pressing issue") to single words; a single word is fine when it is strong on its own.',
  '- Level B2 or above, useful in IELTS Academic Writing or Speaking. Skip proper nouns, brand names, code and programming terms, and slang.',
  '- headword: the dictionary form ("pose a threat to", not "posed a threat to"). kind: "word", "collocation" or "phrase". pos: n, v, adj, adv, or "v phrase" etc.',
  '- definition: a short learner definition in simple English (at most 20 words).',
  '- glossKK: Kazakh translation in Cyrillic; glossRU: Russian translation. ipa: British pronunciation between slashes.',
  `- cefr: one of A1–C2. ieltsTopic: one of ${IELTS_TOPICS.map((t) => `"${t}"`).join(', ')}.`,
  '- synonymLadder: 2–4 rungs from a plain band-6 way to say it up to a band-8 way, with the band number.',
  '- family: other forms (e.g. "amplify, amplification, amplifier"); collocations: 1–3 common collocations with it.',
  '- usefulness: 0–1, how much it will raise my IELTS Lexical Resource score.',
].join('\n');

const EXAMPLE_ITEM = {
  headword: 'pose a threat to',
  lemma: 'pose a threat to',
  kind: 'collocation',
  pos: 'v phrase',
  cefr: 'C1',
  ieltsTopic: 'environment',
  definition: 'to be a possible danger to something',
  glossKK: 'қауіп төндіру',
  glossRU: 'представлять угрозу для',
  ipa: '/pəʊz ə θret tə/',
  exampleSentenceID: 's1',
  exampleText: 'Rising salinity poses a threat to well water in the region.',
  exampleTarget: 'poses a threat to',
  family: [],
  collocations: ['pose a serious threat to'],
  synonymLadder: [
    { band: 6, word: 'be dangerous for' },
    { band: 8, word: 'jeopardise' },
  ],
  usefulness: 0.85,
};

/** Keys I already have or skipped, so Claude does not suggest them again (newest 400). */
async function excludeText(): Promise<string> {
  const { keys } = await seenKeys();
  const list = [...keys].slice(-400);
  return list.length ? list.join(', ') : '(none yet)';
}

const date = (s?: string) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describeExtract(d: ExtractVocab) {
  return `${plural(d.items.length, 'word or collocation', 'words and collocations')} for your inbox`;
}

async function saveExtract(items: { item: ExtractItem; source: SourceRef }[], kind: 'claudeChats' | 'share' | 'ocr' | 'topicPack', label: string) {
  const res = await addCandidates(items.map(({ item, source }) => ({ item: itemFromExtract(item), source })));
  await logImport({ kind, label, added: res.added, duplicates: res.duplicates });
  return `${plural(res.added, 'new word')} in your inbox${res.duplicates ? ` (${res.duplicates} you already had)` : ''}.`;
}

// ---------- extract-vocab: Claude searches my past chats ----------

/** Claude answered {"error": "chat search is off"}: say how to switch it on. */
export function explainChatSearchError(message: string): string | undefined {
  if (!/search/i.test(message)) return undefined;
  return 'Chat search is switched off in your Claude account, so Claude cannot read your past chats. Turn it on: claude.ai → Settings → Capabilities → “Search and reference chats” (the name may differ slightly). Then go back to step 01, start a NEW chat with Open Claude and send the prompt again.';
}

export async function chatSearchJob(opts: { maxItems: number; since?: string }): Promise<BridgeJob<ExtractVocab>> {
  const since = opts.since ? ` from ${new Date(opts.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} onwards` : '';
  const prompt = [
    `# Task: find English vocabulary in my past chats with you\n\n${LEARNER}`,
    '## What to do',
    `1. Use your past-chats search tool to look through my earlier conversations with you${since}. Search several times on different subjects we talked about (school, science, the FrostPure freeze-desalination project, robotics, applications and competitions, essays, IELTS, anything else you find) so you cover many chats, not one.`,
    `2. From YOUR English replies in those chats, pick up to ${opts.maxItems} words and collocations worth learning. Do not take words from my own messages (they may contain my mistakes).`,
    '3. For each one, copy the exact English sentence from the chat into exampleText, put the exact words as they appear in that sentence into exampleTarget, and give the chat title (sourceTitle) and date (sourceDate, YYYY-MM-DD) if you can see them. Leave out exampleSentenceID.',
    'If you cannot search my past chats (the setting is off), answer only {"error": "chat search is off"}.',
    `## Rules for each item\n${ITEM_RULES}`,
    `## Do not suggest these (already in my cards or skipped; format "lemma|part of speech")\n${await excludeText()}`,
    answerFormat(extractVocabSchema, { items: [{ ...EXAMPLE_ITEM, exampleSentenceID: undefined, sourceTitle: 'Freeze desalination notes', sourceDate: '2026-09-12' }] }),
  ].join('\n\n');
  return {
    id: 'english.extract-vocab.chats',
    title: 'Words from my Claude chats',
    intro: 'Claude Pro searches your past chats and picks English words and collocations useful for IELTS. They land in your inbox to keep, skip or mark as known. Chat search must be on in Claude (Settings → Capabilities → “Search and reference chats”).',
    prompt,
    schema: extractVocabSchema,
    describe: describeExtract,
    explainError: explainChatSearchError,
    save: (d) =>
      saveExtract(
        d.items.map((item) => ({ item, source: { kind: 'claudeExport', title: item.sourceTitle ?? 'Claude chat', date: date(item.sourceDate) } })),
        'claudeChats',
        'Claude chat search',
      ),
  };
}

// ---------- extract-vocab: Claude picks from given sentences (share, photo scan) ----------

export interface SentenceGroup {
  title: string;
  source: SourceRef;
  sentences: string[];
}

export async function sentencesJob(opts: { mode: 'share' | 'ocr'; groups: SentenceGroup[]; mustKeep?: string[]; maxItems?: number }): Promise<BridgeJob<ExtractVocab>> {
  const ids = new Map<string, { text: string; source: SourceRef }>();
  const blocks = opts.groups.map((g) => {
    const lines = g.sentences.map((text) => {
      const id = `s${ids.size + 1}`;
      ids.set(id, { text, source: g.source });
      return `${id}: ${text}`;
    });
    return `### ${g.title || 'Untitled'}\n${lines.join('\n')}`;
  });
  const prompt = [
    `# Task: pick English vocabulary from these sentences\n\n${LEARNER}`,
    `## What to do\nFrom the sentences below (${opts.mode === 'ocr' ? 'scanned from a photo of a page' : 'text I saved from an app or web page'}), pick up to ${opts.maxItems ?? 30} words and collocations worth learning. For each, set exampleSentenceID to the sentence id it came from, copy that sentence exactly into exampleText, and put the exact words as they appear in it into exampleTarget.${
      opts.mustKeep?.length ? `\nAlways include these, which I marked myself: ${opts.mustKeep.map((w) => `"${w}"`).join(', ')}.` : ''
    }`,
    `## Rules for each item\n${ITEM_RULES}`,
    `## Do not suggest these (already in my cards or skipped)\n${await excludeText()}`,
    `## Sentences\n${blocks.join('\n\n')}`,
    answerFormat(extractVocabSchema, { items: [EXAMPLE_ITEM] }),
  ].join('\n\n');
  return {
    id: `english.extract-vocab.${opts.mode}`,
    title: 'Let Claude pick the words',
    intro: `Claude picks the useful words and collocations from these ${plural(ids.size, 'sentence')} and adds definitions and Kazakh/Russian glosses. Only these English sentences go into the prompt.`,
    prompt,
    schema: extractVocabSchema,
    check: (d) => d.items.flatMap((x, i) => (!x.exampleSentenceID ? [`items[${i}].exampleSentenceID is missing`] : !ids.has(x.exampleSentenceID) ? [`items[${i}].exampleSentenceID "${x.exampleSentenceID}" is not one of my sentence ids`] : [])),
    describe: describeExtract,
    save: (d) =>
      saveExtract(
        d.items.map((item) => {
          const s = ids.get(item.exampleSentenceID!)!;
          // The sentence is taken from my text, not from Claude's copy of it.
          return { item: { ...item, exampleText: s.text, exampleTarget: item.exampleTarget }, source: s.source };
        }),
        opts.mode,
        opts.mode === 'ocr' ? 'Photo scan (Claude picked)' : 'Shared text (Claude picked)',
      ),
  };
}

// ---------- extract-vocab, topicPack mode ----------

export async function topicPackJob(topic: string, maxItems = 25): Promise<BridgeJob<ExtractVocab>> {
  const prompt = [
    `# Task: an IELTS topic vocabulary pack — ${topic}\n\n${LEARNER}`,
    `## What to do\nGive me ${maxItems} words and collocations for IELTS Academic Writing Task 2 and Speaking on the topic "${topic}". Mix verbs, nouns, adjectives and fixed phrases; most should be collocations. For each, write one natural example sentence of your own in exampleText (an IELTS-style sentence about the topic), put the exact words used into exampleTarget, set exampleSource to "generated", and leave out exampleSentenceID. Set ieltsTopic to "${topic}".`,
    `## Rules for each item\n${ITEM_RULES}`,
    `## Do not suggest these (already in my cards or skipped)\n${await excludeText()}`,
    answerFormat(extractVocabSchema, { items: [{ ...EXAMPLE_ITEM, exampleSentenceID: undefined, exampleSource: 'generated' }] }),
  ].join('\n\n');
  return {
    id: `english.extract-vocab.topic.${topic}`,
    title: `Topic pack: ${topic}`,
    intro: `Claude writes a pack of ${maxItems} words and collocations for “${topic}”. Example sentences are written by Claude and are labelled that way. They go to your inbox for triage.`,
    prompt,
    schema: extractVocabSchema,
    describe: describeExtract,
    save: (d) =>
      saveExtract(
        d.items.map((item) => ({ item: { ...item, exampleSource: 'generated' as const }, source: { kind: 'seed', title: `Topic pack · ${topic}`, date: new Date().toISOString() } })),
        'topicPack',
        `Topic pack · ${topic}`,
      ),
  };
}

// ---------- enrich-word, batched ----------

export interface EnrichRow {
  id: string;
  headword: string;
  context?: string;
}

export function enrichJob(target: 'candidates' | 'notes', rows: EnrichRow[]): BridgeJob<Enrich> {
  const list = rows.map((r) => `${r.id} | ${r.headword}${r.context ? ` | context: ${r.context}` : ''}`).join('\n');
  const prompt = [
    `# Task: fill in learner details for my English words\n\n${LEARNER}`,
    `## What to do\nFor every line below (format: id | word | the sentence where I met it), give one item with the same id. ${
      target === 'candidates'
        ? 'If the word is part of a stronger collocation in its sentence (for example "mitigate" in "mitigate the risk of"), you may use that collocation as the headword, kind "collocation". If there is a sentence, put the exact words of your headword as they appear in it into exampleTarget and leave exampleText out.'
        : 'Keep my headword as it is. Leave exampleText and exampleTarget out.'
    } Answer every id exactly once.`,
    `## Rules for each item\n${ITEM_RULES.split('\n')
      .filter((l) => !l.includes('usefulness'))
      .join('\n')}`,
    `## Words\n${list}`,
    answerFormat(enrichSchema, { items: [{ id: rows[0]?.id ?? 'id', ...EXAMPLE_ITEM, exampleSentenceID: undefined, exampleText: undefined, usefulness: undefined }] }),
  ].join('\n\n');
  return {
    id: `english.enrich.${target}`,
    title: 'Fill in the details with Claude',
    intro: `Claude adds a definition, Kazakh and Russian glosses, level, IPA, collocations and a synonym ladder for ${plural(rows.length, 'word')}${target === 'notes' ? ' marked “Needs details”. Fields you already filled stay as they are.' : ' in your inbox.'}`,
    prompt,
    schema: enrichSchema,
    check: (d) =>
      idProblems(
        d.items.map((x) => x.id),
        rows.map((r) => r.id),
        'id',
      ),
    describe: (d) => `details for ${plural(d.items.length, 'word')}`,
    save: async (d) => {
      const n = target === 'candidates' ? await enrichCandidates(d.items) : await enrichNotes(d.items);
      await logImport({ kind: 'details', label: target === 'candidates' ? 'Inbox details' : 'Needs-details words', added: n, duplicates: 0 });
      return `Details filled for ${plural(n, 'word')}.`;
    },
  };
}

// ---------- grade-sentence, weekly batch ----------

export function gradeJob(answers: UseItAnswer[]): BridgeJob<GradeBatch> {
  const ids = answers.map((_, i) => `u${i + 1}`);
  const byId = new Map(answers.map((a, i) => [ids[i], a]));
  const data = answers.map((a, i) => ({ id: ids[i], target: a.target, definition: a.definition, prompt: a.prompt, sentence: a.sentence }));
  const prompt = [
    `# Task: grade my "use it" sentences like an IELTS examiner\n\n${LEARNER}`,
    '## What to do',
    'Each item below is one sentence I wrote to practise a target word or collocation ("prompt" is the topic I was asked to write about). For each, judge whether I used the target item correctly and naturally. Be strict, like an IELTS examiner marking Lexical Resource. Correct minimally: keep my sentence and change only what is wrong.',
    [
      'For each id give:',
      '- usedCorrectly: true or false for the target item.',
      '- naturalness: 0–3 (0 = not English, 1 = understandable but wrong, 2 = correct but awkward, 3 = natural).',
      '- corrected: my sentence with the smallest fix (the same sentence if it is already right).',
      '- errors: each problem with the exact span, a type (preposition, collocation, word form, grammar, register, spelling, meaning) and a one-line explanation. Empty if none.',
      '- suggestedGrade: 1 = wrong use; 2 = correct but awkward; 3 = correct and natural; 4 = natural and band-8 level.',
      '- tip: one short tip, e.g. "Collocation: highly susceptible to".',
      'Answer every id exactly once.',
    ].join('\n'),
    `## Sentences\n${JSON.stringify(data, null, 1)}`,
    answerFormat(gradeBatchSchema, {
      results: [
        {
          id: 'u1',
          usedCorrectly: false,
          naturalness: 1,
          corrected: 'Teenagers are susceptible to online advertising.',
          errors: [{ span: 'susceptible for', type: 'preposition', explanation: "susceptible takes 'to'" }],
          suggestedGrade: 1,
          tip: 'Collocation: highly susceptible to',
        },
      ],
    }),
  ].join('\n\n');
  return {
    id: 'english.grade-sentence.weekly',
    title: 'Use-it feedback',
    intro: `Claude marks ${plural(answers.length, 'sentence')} you wrote on Use-it cards: correct or not, a minimal correction and a tip.`,
    prompt,
    schema: gradeBatchSchema,
    check: (d) =>
      idProblems(
        d.results.map((r) => r.id),
        ids,
        'id',
      ),
    describe: (d) => `feedback on ${plural(d.results.length, 'sentence')}`,
    save: async (d) => {
      const n = await applyGradeResults({ results: d.results.map((r) => ({ ...r, id: byId.get(r.id)!.id })) });
      return `Feedback saved for ${plural(n, 'sentence')}.`;
    },
  };
}

// ---------- mnemonic ----------

export function mnemonicJob(note: VocabNote, locus?: string): BridgeJob<Mnemonic> {
  const data = { headword: note.headword, definition: note.definition, glossKK: note.glossKK ?? null, glossRU: note.glossRU ?? null, locus: locus ?? null };
  const prompt = [
    `# Task: a memory hook for one English word\n\n${LEARNER}`,
    '## What to do\nSuggest one vivid keyword-image mnemonic (at most 40 words) that links the sound of the English word to its meaning. If a Kazakh or Russian word sounds similar, you may use it (say which in soundAlike; otherwise lang "none" and word null). If a locus is given, place the image there. Add imagePrompt: a short scene I can sketch myself.',
    `## Word\n${JSON.stringify(data)}`,
    answerFormat(mnemonicSchema, { mnemonic: 'A PIT where you FALL: a pitfall is a hidden trap.', soundAlike: { lang: 'none', word: null }, imagePrompt: 'a person stepping onto leaves over a deep pit' }),
  ].join('\n\n');
  return {
    id: `english.mnemonic.${note.id}`,
    title: `Memory hook: ${note.headword}`,
    intro: 'Claude suggests a vivid image to remember this word. It replaces the current mnemonic; you can edit it afterwards.',
    prompt,
    schema: mnemonicSchema,
    describe: (d) => `“${d.mnemonic.slice(0, 80)}${d.mnemonic.length > 80 ? '…' : ''}”`,
    save: async (d) => {
      const sound = d.soundAlike.lang !== 'none' && d.soundAlike.word ? ` (sounds like ${d.soundAlike.lang === 'kk' ? 'Kazakh' : 'Russian'} “${d.soundAlike.word}”)` : '';
      await updateNote(note, { mnemonic: `${d.mnemonic}${sound} Picture: ${d.imagePrompt}` });
      return 'Mnemonic saved on the word.';
    },
  };
}
