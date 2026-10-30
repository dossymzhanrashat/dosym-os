import kitJson from '../../../../seed/perspectives-word-kit.json';
import { seedKitSchema } from '../model/schema';
import type { NoteKind } from '../model/types';
import { addNote, coarsePos, type NoteInput } from './store';

/*
 * Seed packs (SPEC § 6.4). The Perspectives Word Kit and the linking devices come from the user's
 * own kit (seed/perspectives-word-kit.json) and are used exactly as written; the spelling bank is
 * the list from the IELTS plan. Adding a pack twice adds nothing new (same keys, same ids).
 */

const kit = seedKitSchema.parse(kitJson);

export interface SeedPack {
  id: string;
  title: string;
  description: string;
  notes: NoteInput[];
}

const PREPOSITIONS = new Set(['to', 'with', 'in', 'for', 'of', 'on', 'at', 'about', 'from', 'by']);

/** "Indispensable to" → collocation; "To amplify" → word "amplify". */
function perspectivesNote(item: (typeof kit.perspectivesWordKit)[number], i: number): NoteInput {
  let headword = item.word.trim();
  const pos = item.pos.trim();
  if (/^to\s+/i.test(headword) && coarsePos(pos) === 'v') headword = headword.replace(/^to\s+/i, '');
  headword = headword[0].toLowerCase() + headword.slice(1);
  const parts = headword.split(/\s+/);
  const kind: NoteKind = parts.length > 1 && PREPOSITIONS.has(parts[parts.length - 1]) ? 'collocation' : 'word';
  const source = { kind: 'seed' as const, title: 'Perspectives Word Kit' };
  return {
    stableSeed: `perspectives:${i}:${headword}`,
    kind,
    headword,
    lemma: headword,
    pos,
    definition: item.definition,
    glossRU: item.ru,
    glossKK: item.kk,
    examples: [{ text: item.example, target: item.exampleTarget, source }],
    tip: item.tip || undefined,
    source,
    packId: 'perspectives',
  };
}

const SPELLING_BANK = ['accommodation', 'environment', 'Wednesday', 'February', 'necessary', 'government', 'library', 'questionnaire'];

export const SEED_PACKS: SeedPack[] = [
  {
    id: 'perspectives',
    title: 'Perspectives Word Kit',
    description: `${kit.perspectivesWordKit.length} words with Kazakh and Russian glosses, examples and tips.`,
    notes: kit.perspectivesWordKit.map(perspectivesNote),
  },
  {
    id: 'spelling',
    title: 'Spelling bank',
    description: 'The words the IELTS plan says are often misspelled in Listening. Dictation cards.',
    notes: SPELLING_BANK.map((w) => ({
      stableSeed: `spelling:${w}`,
      kind: 'spelling',
      headword: w,
      lemma: w,
      definition: '',
      examples: [],
      source: { kind: 'seed', title: 'Spelling bank (IELTS plan)' },
      packId: 'spelling',
    })),
  },
  {
    id: 'linking',
    title: 'Linking devices',
    description: `${kit.linkingDevices.length} jobs, each a ladder from basic to high-level.`,
    notes: kit.linkingDevices.map((g) => ({
      stableSeed: `linking:${g.job}`,
      kind: 'phrase',
      headword: g.job,
      lemma: g.job.toLowerCase(),
      definition: `Linking devices for ${g.job.toLowerCase()}`,
      examples: [],
      synonymLadder: [...g.basic.map((word) => ({ band: 6, word })), ...g.highLevel.map((word) => ({ band: 8, word }))],
      source: { kind: 'seed', title: 'Linking devices kit' },
      packId: 'linking',
    })),
  },
];

/** Adds a pack. Notes get consecutive creation times so the New queue keeps the pack's order. */
export async function addPack(pack: SeedPack): Promise<{ added: number; existing: number }> {
  const base = Date.now();
  let added = 0;
  for (const [i, n] of pack.notes.entries()) {
    const { created } = await addNote(n, new Date(base + i));
    if (created) added++;
  }
  return { added, existing: pack.notes.length - added };
}
