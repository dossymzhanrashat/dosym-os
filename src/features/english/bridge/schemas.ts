import { z } from 'zod';
import { optText } from '../../../core/bridge/bridge';

/*
 * JSON schemas for the English Bridge jobs (SPEC § 12, Relay replaced by the Claude Bridge).
 * The same zod schema is printed into the prompt (as JSON Schema) and checks the pasted answer.
 */

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export const IELTS_TOPICS = [
  'education',
  'technology',
  'environment',
  'health',
  'work and economy',
  'crime and law',
  'globalisation',
  'media and advertising',
  'urbanisation and transport',
  'culture and tourism',
  'government and spending',
  'science and space',
  'family and society',
  'sport and leisure',
  'ageing population',
  'energy',
] as const;

const rung = z.object({ band: z.number().min(4).max(9), word: z.string().trim().min(1), note: optText() });

/** Fields every extract-vocab / enrich item shares. */
const details = {
  headword: z.string().trim().min(1).max(80),
  lemma: optText(),
  kind: z.enum(['word', 'collocation', 'phrase']),
  pos: optText(),
  cefr: z.enum(CEFR).nullish().transform((v) => v ?? undefined),
  ieltsTopic: optText(),
  definition: z.string().trim().min(1).max(300),
  glossKK: optText(),
  glossRU: optText(),
  ipa: optText(),
  family: z.array(z.string()).nullish().transform((v) => v ?? []),
  collocations: z.array(z.string()).nullish().transform((v) => v ?? []),
  synonymLadder: z.array(rung).nullish().transform((v) => v ?? []),
};

/** /ai/extract-vocab response item (SPEC § 12.1), plus where it came from for chat search. */
export const extractItemSchema = z.object({
  ...details,
  exampleSentenceID: optText(),
  exampleText: z.string().trim().min(1).max(500),
  exampleTarget: optText(),
  exampleSource: z.enum(['chat', 'generated']).nullish().transform((v) => v ?? undefined),
  sourceTitle: optText(),
  sourceDate: optText(),
  usefulness: z.number().min(0).max(1),
});
export const extractVocabSchema = z.object({ items: z.array(extractItemSchema).max(60) });
export type ExtractVocab = z.infer<typeof extractVocabSchema>;
export type ExtractItem = z.infer<typeof extractItemSchema>;

/** /ai/enrich-word, batched: one item per requested id; Claude may upgrade a word to its collocation. */
export const enrichItemSchema = z.object({ id: z.string().min(1), ...details, exampleText: optText(), exampleTarget: optText() });
export const enrichSchema = z.object({ items: z.array(enrichItemSchema).max(60) });
export type Enrich = z.infer<typeof enrichSchema>;
export type EnrichItem = z.infer<typeof enrichItemSchema>;

/** /ai/grade-sentence, batched (SPEC § 12.3). */
export const gradeResultSchema = z.object({
  id: z.string().min(1),
  usedCorrectly: z.boolean(),
  naturalness: z.number().int().min(0).max(3),
  corrected: z.string().trim().min(1),
  errors: z.array(z.object({ span: z.string(), type: z.string(), explanation: z.string() })).nullish().transform((v) => v ?? []),
  suggestedGrade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  tip: optText(),
});
export const gradeBatchSchema = z.object({ results: z.array(gradeResultSchema).max(20) });
export type GradeBatch = z.infer<typeof gradeBatchSchema>;

/** /ai/mnemonic (SPEC § 12.4). */
export const mnemonicSchema = z.object({
  mnemonic: z
    .string()
    .trim()
    .min(1)
    .refine((s) => s.split(/\s+/).length <= 40, 'at most 40 words'),
  soundAlike: z.object({ lang: z.enum(['kk', 'ru', 'none']), word: optText() }),
  imagePrompt: z.string().trim().min(1),
});
export type Mnemonic = z.infer<typeof mnemonicSchema>;

/** Ids in an answer must come from the request, once each; every requested id must be answered. */
export function idProblems(answered: string[], requested: string[], label: string, requireAll = true): string[] {
  const asked = new Set(requested);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const id of answered) {
    if (!asked.has(id)) problems.push(`${label} "${id}" was not in my list`);
    else if (seen.has(id)) problems.push(`${label} "${id}" appears twice`);
    seen.add(id);
  }
  if (requireAll) for (const id of requested) if (!seen.has(id)) problems.push(`${label} "${id}" is missing`);
  return problems;
}
