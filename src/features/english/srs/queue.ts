import { DAY } from '../../../core/planner/time';
import type { CardType, VocabCard, VocabNote } from '../model/types';
import { cardR } from './scheduler';
import { studyDay, studyDayEnd, studyDayStart } from './studyDay';

/*
 * Session queue (SPEC § 5.6):
 *   1. learning / relearning cards due now, by due time
 *   2. review cards due today or overdue, lowest R first (ties: smaller S first), capped at max reviews/day
 *   3. new cards, one after every four reviews: error log, then share/OCR/manual, then Claude export,
 *      then seed packs; older first; capped at today's new-card allowance
 * Siblings: once a card of a note is reviewed, the note's other cards wait until tomorrow; new
 * siblings come on separate days in the order recognition → production → cloze → …
 */

/** Order new siblings are introduced in. */
export const TYPE_ORDER: CardType[] = [
  'recognition',
  'production',
  'cloze',
  'collocation',
  'listening',
  'spelling',
  'synonymLadder',
  'wordFamily',
  'useIt',
  'palace',
];
const rank = (t: CardType) => TYPE_ORDER.indexOf(t);

const SOURCE_GROUP: Record<string, number> = { errorLog: 0, share: 1, ocr: 1, manual: 1, claudeExport: 2, seed: 3 };

export interface QueueInput {
  cards: VocabCard[];
  notes: Map<string, VocabNote>;
  now: Date;
  newAllowance: number; // today's new cap minus new cards already introduced today
  reviewAllowance: number; // max reviews/day minus reviews already done today
  typeEnabled: (t: CardType) => boolean;
}

export interface Queue {
  order: VocabCard[];
  learning: number;
  reviews: number;
  news: number;
  /** Earliest learning card that comes due later today (the session can wait for it). */
  nextLearningAt?: string;
}

/** Cards that may be studied at all: not deleted or suspended, note active or "known", type switched on. */
export function studyable(c: VocabCard, notes: Map<string, VocabNote>, typeEnabled: (t: CardType) => boolean): boolean {
  const note = notes.get(c.noteId);
  return !c.deletedAt && !c.suspended && !!note && !note.deletedAt && note.status !== 'suspended' && typeEnabled(c.type);
}

export function buildQueue({ cards, notes, now, newAllowance, reviewAllowance, typeEnabled }: QueueInput): Queue {
  const dayStart = studyDayStart(now).getTime();
  const dayEnd = studyDayEnd(now).getTime();
  const pool = cards.filter((c) => studyable(c, notes, typeEnabled));

  // Notes touched today: their other cards are buried until tomorrow.
  const touched = new Set(pool.filter((c) => c.lastReview && new Date(c.lastReview).getTime() >= dayStart).map((c) => c.noteId));
  const taken = new Set<string>();

  const learningAll = pool.filter((c) => c.state === 'learning' || c.state === 'relearning');
  const learning = learningAll.filter((c) => new Date(c.due) <= now).sort((a, b) => a.due.localeCompare(b.due));
  const later = learningAll
    .filter((c) => new Date(c.due) > now && new Date(c.due).getTime() < dayEnd)
    .sort((a, b) => a.due.localeCompare(b.due))[0];

  const reviews: VocabCard[] = [];
  const reviewCandidates = pool
    .filter((c) => c.state === 'review' && new Date(c.due).getTime() < dayEnd)
    .map((c) => ({ c, r: cardR(c, now) }))
    .sort((a, b) => a.r - b.r || a.c.stability - b.c.stability);
  for (const { c } of reviewCandidates) {
    if (reviews.length >= reviewAllowance) break;
    if (touched.has(c.noteId) || taken.has(c.noteId)) continue;
    taken.add(c.noteId);
    reviews.push(c);
  }

  const byNote = new Map<string, VocabCard[]>();
  for (const c of cards.filter((c) => !c.deletedAt)) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
  const news: VocabCard[] = [];
  const newCandidates = pool
    .filter((c) => c.state === 'new')
    .filter((c) => {
      // A new sibling waits until every lower-ranked sibling was introduced on an earlier day.
      const siblings = byNote.get(c.noteId) ?? [];
      return siblings.every(
        (s) => s.id === c.id || rank(s.type) > rank(c.type) || s.suspended || (s.state !== 'new' && !!s.introducedAt && new Date(s.introducedAt).getTime() < dayStart),
      );
    })
    .sort((a, b) => {
      const na = notes.get(a.noteId)!;
      const nb = notes.get(b.noteId)!;
      return (
        (SOURCE_GROUP[na.source.kind] ?? 9) - (SOURCE_GROUP[nb.source.kind] ?? 9) ||
        na.createdAt.localeCompare(nb.createdAt) ||
        rank(a.type) - rank(b.type)
      );
    });
  for (const c of newCandidates) {
    if (news.length >= newAllowance) break;
    if (touched.has(c.noteId) || taken.has(c.noteId)) continue;
    taken.add(c.noteId);
    news.push(c);
  }

  // Reviews with one new card after every four.
  const mixed: VocabCard[] = [];
  let r = 0;
  let n = 0;
  while (r < reviews.length || n < news.length) {
    for (let k = 0; k < 4 && r < reviews.length; k++) mixed.push(reviews[r++]);
    if (n < news.length) mixed.push(news[n++]);
  }

  return { order: [...learning, ...mixed], learning: learning.length, reviews: reviews.length, news: news.length, nextLearningAt: later?.due };
}

/** Reviews due on each of the next `days` study days (today first; overdue counts today). */
export function forecast(cards: VocabCard[], now: Date, days = 14): { day: string; count: number }[] {
  const start = studyDayStart(now).getTime();
  const out = Array.from({ length: days }, (_, i) => ({ day: studyDay(new Date(start + i * DAY + 12 * 3_600_000)), count: 0 }));
  for (const c of cards) {
    if (c.deletedAt || c.suspended || c.state === 'new') continue;
    const i = Math.max(0, Math.floor((new Date(c.due).getTime() - start) / DAY));
    if (i < days) out[i].count++;
  }
  return out;
}
