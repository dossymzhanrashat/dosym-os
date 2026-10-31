import { saveLocal } from '../../../core/db/sync';
import { IELTS_TOPICS } from '../bridge/schemas';
import { findTarget } from '../capture/text';
import type { GradeBatch } from '../bridge/schemas';
import type { Grade, UseItAnswer, VocabCard, VocabNote } from '../model/types';
import { newCard, seededUnit } from '../srs/scheduler';
import { cardSync, cardsTable, noteSync, notesTable, useItSync, useItTable } from './db';
import { stableId } from './store';

/*
 * Use-it cards (SPEC § 7, § 12.3): "Write one sentence using X about <topic>."
 * A note gets its Use-it card once you know it: when any other card of it reaches review with
 * stability ≥ 7 days (decided with the user, 31 Oct 2026). The sentence is self-graded in the
 * session and queued; the weekly Claude Bridge batch (up to 20) returns feedback.
 */

export const USE_IT_AFTER_DAYS = 7;
export const USE_IT_BATCH = 20;
const USE_IT_KINDS = new Set<VocabNote['kind']>(['word', 'collocation', 'phrase']);

export function wantsUseIt(note: VocabNote, cards: VocabCard[]): boolean {
  if (note.deletedAt || note.status !== 'active' || note.frozenAt || !USE_IT_KINDS.has(note.kind) || (note.kind === 'phrase' && note.synonymLadder.length > 0)) return false;
  if (cards.some((c) => c.type === 'useIt')) return false;
  return cards.some((c) => !c.deletedAt && c.type !== 'useIt' && c.state === 'review' && c.stability >= USE_IT_AFTER_DAYS);
}

/** Same id on every device, so two devices back-filling before a sync make one card, not two. */
async function addUseItCard(note: VocabNote, now = new Date()): Promise<void> {
  const card = { ...newCard(note.id, 'useIt', now), id: await stableId(`card:${note.id}:useIt`) };
  if (await cardsTable.get(card.id)) return;
  await saveLocal(cardSync, card);
}

/** Called by gradeCard: adds the Use-it card when a note qualifies; records the self-grade. */
export async function afterGrade(note: VocabNote, siblings: VocabCard[], card: VocabCard, grade: Grade): Promise<void> {
  if (wantsUseIt(note, siblings)) await addUseItCard(note);
  if (card.type === 'useIt') {
    const recent = (await useItTable.where('cardId').equals(card.id).toArray())
      .filter((a) => !a.deletedAt && a.selfGrade === undefined && Date.now() - Date.parse(a.writtenAt) < 6 * 3_600_000)
      .sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))[0];
    if (recent) await saveLocal(useItSync, { ...recent, selfGrade: grade, updatedAt: new Date().toISOString() });
  }
}

/** Back-fill: notes that already qualify get their Use-it card (runs when English opens). */
export async function ensureUseItCards(): Promise<number> {
  const notes = await notesTable.toArray();
  const cards = await cardsTable.toArray();
  const byNote = new Map<string, VocabCard[]>();
  for (const c of cards) byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
  let added = 0;
  for (const n of notes) {
    if (wantsUseIt(n, byNote.get(n.id) ?? [])) {
      await addUseItCard(n);
      added++;
    }
  }
  return added;
}

/** "about technology": the note's IELTS topic, or one of the 16 picked by card and day. */
export function useItPrompt(note: VocabNote, cardId: string, day: string): string {
  const topic = note.ieltsTopic?.trim() || IELTS_TOPICS[Math.floor(seededUnit(`${cardId}:${day}`) * IELTS_TOPICS.length)];
  return `about ${topic.toLowerCase()}`;
}

export async function saveUseItAnswer(card: VocabCard, note: VocabNote, prompt: string, sentence: string): Promise<UseItAnswer> {
  const iso = new Date().toISOString();
  const answer: UseItAnswer = { id: crypto.randomUUID(), cardId: card.id, noteId: note.id, target: note.headword, definition: note.definition, prompt, sentence: sentence.trim(), writtenAt: iso, updatedAt: iso };
  await saveLocal(useItSync, answer);
  return answer;
}

/** Sentences still waiting for feedback, oldest first. */
export function waitingAnswers(answers: UseItAnswer[]): UseItAnswer[] {
  return answers.filter((a) => !a.deletedAt && !a.feedback).sort((a, b) => a.writtenAt.localeCompare(b.writtenAt));
}

export async function applyGradeResults(batch: GradeBatch): Promise<number> {
  const iso = new Date().toISOString();
  let n = 0;
  for (const r of batch.results) {
    const a = await useItTable.get(r.id);
    if (!a) continue;
    const { id: _id, ...feedback } = r;
    await saveLocal(useItSync, { ...a, feedback, feedbackAt: iso, updatedAt: iso });
    n++;
  }
  return n;
}

/** Claude's grade was lower than mine: bring the Use-it card back into today's queue. */
export async function practiseAgain(a: UseItAnswer): Promise<void> {
  const card = await cardsTable.get(a.cardId);
  if (!card || card.deletedAt) return;
  const iso = new Date().toISOString();
  await saveLocal(cardSync, { ...card, due: iso, updatedAt: iso });
}

/** Keep the corrected sentence as the note's newest example (max 5). */
export async function addCorrectedExample(a: UseItAnswer): Promise<void> {
  const note = await notesTable.get(a.noteId);
  if (!note || !a.feedback) return;
  const text = a.feedback.corrected;
  if (note.examples.some((e) => e.text === text)) return;
  const iso = new Date().toISOString();
  const examples = [{ text, target: findTarget(text, note.headword), source: { kind: 'manual' as const, title: 'My Use-it sentence', date: iso } }, ...note.examples].slice(0, 5);
  await saveLocal(noteSync, { ...note, examples, updatedAt: iso });
}

export async function dismissAnswer(a: UseItAnswer): Promise<void> {
  const iso = new Date().toISOString();
  await saveLocal(useItSync, { ...a, deletedAt: iso, updatedAt: iso });
}
