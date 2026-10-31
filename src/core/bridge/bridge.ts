import { z } from 'zod';

/*
 * Claude Bridge (WEB EDITION): there is no API key in the browser, so every AI job is a round trip
 * through the user's Claude Pro chat. A job holds the prompt (task + data as text + the exact JSON
 * schema), the zod schema the answer must match, and what to do with a valid answer.
 * An invalid answer is never saved: the sheet lists what is wrong instead.
 */

export interface BridgeJob<T> {
  /** Stable id, e.g. "english.extract-vocab.chats". */
  id: string;
  /** Sheet title. */
  title: string;
  /** One or two sentences for the top of the sheet: what Claude will do and what gets saved. */
  intro: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Checks the schema cannot express (ids must come from the request, no duplicates, …). */
  check?: (data: T) => string[];
  /** What a valid answer will save, e.g. "12 words for your inbox". */
  describe: (data: T) => string;
  /** Saves a valid answer and returns a short confirmation. */
  save: (data: T) => Promise<string>;
  /** Plain-words help for an {"error": "…"} answer, e.g. how to switch on chat search. */
  explainError?: (message: string) => string | undefined;
}

/** Any job, for state that holds whichever job the user opened. */
export type AnyBridgeJob = BridgeJob<any>;

export const CLAUDE_NEW_CHAT = 'https://claude.ai/new';

/** The exact JSON Schema for a zod schema, as pasted into prompts. */
export function jsonSchemaText(schema: z.ZodType): string {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return JSON.stringify(rest, null, 1);
}

/** The closing block every prompt shares: answer format, then the schema. */
export function answerFormat(schema: z.ZodType, example: unknown): string {
  return [
    '## How to answer',
    'Reply with ONLY one JSON object: no text before or after it, no Markdown code fences, no comments.',
    'It must match this JSON Schema exactly (my app checks it and rejects anything else):',
    jsonSchemaText(schema),
    'Example of the shape (values are only illustrations):',
    JSON.stringify(example),
  ].join('\n\n');
}

export type ParsedJson = { ok: true; value: unknown } | { ok: false; problem: string };

/**
 * Finds the JSON in what was pasted. Tolerates a ```json fence or a sentence around it, because
 * Claude's Copy button sometimes includes them; the content itself is still checked strictly.
 */
export function extractJson(text: string): ParsedJson {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, problem: 'Nothing pasted yet.' };
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced && fenced[1].includes('{') ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) return { ok: false, problem: 'I could not find a JSON object in what you pasted. Copy Claude’s whole answer, starting with {.' };
  try {
    return { ok: true, value: JSON.parse(body.slice(start, end + 1)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, problem: `The JSON is broken (${msg}). It may be cut off: ask Claude to send it again in full.` };
  }
}

/** "items[3].cefr: Invalid option…" — one readable line per zod issue. */
export function describeIssues(error: z.ZodError, max = 8): string[] {
  const lines = error.issues.map((i) => {
    const path = i.path.reduce<string>((s, p) => (typeof p === 'number' ? `${s}[${p}]` : s ? `${s}.${String(p)}` : String(p)), '');
    return `${path || 'answer'}: ${i.message}`;
  });
  return lines.length > max ? [...lines.slice(0, max), `…and ${lines.length - max} more`] : lines;
}

export type CheckResult<T> =
  | { ok: true; data: T; summary: string }
  /** `claudeError`: Claude answered {"error": "…"} — it could not do the job, so there is nothing to fix in the JSON. */
  | { ok: false; problems: string[]; claudeError?: string };

/** Parse + zod + the job's own checks. Pure, so it is unit-tested. */
export function checkAnswer<T>(job: Pick<BridgeJob<T>, 'schema' | 'check' | 'describe' | 'explainError'>, text: string): CheckResult<T> {
  const parsed = extractJson(text);
  if (!parsed.ok) return { ok: false, problems: [parsed.problem] };
  const v = parsed.value as Record<string, unknown> | null;
  if (v && typeof v === 'object' && typeof v.error === 'string' && Object.keys(v).length === 1) {
    const help = job.explainError?.(v.error);
    return { ok: false, problems: [`Claude says: “${v.error}”`, ...(help ? [help] : [])], claudeError: v.error };
  }
  const result = job.schema.safeParse(parsed.value);
  if (!result.success) return { ok: false, problems: describeIssues(result.error) };
  const extra = job.check?.(result.data) ?? [];
  if (extra.length) return { ok: false, problems: extra };
  return { ok: true, data: result.data, summary: job.describe(result.data) };
}

/** A message to send back to Claude when its answer did not pass. */
export function fixUpMessage(problems: string[]): string {
  return ['My app rejected your JSON. Problems found:', ...problems.map((p) => `- ${p}`), '', 'Please send the corrected JSON object only, with nothing before or after it.'].join('\n');
}

/** Optional string field that also accepts null (Claude often writes null for "unknown"). */
export const optText = () =>
  z
    .string()
    .nullish()
    .transform((v) => (v == null || !v.trim() ? undefined : v.trim()));
