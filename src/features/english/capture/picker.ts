import type { ExportConversation } from './exportParser';
import { isNewOrChanged } from './exportParser';
import { isKnownForm, lemmatize, type LemmaIndex } from './lemma';
import { englishSentences, findTarget, words } from './text';

/*
 * Candidate picking in the browser (WEB EDITION, second route of /ai/extract-vocab):
 * English sentences from the export → words that are not in the common list (NGSL), not already
 * in my notes, inbox or skipped keys → ranked by how often and in how many chats they appear,
 * academic words (NAWL) first. The user ticks the ones to keep.
 */

export interface PickOptions {
  includeMine: boolean; // also read my own messages (default: Claude's only)
  processed: Record<string, string>; // conversation id → updated_at already imported
  /** Lemmas already in notes / inbox / skipped (the part of the key before "|"). */
  knownLemmas: Set<string>;
  rescanAll?: boolean;
}

export interface PickedExample {
  text: string;
  target: string;
  conversationId: string;
  title: string;
  date?: string;
}

export interface Pick {
  lemma: string;
  academic: boolean;
  count: number; // sentences
  chats: number; // conversations
  score: number; // 0–1
  examples: PickedExample[]; // up to 3, shortest first
}

export interface PickStats {
  conversations: number;
  newConversations: number;
  sentences: number;
  sentencesWithNew: number;
  candidates: number;
}

export interface PickResult {
  picks: Pick[];
  stats: PickStats;
  /** Conversations read this time, to mark as processed once the import is saved. */
  processed: Record<string, string>;
}

/** Programming and chat-app words that are rare in general English but useless for IELTS. */
const TECH = new Set(
  'api apis app apps json yaml html css javascript typescript python react node npm vite github repo repos commit commits backend frontend frontend localhost url urls http https async await const config configs boolean string strings integer array arrays function functions param params dataset datasets runtime refactor refactoring debug debugging deploy deployed deployment plugin plugins dropdown checkbox navbar sidebar tooltip emoji emojis username login logout signup online offline wifi bluetooth esp arduino supabase claude anthropic chatgpt openai iphone ipad macbook ios android pdf docx csv png jpg svg gif webp markdown regex vs etc ie eg'.split(' '),
);

const looksTechnical = (w: string) => TECH.has(w) || /[_\d]/.test(w) || /[a-z][A-Z]/.test(w);

export function pickCandidates(conversations: ExportConversation[], index: LemmaIndex, opts: PickOptions): PickResult {
  const fresh = opts.rescanAll ? conversations : conversations.filter((c) => isNewOrChanged(c, opts.processed));
  const known = (w: string) => isKnownForm(index, w);

  // Pass 1: English sentences, and every lower-case word seen (to tell names from words).
  const sentences: { text: string; conv: ExportConversation }[] = [];
  for (const conv of fresh) {
    for (const m of conv.messages) {
      if (m.sender === 'human' && !opts.includeMine) continue;
      for (const s of englishSentences(m.text, known)) sentences.push({ text: s, conv });
    }
  }
  const lowerSeen = new Set<string>();
  for (const s of sentences) for (const w of words(s.text)) if (w === w.toLowerCase()) lowerSeen.add(w);

  // Pass 2: count rare words by lemma.
  const byLemma = new Map<string, { count: number; chats: Set<string>; examples: PickedExample[] }>();
  let withNew = 0;
  for (const s of sentences) {
    const ws = words(s.text);
    let found = false;
    ws.forEach((raw, i) => {
      const lower = raw.toLowerCase().replace(/’/g, "'");
      if (lower.length < 4 || looksTechnical(raw) || /^[A-Z]{2,}$/.test(raw)) return;
      // A capitalised word mid-sentence that never appears in lower case is a name.
      if (raw !== lower && i > 0 && !lowerSeen.has(lower)) return;
      const lemma = lemmatize(lower, index, (c) => lowerSeen.has(c));
      if (index.common.has(lemma) || (known(lower) && !index.academic.has(lemma)) || opts.knownLemmas.has(lemma)) return;
      found = true;
      const entry = byLemma.get(lemma) ?? { count: 0, chats: new Set(), examples: [] };
      entry.count++;
      entry.chats.add(s.conv.id);
      const len = words(s.text).length;
      if (len >= 6 && len <= 40 && !entry.examples.some((e) => e.text === s.text)) {
        entry.examples.push({ text: s.text, target: findTarget(s.text, lemma) ?? raw, conversationId: s.conv.id, title: s.conv.title, date: s.conv.updatedAt });
        entry.examples.sort((a, b) => a.text.length - b.text.length);
        entry.examples.length = Math.min(entry.examples.length, 3);
      }
      byLemma.set(lemma, entry);
    });
    if (found) withNew++;
  }

  const picks: Pick[] = [];
  for (const [lemma, e] of byLemma) {
    if (!e.examples.length) continue;
    const academic = index.academic.has(lemma);
    // A word seen once in one chat is often a typo or a one-off name: keep it, but lower.
    const score = Math.min(1, (academic ? 0.4 : 0.1) + Math.min(0.35, 0.12 * (e.chats.size - 1)) + Math.min(0.25, 0.05 * (e.count - 1)) + (e.count > 1 || academic ? 0.1 : 0));
    picks.push({ lemma, academic, count: e.count, chats: e.chats.size, score, examples: e.examples });
  }
  picks.sort((a, b) => b.score - a.score || b.count - a.count || a.lemma.localeCompare(b.lemma));

  const processed: Record<string, string> = {};
  for (const c of fresh) processed[c.id] = c.updatedAt ?? new Date(0).toISOString();
  return {
    picks,
    stats: { conversations: conversations.length, newConversations: fresh.length, sentences: sentences.length, sentencesWithNew: withNew, candidates: picks.length },
    processed,
  };
}
