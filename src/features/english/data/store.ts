import { useMemo } from 'react';
import { db } from '../../../core/db/db';
import { saveLocal } from '../../../core/db/sync';
import { useLive } from '../../../core/db/useLive';
import { saveSetting, useSetting } from '../../../core/planner/store';
import {
  DEFAULT_ENGLISH_SETTINGS,
  type CardType,
  type EnglishSettings,
  type Example,
  type Grade,
  type ReviewLog,
  type VocabCard,
  type VocabNote,
} from '../model/types';
import { newCap } from '../srs/phase';
import { buildQueue, forecast, type Queue } from '../srs/queue';
import { newCard, review, toFsrs5, toLadder, type SchedulerConfig } from '../srs/scheduler';
import { isFrozen } from '../srs/status';
import { studyDay } from '../srs/studyDay';
import { afterGrade } from './useIt';
import { cardSync, cardsTable, logSync, logsTable, noteSync, notesTable } from './db';

// Reading and changing English data. Every write goes through saveLocal(), so it syncs.

// ---------- Settings ----------

export const ENGLISH_SETTINGS = 'english';

export function useEnglishSettings(): EnglishSettings {
  const saved = useSetting<Partial<EnglishSettings>>(ENGLISH_SETTINGS, {});
  return useMemo(() => ({ ...DEFAULT_ENGLISH_SETTINGS, ...saved, cardTypes: { ...DEFAULT_ENGLISH_SETTINGS.cardTypes, ...saved.cardTypes } }), [saved]);
}

export async function loadEnglishSettings(): Promise<EnglishSettings> {
  const saved = ((await db.settings.get(ENGLISH_SETTINGS))?.value ?? {}) as Partial<EnglishSettings>;
  return { ...DEFAULT_ENGLISH_SETTINGS, ...saved, cardTypes: { ...DEFAULT_ENGLISH_SETTINGS.cardTypes, ...saved.cardTypes } };
}

export async function saveEnglishSettings(next: EnglishSettings): Promise<void> {
  const before = await loadEnglishSettings();
  // Switching scheduler converts every card's state; due dates stay as they are.
  if (before.scheduler !== next.scheduler) {
    const cards = await cardsTable.toArray();
    const now = new Date().toISOString();
    for (const c of cards) {
      if (c.deletedAt) continue;
      await saveLocal(cardSync, { ...(next.scheduler === 'ladder' ? toLadder(c, next.maxIntervalDays) : toFsrs5(c)), updatedAt: now });
    }
  }
  await saveSetting(ENGLISH_SETTINGS, next);
}

export function schedulerConfig(s: EnglishSettings): SchedulerConfig {
  return { kind: s.scheduler, retention: s.retention, maxIntervalDays: s.maxIntervalDays, testDate: s.testDate };
}

export const typeEnabled = (s: EnglishSettings) => (t: CardType) => s.cardTypes[t] !== false;

// ---------- Live data ----------

export interface EnglishData {
  loaded: boolean;
  notes: VocabNote[];
  cards: VocabCard[];
  logs: ReviewLog[];
  noteMap: Map<string, VocabNote>;
  cardsByNote: Map<string, VocabCard[]>;
}

export function useEnglishData(): EnglishData {
  const raw = useLive(
    async () => ({
      loaded: true,
      notes: (await notesTable.toArray()).filter((n) => !n.deletedAt),
      cards: (await cardsTable.toArray()).filter((c) => !c.deletedAt),
      logs: (await logsTable.toArray()).filter((l) => !l.deletedAt),
    }),
    [],
    { loaded: false, notes: [] as VocabNote[], cards: [] as VocabCard[], logs: [] as ReviewLog[] },
  );
  return useMemo(() => {
    const noteMap = new Map(raw.notes.map((n) => [n.id, n]));
    const cardsByNote = new Map<string, VocabCard[]>();
    for (const c of raw.cards) if (noteMap.has(c.noteId)) cardsByNote.set(c.noteId, [...(cardsByNote.get(c.noteId) ?? []), c]);
    return { ...raw, noteMap, cardsByNote };
  }, [raw]);
}

// ---------- Today ----------

export interface DayStats {
  reviewsDone: number;
  newIntroduced: number;
  activeSeconds: number;
  retention?: number; // share of review-state cards graded ≥ Hard
}

export function dayStats(logs: ReviewLog[], cards: VocabCard[], day: string): DayStats {
  const today = logs.filter((l) => studyDay(new Date(l.reviewedAt)) === day);
  const reviewed = today.filter((l) => l.stateBefore === 'review');
  return {
    reviewsDone: today.filter((l) => l.stateBefore !== 'new').length,
    newIntroduced: cards.filter((c) => c.introducedAt && studyDay(new Date(c.introducedAt)) === day).length,
    activeSeconds: Math.round(today.reduce((s, l) => s + l.durationMs, 0) / 1000),
    retention: reviewed.length ? reviewed.filter((l) => l.grade >= 2).length / reviewed.length : undefined,
  };
}

/** Median seconds per card from recent reviews (spec default 8 s). */
export function medianSeconds(logs: ReviewLog[]): number {
  const recent = logs
    .slice(-200)
    .map((l) => l.durationMs / 1000)
    .filter((s) => s > 0.5)
    .sort((a, b) => a - b);
  return recent.length >= 10 ? recent[Math.floor(recent.length / 2)] : 8;
}

export interface TodayPlan {
  queue: Queue;
  stats: DayStats;
  cap: number;
  throttled: 'none' | 'half' | 'stop';
  minutes: number;
  tomorrow: number;
}

export function todayPlan(data: EnglishData, settings: EnglishSettings, now = new Date()): TodayPlan {
  const day = studyDay(now);
  const stats = dayStats(data.logs, data.cards, day);
  const fc = forecast(data.cards, now, 2);
  const { cap, throttled } = newCap(day, fc[1].count, settings.newPerDay);
  const queue = buildQueue({
    cards: data.cards,
    notes: data.noteMap,
    now,
    newAllowance: Math.max(0, cap - stats.newIntroduced),
    reviewAllowance: Math.max(0, settings.maxReviewsPerDay - stats.reviewsDone),
    typeEnabled: typeEnabled(settings),
  });
  return { queue, stats, cap, throttled, minutes: Math.max(1, Math.round((queue.order.length * medianSeconds(data.logs)) / 60)), tomorrow: fc[1].count };
}

// ---------- Minimum day ----------

/** The 10-minute minimum day: 600 active seconds, or an empty queue after ≥ 5 min (SPEC § 5.6). */
export const MIN_DAY_SECONDS = 600;
const minDayKey = (day: string) => `english:minday:${day}`;

export async function markEmptyQueueDay(day: string): Promise<void> {
  await saveSetting(minDayKey(day), true);
}

export async function minimumDayDays(logs: ReviewLog[]): Promise<Set<string>> {
  const out = new Set<string>();
  const perDay = new Map<string, number>();
  for (const l of logs) perDay.set(studyDay(new Date(l.reviewedAt)), (perDay.get(studyDay(new Date(l.reviewedAt))) ?? 0) + l.durationMs);
  for (const [day, ms] of perDay) if (ms >= MIN_DAY_SECONDS * 1000) out.add(day);
  const marks = await db.settings.where('id').startsWith('english:minday:').toArray();
  for (const m of marks) if (m.value === true && !m.deletedAt) out.add(m.id.slice('english:minday:'.length));
  return out;
}

// ---------- Adding words ----------

/** Deterministic uuid from a string, so the same seed word gets the same id on every device. */
export async function stableId(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5-style
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ARTICLES = new Set(['a', 'an', 'the']);
export function coarsePos(pos?: string): string {
  const m = pos?.toLowerCase().match(/\b(adj|adv|n|v)\b/);
  return m ? m[1] : 'x';
}

/** Dedupe key (SPEC § 6.5): "amplify|v" for words, "pose threat to|col" for multi-word items. */
export function noteKey(headword: string, pos?: string, kind?: VocabNote['kind']): string {
  const words = headword
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words[0] === 'to' && words.length > 1 && coarsePos(pos) === 'v') words.shift();
  if (kind === 'spelling') return `${words.join(' ')}|spell`;
  if (kind === 'phrase') return `${words.join(' ')}|phrase`;
  const content = words.filter((w) => !ARTICLES.has(w));
  return content.length > 1 ? `${content.join(' ')}|col` : `${content[0] ?? ''}|${coarsePos(pos)}`;
}

/** "Collocation: susceptible TO." → { base: "susceptible", prep: "to" } */
export function collocationTip(tip?: string): { base: string; prep: string } | null {
  const m = tip?.match(/collocation:\s*(.+?)\s+([A-Za-z]+)\.?\s*$/i);
  return m ? { base: m[1].trim().toLowerCase(), prep: m[2].toLowerCase() } : null;
}
export const spellingTip = (tip?: string) => !!tip && /^spelling:/i.test(tip.trim());

/** Which cards a note gets (SPEC § 7, default-on types plus the ones its data allows). */
export function cardTypesFor(note: Pick<VocabNote, 'kind' | 'examples' | 'synonymLadder' | 'tip'>): CardType[] {
  if (note.kind === 'spelling') return ['spelling'];
  if (note.kind === 'phrase' && note.synonymLadder.length) return ['synonymLadder'];
  const types: CardType[] = ['recognition', 'production'];
  if (note.examples.some((e) => e.target && e.text.toLowerCase().includes(e.target.toLowerCase()))) types.push('cloze');
  if (collocationTip(note.tip)) types.push('collocation');
  types.push('listening');
  if (spellingTip(note.tip)) types.push('spelling');
  return types;
}

export type NoteInput = Omit<VocabNote, 'id' | 'key' | 'status' | 'isLeech' | 'createdAt' | 'updatedAt' | 'family' | 'collocations' | 'synonymLadder'> &
  Partial<Pick<VocabNote, 'family' | 'collocations' | 'synonymLadder' | 'status'>> & { stableSeed?: string };

const mergeExamples = (a: Example[], b: Example[]) => {
  const seen = new Set<string>();
  return [...b, ...a].filter((e) => !seen.has(e.text) && seen.add(e.text)).slice(0, 5);
};

/**
 * Adds a word, or merges into the existing note with the same key (examples merged, keeping the
 * 5 newest; empty fields filled; the schedule untouched). Deleted notes count as existing.
 */
export async function addNote(input: NoteInput, createdAt = new Date(), opts: { known?: boolean } = {}): Promise<{ note: VocabNote; created: boolean }> {
  const key = noteKey(input.headword, input.pos, input.kind);
  const existing = await notesTable.where('key').equals(key).first();
  const iso = new Date().toISOString();
  if (existing) {
    if (existing.deletedAt) return { note: existing, created: false };
    const merged: VocabNote = { ...existing, examples: mergeExamples(existing.examples, input.examples), updatedAt: iso };
    for (const f of ['pos', 'ipa', 'cefr', 'ieltsTopic', 'glossKK', 'glossRU', 'tip', 'mnemonic'] as const) if (!merged[f] && input[f]) merged[f] = input[f];
    if (!merged.definition && input.definition) {
      merged.definition = input.definition;
      merged.needsDetails = false;
    }
    await saveLocal(noteSync, merged);
    return { note: merged, created: false };
  }

  const { stableSeed, ...fields } = input;
  const tip = collocationTip(fields.tip);
  const note: VocabNote = {
    ...fields,
    id: stableSeed ? await stableId(`note:${stableSeed}`) : crypto.randomUUID(),
    key,
    family: fields.family ?? [],
    collocations: fields.collocations ?? (tip ? [`${tip.base} ${tip.prep}`] : []),
    synonymLadder: fields.synonymLadder ?? [],
    status: opts.known ? 'known' : (fields.status ?? 'active'),
    isLeech: false,
    createdAt: createdAt.toISOString(),
    updatedAt: iso,
  };
  await saveLocal(noteSync, note);
  if (opts.known) {
    await saveLocal(cardSync, await knownCheckCard(note.id, createdAt));
    return { note, created: true };
  }
  for (const type of cardTypesFor(note)) {
    const card = newCard(note.id, type, createdAt);
    if (stableSeed) card.id = await stableId(`card:${stableSeed}:${type}`);
    await saveLocal(cardSync, card);
  }
  return { note, created: true };
}

/**
 * "Already know" (SPEC § 6.5): one recognition card, treated as reviewed today with a 30-day
 * interval, so it comes back once as a check in 30 days.
 */
export async function knownCheckCard(noteId: string, now: Date): Promise<VocabCard> {
  const settings = await loadEnglishSettings();
  const card: VocabCard = {
    ...newCard(noteId, 'recognition', now),
    state: 'review',
    stability: KNOWN_CHECK_DAYS,
    difficulty: 5,
    due: new Date(now.getTime() + KNOWN_CHECK_DAYS * 86_400_000).toISOString(),
    lastReview: now.toISOString(),
    scheduledDays: KNOWN_CHECK_DAYS,
    reps: 1,
    lastGrade: 3, // no introducedAt: a known word does not use up today's new-word cap
  };
  return settings.scheduler === 'ladder' ? toLadder(card, settings.maxIntervalDays) : card;
}
export const KNOWN_CHECK_DAYS = 30;

// ---------- Grading and undo ----------

export interface UndoSnapshot {
  cardBefore: VocabCard;
  noteBefore: VocabNote;
  log: ReviewLog;
}

async function refreshNote(note: VocabNote, cards: VocabCard[]): Promise<VocabNote> {
  const active = cards.filter((c) => !c.deletedAt);
  const frozen = isFrozen(active);
  const next: VocabNote = {
    ...note,
    isLeech: active.some((c) => c.isLeech && !c.suspended),
    frozenAt: frozen ? (note.frozenAt ?? new Date().toISOString()) : undefined,
    updatedAt: new Date().toISOString(),
  };
  if (next.isLeech !== note.isLeech || next.frozenAt !== note.frozenAt) await saveLocal(noteSync, next);
  return next;
}

export async function gradeCard(cardId: string, grade: Grade, durationMs: number, now = new Date()): Promise<{ undo: UndoSnapshot; card: VocabCard; froze: boolean }> {
  const settings = await loadEnglishSettings();
  const cardBefore = (await cardsTable.get(cardId))!;
  const noteBefore = (await notesTable.get(cardBefore.noteId))!;
  const { card, log } = review(cardBefore, grade, now, schedulerConfig(settings), durationMs);
  await saveLocal(cardSync, card);
  await saveLocal(logSync, log);
  const siblings = (await cardsTable.where('noteId').equals(card.noteId).toArray()).map((c) => (c.id === card.id ? card : c));
  const note = await refreshNote(noteBefore, siblings);
  await afterGrade(note, siblings, card, grade);
  return { undo: { cardBefore, noteBefore, log }, card, froze: !noteBefore.frozenAt && !!note.frozenAt };
}

/** One-level undo: the card and note come back exactly as they were; the log row is withdrawn. */
export async function undoGrade(u: UndoSnapshot): Promise<void> {
  const iso = new Date().toISOString();
  await saveLocal(cardSync, { ...u.cardBefore, updatedAt: iso });
  await saveLocal(noteSync, { ...u.noteBefore, updatedAt: iso });
  await saveLocal(logSync, { ...u.log, deletedAt: iso, updatedAt: iso });
}

// ---------- Word sheet actions ----------

export async function updateNote(note: VocabNote, patch: Partial<VocabNote>): Promise<void> {
  await saveLocal(noteSync, { ...note, ...patch, updatedAt: new Date().toISOString() });
}

export async function setNoteSuspended(note: VocabNote, suspended: boolean): Promise<void> {
  await updateNote(note, { status: suspended ? 'suspended' : 'active' });
}

/** Reset: every card of the note becomes new again (history stays in the log). */
export async function resetNote(note: VocabNote): Promise<void> {
  const now = new Date();
  for (const c of await cardsTable.where('noteId').equals(note.id).toArray()) {
    if (c.deletedAt) continue;
    await saveLocal(cardSync, { ...newCard(note.id, c.type, now), id: c.id, suspended: c.suspended });
  }
  await updateNote(note, { frozenAt: undefined, isLeech: false });
}

/** Delete a note: soft-deletes it, its cards and its logs (stats drop its reviews, SPEC § 13). */
export async function deleteNote(note: VocabNote): Promise<void> {
  const iso = new Date().toISOString();
  for (const c of await cardsTable.where('noteId').equals(note.id).toArray()) await saveLocal(cardSync, { ...c, deletedAt: iso, updatedAt: iso });
  for (const l of await logsTable.where('noteId').equals(note.id).toArray()) await saveLocal(logSync, { ...l, deletedAt: iso, updatedAt: iso });
  await saveLocal(noteSync, { ...note, deletedAt: iso, updatedAt: iso });
}

export async function setCardSuspended(card: VocabCard, suspended: boolean): Promise<void> {
  await saveLocal(cardSync, { ...card, suspended, updatedAt: new Date().toISOString() });
}


// ---------- Streak ----------

const shiftDay = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Days in a row with the minimum day met, ending today (or yesterday, if today is still open). */
export function streakLength(done: Set<string>, today: string): number {
  let day = done.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (done.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

export const STREAK_MILESTONES = [30, 100];
export const FROZEN_MILESTONES = [100, 250, 500, 1000];
