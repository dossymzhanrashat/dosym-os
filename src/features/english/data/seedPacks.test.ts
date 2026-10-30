import { describe, expect, it } from 'vitest';
import type { VocabNote } from '../model/types';
import { SEED_PACKS } from './seedPacks';
import { cardTypesFor, collocationTip, noteKey } from './store';

const pack = (id: string) => SEED_PACKS.find((p) => p.id === id)!;
const asNote = (n: (typeof SEED_PACKS)[number]['notes'][number]) => ({ ...n, synonymLadder: n.synonymLadder ?? [] }) as Pick<VocabNote, 'kind' | 'examples' | 'synonymLadder' | 'tip'>;

describe('Perspectives Word Kit', () => {
  const notes = pack('perspectives').notes;

  it('has 37 notes, each with Kazakh and Russian glosses and an example', () => {
    expect(notes).toHaveLength(37);
    for (const n of notes) {
      expect(n.glossKK?.trim()).toBeTruthy();
      expect(n.glossRU?.trim()).toBeTruthy();
      expect(n.examples[0].text).toBeTruthy();
    }
  });

  it('gives every note its own dedupe key', () => {
    const keys = notes.map((n) => noteKey(n.headword, n.pos, n.kind));
    expect(new Set(keys).size).toBe(37);
    expect(keys).toContain('amplify|v');
    expect(keys).toContain('indispensable to|col');
  });

  it('turns tips into cards: "Collocation: susceptible TO" → collocation card, "Spelling:" → spelling card', () => {
    const susceptible = notes.find((n) => n.headword === 'susceptible')!;
    expect(collocationTip(susceptible.tip)).toEqual({ base: 'susceptible', prep: 'to' });
    expect(cardTypesFor(asNote(susceptible))).toContain('collocation');
    const idleness = notes.find((n) => n.headword === 'idleness')!;
    expect(cardTypesFor(asNote(idleness))).toContain('spelling');
    const amplify = notes.find((n) => n.headword === 'amplify')!;
    expect(cardTypesFor(asNote(amplify))).toEqual(['recognition', 'production', 'cloze', 'listening']);
  });

  it('every example contains its target, so cloze cards can blank it', () => {
    for (const n of notes) expect(n.examples[0].text.toLowerCase()).toContain(n.examples[0].target!.toLowerCase());
  });
});

describe('other packs', () => {
  it('spelling bank has the 8 words from the plan, dictation only', () => {
    const notes = pack('spelling').notes;
    expect(notes.map((n) => n.headword)).toEqual(['accommodation', 'environment', 'Wednesday', 'February', 'necessary', 'government', 'library', 'questionnaire']);
    expect(cardTypesFor(asNote(notes[0]))).toEqual(['spelling']);
  });

  it('linking devices: 10 jobs as basic → high-level ladders', () => {
    const notes = pack('linking').notes;
    expect(notes).toHaveLength(10);
    const contrast = notes.find((n) => n.headword === 'Contrast')!;
    expect(contrast.synonymLadder!.filter((r) => r.band === 6).map((r) => r.word)).toEqual(['But', 'however']);
    expect(contrast.synonymLadder!.filter((r) => r.band === 8)).toHaveLength(5);
    expect(cardTypesFor(asNote(contrast))).toEqual(['synonymLadder']);
  });
});
