import { saveLocal } from '../../../core/db/sync';
import { saveSetting } from '../../../core/planner/store';
import { db } from '../../../core/db/db';
import type { EnrichItem, ExtractItem } from '../bridge/schemas';
import { findTarget } from '../capture/text';
import type { Candidate, CandidateDecision, CandidateItem, SourceRef, VocabNote } from '../model/types';
import { candidateSync, candidatesTable, notesTable } from './db';
import { addNote, deleteNote, noteKey, updateNote, type NoteInput } from './store';

/*
 * The triage inbox (SPEC § 3.3, § 6.5): every import path (Claude chat search, Claude export,
 * share, photo scan, topic packs) ends here as Candidate rows, de-duplicated against notes and
 * earlier candidates. Skipped candidates stay as rows, so their key is never suggested again.
 */

// ---------- Keys already seen ----------

const base = (key: string) => key.split('|')[0];
const isMulti = (key: string) => /\|(col|phrase)$/.test(key);

export interface SeenKeys {
  keys: Set<string>;
  /** Single-word lemmas, matched without part of speech ("amplify" blocks "amplify|v" and "amplify|x"). */
  lemmas: Set<string>;
}

/** Notes (deleted ones too) and every candidate ever made, including skipped ones. */
export async function seenKeys(): Promise<SeenKeys> {
  const keys = new Set<string>();
  for (const n of await notesTable.toArray()) keys.add(n.key);
  for (const c of await candidatesTable.toArray()) if (!c.deletedAt || c.decision === 'skip') keys.add(c.key);
  return { keys, lemmas: new Set([...keys].filter((k) => !isMulti(k)).map(base)) };
}

export function isSeen(key: string, seen: SeenKeys): boolean {
  return seen.keys.has(key) || (!isMulti(key) && seen.lemmas.has(base(key)));
}

// ---------- Adding ----------

export function itemFromExtract(x: ExtractItem | EnrichItem): CandidateItem {
  return {
    headword: x.headword,
    lemma: x.lemma,
    kind: x.kind,
    pos: x.pos,
    cefr: x.cefr,
    ieltsTopic: x.ieltsTopic,
    definition: x.definition,
    glossKK: x.glossKK,
    glossRU: x.glossRU,
    ipa: x.ipa,
    exampleText: x.exampleText,
    exampleTarget: x.exampleTarget,
    exampleGenerated: 'exampleSource' in x && x.exampleSource === 'generated' ? true : undefined,
    family: x.family,
    collocations: x.collocations,
    synonymLadder: x.synonymLadder,
    usefulness: 'usefulness' in x ? x.usefulness : undefined,
  };
}

/** The exact words to blank must be inside the example; otherwise find them, or drop the hint. */
function withTarget(item: CandidateItem): CandidateItem {
  if (!item.exampleText) return { ...item, exampleTarget: undefined };
  const ok = item.exampleTarget && item.exampleText.toLowerCase().includes(item.exampleTarget.toLowerCase());
  return ok ? item : { ...item, exampleTarget: findTarget(item.exampleText, item.headword) };
}

export const candidateKey = (item: CandidateItem) => noteKey(item.headword, item.pos, item.kind);

export interface AddResult {
  added: number;
  duplicates: number;
}

export async function addCandidates(list: { item: CandidateItem; source: SourceRef }[], importId?: string): Promise<AddResult> {
  const seen = await seenKeys();
  const iso = new Date().toISOString();
  let added = 0;
  for (const { item, source } of list) {
    const clean = withTarget(item);
    const key = candidateKey(clean);
    if (!clean.headword.trim() || isSeen(key, seen)) continue;
    seen.keys.add(key);
    if (!isMulti(key)) seen.lemmas.add(base(key));
    const c: Candidate = { id: crypto.randomUUID(), key, item: clean, source, importId, createdAt: iso, updatedAt: iso };
    await saveLocal(candidateSync, c);
    added++;
  }
  return { added, duplicates: list.length - added };
}

// ---------- Triage ----------

export function noteInputFrom(item: CandidateItem, source: SourceRef): NoteInput {
  const text = item.exampleText?.trim();
  return {
    kind: item.kind,
    headword: item.headword.trim(),
    lemma: (item.lemma ?? item.headword).trim().toLowerCase(),
    pos: item.pos,
    ipa: item.ipa,
    cefr: item.cefr,
    ieltsTopic: item.ieltsTopic,
    definition: item.definition?.trim() ?? '',
    glossKK: item.glossKK,
    glossRU: item.glossRU,
    examples: [
      ...(text ? [{ text, target: item.exampleTarget ?? findTarget(text, item.headword), source }] : []),
      ...(item.moreExamples ?? []).map((e) => ({
        text: e.text,
        target: e.target ?? findTarget(e.text, item.headword),
        source: { ...source, title: e.title ?? source.title, conversationId: e.conversationId ?? source.conversationId, date: e.date ?? source.date },
      })),
    ].slice(0, 5),
    family: item.family,
    collocations: item.collocations,
    synonymLadder: item.synonymLadder,
    source,
    needsDetails: !item.definition?.trim(),
  };
}

export interface TriageUndo {
  before: Candidate;
  createdNote?: VocabNote;
}

/** Keep → a note with its cards; Already know → a known note with one check in 30 days. */
export async function decide(c: Candidate, decision: CandidateDecision, edited?: CandidateItem): Promise<TriageUndo> {
  const item = edited ? withTarget(edited) : c.item;
  let createdNote: VocabNote | undefined;
  if (decision === 'keep' || decision === 'known') {
    const res = await addNote(noteInputFrom(item, c.source), new Date(), { known: decision === 'known' });
    if (res.created) createdNote = res.note;
  }
  const iso = new Date().toISOString();
  await saveLocal(candidateSync, { ...c, item, key: candidateKey(item), decision, decidedAt: iso, updatedAt: iso });
  return { before: c, createdNote };
}

/** One-level undo of a swipe: the candidate goes back on the stack; a note it created is removed. */
export async function undoDecision(u: TriageUndo): Promise<void> {
  if (u.createdNote) {
    const note = await notesTable.get(u.createdNote.id);
    if (note) await deleteNote(note);
  }
  await saveLocal(candidateSync, { ...u.before, updatedAt: new Date().toISOString() });
}

/** Inbox order: undecided by usefulness, then the "later" ones in the order they were put back. */
export function inboxOrder(cands: Candidate[]): Candidate[] {
  const open = cands.filter((c) => !c.deletedAt && !c.decision).sort((a, b) => (b.item.usefulness ?? 0.5) - (a.item.usefulness ?? 0.5) || a.createdAt.localeCompare(b.createdAt));
  const later = cands.filter((c) => !c.deletedAt && c.decision === 'later').sort((a, b) => (a.decidedAt ?? '').localeCompare(b.decidedAt ?? ''));
  return [...open, ...later];
}

// ---------- Details from Claude ----------

const fill = <T,>(a: T | undefined, b: T | undefined) => (a === undefined || a === '' ? b : a);

/** Bare candidates (picked from the export, shared, scanned) get definitions and glosses. */
export async function enrichCandidates(items: EnrichItem[]): Promise<number> {
  let n = 0;
  for (const x of items) {
    const c = await candidatesTable.get(x.id);
    if (!c) continue;
    const fresh = itemFromExtract(x);
    const item: CandidateItem = withTarget({
      ...fresh,
      exampleText: c.item.exampleText ?? fresh.exampleText,
      exampleTarget: c.item.exampleText ? fresh.exampleTarget ?? c.item.exampleTarget : fresh.exampleTarget,
      usefulness: c.item.usefulness,
    });
    await saveLocal(candidateSync, { ...c, item, key: candidateKey(item), updatedAt: new Date().toISOString() });
    n++;
  }
  return n;
}

/** Notes marked "Needs details": fill empty fields only; the headword and schedule stay. */
export async function enrichNotes(items: EnrichItem[]): Promise<number> {
  let n = 0;
  for (const x of items) {
    const note = await notesTable.get(x.id);
    if (!note || note.deletedAt) continue;
    const upgraded = x.headword.trim().toLowerCase() !== note.headword.trim().toLowerCase() ? [x.headword.trim()] : [];
    await updateNote(note, {
      definition: note.definition || x.definition,
      pos: fill(note.pos, x.pos),
      ipa: fill(note.ipa, x.ipa),
      cefr: fill(note.cefr, x.cefr),
      ieltsTopic: fill(note.ieltsTopic, x.ieltsTopic),
      glossKK: fill(note.glossKK, x.glossKK),
      glossRU: fill(note.glossRU, x.glossRU),
      family: note.family.length ? note.family : x.family,
      collocations: [...new Set([...note.collocations, ...upgraded, ...x.collocations])],
      synonymLadder: note.synonymLadder.length ? note.synonymLadder : x.synonymLadder,
      needsDetails: false,
    });
    n++;
  }
  return n;
}

export const needsDetails = (c: Candidate) => !c.item.definition?.trim();

// ---------- Import history and export state ----------

export const IMPORT_HISTORY = 'english:imports';
export const EXPORT_STATE = 'english:exportState';

export interface ImportRecord {
  id: string;
  at: string;
  kind: 'claudeChats' | 'claudeExport' | 'share' | 'ocr' | 'topicPack' | 'details';
  label: string;
  added: number;
  duplicates: number;
}

export interface ExportState {
  processed: Record<string, string>; // conversation id → updated_at
  lastImportAt?: string;
}
export const EMPTY_EXPORT_STATE: ExportState = { processed: {} };
export const EMPTY_HISTORY: ImportRecord[] = [];

async function getSettingValue<T>(id: string, fallback: T): Promise<T> {
  const row = await db.settings.get(id);
  return row && !row.deletedAt ? (row.value as T) : fallback;
}

export async function logImport(r: Omit<ImportRecord, 'id' | 'at'>): Promise<ImportRecord> {
  const rec: ImportRecord = { ...r, id: crypto.randomUUID(), at: new Date().toISOString() };
  const history = await getSettingValue<ImportRecord[]>(IMPORT_HISTORY, []);
  await saveSetting(IMPORT_HISTORY, [rec, ...history].slice(0, 40));
  return rec;
}

export async function loadExportState(): Promise<ExportState> {
  return getSettingValue(EXPORT_STATE, EMPTY_EXPORT_STATE);
}

export async function markProcessed(processed: Record<string, string>): Promise<void> {
  const state = await loadExportState();
  await saveSetting(EXPORT_STATE, { processed: { ...state.processed, ...processed }, lastImportAt: new Date().toISOString() } satisfies ExportState);
}
