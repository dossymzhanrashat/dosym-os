import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { answerFormat, checkAnswer, extractJson, fixUpMessage, optText } from './bridge';

const job = {
  schema: z.object({ items: z.array(z.object({ word: z.string().min(1), level: z.enum(['B2', 'C1']), note: optText() })) }),
  describe: (d: { items: unknown[] }) => `${d.items.length} items`,
};

describe('extractJson', () => {
  it('reads plain JSON, a fenced block, or JSON with a sentence around it', () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('Here you go:\n```json\n{"a":2}\n```\nHope it helps')).toEqual({ ok: true, value: { a: 2 } });
    expect(extractJson('Sure! {"a":3} Done.')).toEqual({ ok: true, value: { a: 3 } });
  });

  it('explains empty, missing and broken JSON', () => {
    expect(extractJson('  ').ok).toBe(false);
    expect(extractJson('no json here')).toMatchObject({ ok: false, problem: expect.stringMatching(/could not find/) });
    expect(extractJson('{"items": [ {"word": "x"')).toMatchObject({ ok: false, problem: expect.stringMatching(/could not find|broken/) });
    expect(extractJson('{"items": [1,]}')).toMatchObject({ ok: false, problem: expect.stringMatching(/broken/) });
  });
});

describe('checkAnswer', () => {
  it('passes a valid answer, turning null optional fields into undefined', () => {
    const r = checkAnswer(job, '{"items":[{"word":"mitigate","level":"C1","note":null}]}');
    expect(r).toEqual({ ok: true, data: { items: [{ word: 'mitigate', level: 'C1', note: undefined }] }, summary: '1 items' });
  });

  it('lists every problem with its path and saves nothing', () => {
    const r = checkAnswer(job, '{"items":[{"word":"","level":"C1"},{"word":"x","level":"Z9"}]}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/^items\[0\]\.word: /);
    expect(r.problems[1]).toMatch(/^items\[1\]\.level: /);
  });

  it('shows Claude’s own error message', () => {
    expect(checkAnswer(job, '{"error":"chat search is off"}')).toEqual({ ok: false, problems: ['Claude says: “chat search is off”'] });
  });

  it('runs the job’s extra checks after the schema', () => {
    const r = checkAnswer({ ...job, check: () => ['id "s9" was not in my list'] }, '{"items":[]}');
    expect(r).toEqual({ ok: false, problems: ['id "s9" was not in my list'] });
  });
});

describe('prompt text', () => {
  it('prints the exact JSON schema and an example', () => {
    const text = answerFormat(job.schema, { items: [{ word: 'w', level: 'B2' }] });
    expect(text).toMatch(/"enum": \[\s*"B2",\s*"C1"\s*\]/);
    expect(text).toContain('"required"');
    expect(text).toContain('{"items":[{"word":"w","level":"B2"}]}');
    expect(fixUpMessage(['a: bad'])).toContain('- a: bad');
  });
});
