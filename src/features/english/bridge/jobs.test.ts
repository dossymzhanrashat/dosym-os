import { describe, expect, it } from 'vitest';
import { checkAnswer } from '../../../core/bridge/bridge';
import type { UseItAnswer } from '../model/types';
import { enrichJob, explainChatSearchError, gradeJob } from './jobs';
import { extractVocabSchema, mnemonicSchema } from './schemas';

const answer = (id: string, sentence: string): UseItAnswer => ({
  id,
  cardId: 'c',
  noteId: 'n',
  target: 'susceptible to',
  definition: 'easily influenced or harmed by',
  prompt: 'about technology',
  sentence,
  writtenAt: '2026-10-31T10:00:00.000Z',
  updatedAt: '2026-10-31T10:00:00.000Z',
});

const result = (id: string, grade = 1) => ({
  id,
  usedCorrectly: grade > 1,
  naturalness: 1,
  corrected: 'Teenagers are susceptible to online advertising.',
  errors: [{ span: 'susceptible for', type: 'preposition', explanation: "susceptible takes 'to'" }],
  suggestedGrade: grade,
  tip: 'Collocation: highly susceptible to',
});

describe('grade-sentence batch', () => {
  const job = gradeJob([answer('a1', 'Teenagers are susceptible for online ads.'), answer('a2', 'Old phones are susceptible to viruses.')]);

  it('puts the sentences and the schema in the prompt, without internal ids', () => {
    expect(job.prompt).toContain('susceptible for online ads');
    expect(job.prompt).toContain('"u2"');
    expect(job.prompt).not.toContain('a1');
    expect(job.prompt).toContain('suggestedGrade');
  });

  it('accepts one result per sentence', () => {
    const r = checkAnswer(job, JSON.stringify({ results: [result('u1'), result('u2', 3)] }));
    expect(r.ok && r.summary).toBe('feedback on 2 sentences');
  });

  it('rejects missing, unknown and repeated ids, and out-of-range grades', () => {
    expect(checkAnswer(job, JSON.stringify({ results: [result('u1')] }))).toEqual({ ok: false, problems: ['id "u2" is missing'] });
    const bad = checkAnswer(job, JSON.stringify({ results: [result('u1'), result('u1'), result('u7')] }));
    expect(bad.ok === false && bad.problems).toEqual(['id "u1" appears twice', 'id "u7" was not in my list', 'id "u2" is missing']);
    expect(checkAnswer(job, JSON.stringify({ results: [result('u1', 5), result('u2')] })).ok).toBe(false);
  });
});

describe('enrich batch', () => {
  const job = enrichJob('candidates', [{ id: 'k1', headword: 'mitigate', context: 'Freezing can mitigate the problem.' }]);
  const item = { id: 'k1', headword: 'mitigate', kind: 'word', definition: 'to make something less harmful', glossKK: 'жеңілдету', glossRU: 'смягчать', cefr: 'C1' };

  it('accepts the details, with optional fields missing or null', () => {
    const r = checkAnswer(job, JSON.stringify({ items: [{ ...item, ipa: null, synonymLadder: null }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items[0]).toMatchObject({ ipa: undefined, synonymLadder: [], family: [] });
  });

  it('rejects an item without a definition or with a bad CEFR level', () => {
    expect(checkAnswer(job, JSON.stringify({ items: [{ ...item, definition: '' }] })).ok).toBe(false);
    expect(checkAnswer(job, JSON.stringify({ items: [{ ...item, cefr: 'C3' }] })).ok).toBe(false);
  });
});

describe('extract-vocab and mnemonic schemas', () => {
  it('needs an example sentence and a 0–1 usefulness', () => {
    const base = { headword: 'pose a threat to', kind: 'collocation', definition: 'to be a danger to', exampleText: 'Salinity poses a threat to wells.', usefulness: 0.8 };
    expect(extractVocabSchema.safeParse({ items: [base] }).success).toBe(true);
    expect(extractVocabSchema.safeParse({ items: [{ ...base, exampleText: '' }] }).success).toBe(false);
    expect(extractVocabSchema.safeParse({ items: [{ ...base, usefulness: 3 }] }).success).toBe(false);
  });

  it('limits a mnemonic to 40 words', () => {
    const ok = { mnemonic: 'A PIT you FALL into.', soundAlike: { lang: 'none', word: null }, imagePrompt: 'a pit under leaves' };
    expect(mnemonicSchema.safeParse(ok).success).toBe(true);
    expect(mnemonicSchema.safeParse({ ...ok, mnemonic: 'word '.repeat(41) }).success).toBe(false);
  });
});

describe('chat search turned off', () => {
  it('explains how to switch on chat search, and only for that error', () => {
    const r = checkAnswer({ schema: extractVocabSchema, describe: () => '', explainError: explainChatSearchError }, '{"error": "chat search is off"}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.claudeError).toBe('chat search is off');
    expect(r.problems[1]).toMatch(/Settings → Your Claude → “Search and reference chats” \(older layout: Settings → Memory\)/);
    expect(explainChatSearchError('something else went wrong')).toBeUndefined();
  });
});
