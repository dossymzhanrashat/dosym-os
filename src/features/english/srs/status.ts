import type { VocabCard, VocabNote } from '../model/types';
import { cardR } from './scheduler';

/*
 * Frozen words and salt (SPEC § 7 "Delight"):
 *   frozen — every active card has S ≥ 30 days and its last grade was Good or Easy
 *   salt   — a leech, or a note whose lowest card R is below 0.70
 * A note with all cards suspended counts as neither.
 */

export const FREEZE_STABILITY = 30;
export const SALT_R = 0.7;

export function activeCards(cards: VocabCard[]): VocabCard[] {
  return cards.filter((c) => !c.deletedAt && !c.suspended);
}

export function isFrozen(cards: VocabCard[]): boolean {
  const a = activeCards(cards);
  return a.length > 0 && a.every((c) => c.state === 'review' && c.stability >= FREEZE_STABILITY && (c.lastGrade ?? 0) >= 3);
}

/** Lowest R among a note's reviewed active cards (undefined when none has been reviewed yet). */
export function lowestR(cards: VocabCard[], now: Date): number | undefined {
  const rs = activeCards(cards)
    .filter((c) => c.state !== 'new')
    .map((c) => cardR(c, now));
  return rs.length ? Math.min(...rs) : undefined;
}

export function isSalt(cards: VocabCard[], now: Date): boolean {
  const a = activeCards(cards);
  if (!a.length) return false;
  if (a.some((c) => c.isLeech)) return true;
  const r = lowestR(a, now);
  return r !== undefined && r < SALT_R;
}

export type WordState = 'new' | 'learning' | 'frozen' | 'thawing' | 'salt' | 'suspended';

/** One label per note for lists, the wall and stats. */
export function wordState(note: VocabNote, cards: VocabCard[], now: Date): WordState {
  const a = activeCards(cards);
  if (note.status === 'suspended' || !a.length) return 'suspended';
  if (isSalt(a, now)) return 'salt';
  if (isFrozen(a)) return (lowestR(a, now) ?? 1) < 0.9 ? 'thawing' : 'frozen';
  if (a.every((c) => c.state === 'new')) return 'new';
  return 'learning';
}
