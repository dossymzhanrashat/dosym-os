/*
 * Text clean-up for capture (SPEC § 6.1 step 5), all in the browser: nothing here leaves the device.
 * Code blocks, inline code, URLs, e-mails and number-only lines are removed; text is split into
 * sentences; only sentences that look English are kept (Kazakh and Russian are dropped).
 */

const CYRILLIC = /[Ѐ-ӿ]/;
const WORD = /[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/g;

/** Removes the parts of a chat message that are not prose. */
export function stripNoise(text: string): string {
  return (
    text
      .replace(/```[\s\S]*?(```|$)/g, ' ') // fenced code (also an unclosed one at the end)
      .replace(/~~~[\s\S]*?(~~~|$)/g, ' ')
      .replace(/`[^`\n]*`/g, ' ') // inline code
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ')
      .split('\n')
      // number-only lines, table rules, and lines that look like code (lots of symbols)
      .filter((line) => {
        const t = line.trim();
        if (!t || /^[\d\s.,:;%/+\-–—()$€£₸]+$/.test(t) || /^\|?[\s:|-]+\|?$/.test(t)) return false;
        const symbols = (t.match(/[{}[\]<>=;$\\_|]/g) ?? []).length;
        return symbols / t.length < 0.08;
      })
      .map((line) => line.replace(/^\s*(?:[#>*+-]+|\d+[.)])\s+/, '').replace(/[*_|]+/g, ' '))
      .join('\n')
  );
}

/** Sentences, one per line break or sentence end. Uses Intl.Segmenter where the browser has it. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'sentence' }) : null;
  for (const block of text.split(/\n+/)) {
    const b = block.replace(/\s+/g, ' ').trim();
    if (!b) continue;
    const parts = seg ? [...seg.segment(b)].map((s) => s.segment) : b.split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
    for (const p of parts) if (p.trim()) out.push(p.trim());
  }
  return out;
}

export function words(sentence: string): string[] {
  return sentence.match(WORD) ?? [];
}

/**
 * How English a sentence looks, 0–1: the share of its words that are known English word forms
 * (the common-word lists). Any Cyrillic letter (Kazakh, Russian) gives 0.
 */
export function englishScore(sentence: string, isKnownForm: (w: string) => boolean): number {
  if (CYRILLIC.test(sentence)) return 0;
  const ws = words(sentence);
  if (ws.length < 3) return 0;
  return ws.filter((w) => isKnownForm(w.toLowerCase().replace(/’/g, "'"))).length / ws.length;
}

/** English prose usually has 80–95% common words; 0.6 leaves room for advanced vocabulary. */
export const ENGLISH_MIN = 0.6;

/** English sentences of a text, cleaned and de-duplicated. */
export function englishSentences(text: string, isKnownForm: (w: string) => boolean): string[] {
  const seen = new Set<string>();
  return splitSentences(stripNoise(text)).filter((s) => {
    if (s.length > 400 || seen.has(s)) return false;
    seen.add(s);
    return englishScore(s, isKnownForm) >= ENGLISH_MIN;
  });
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A pattern for one word and its inflections: "pose" also matches "posed", "poses", "posing". */
function formPattern(w: string): string {
  const t = w.toLowerCase();
  if (t.length <= 2) return esc(t);
  if (t.endsWith('y')) return `${esc(t.slice(0, -1))}(?:y|ies|ied|ying)`;
  if (t.endsWith('e')) return `${esc(t.slice(0, -1))}(?:e|es|ed|ing)`;
  return `${esc(t)}(?:${esc(t.at(-1)!)}?(?:ed|ing|er)|s|es|d)?`;
}

/**
 * The exact words of `headword` inside `sentence`, so the cloze card can blank them:
 * "pose a threat to" in "Salinity posed a serious threat to wells" → "posed a serious threat to".
 * Up to two extra words may sit between the parts.
 */
export function findTarget(sentence: string, headword: string): string | undefined {
  const parts = headword
    .toLowerCase()
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p && !['a', 'an', 'the', 'sth', 'something', 'sb', 'someone'].includes(p));
  if (!parts.length) return undefined;
  const gap = String.raw`(?:\s+[\p{L}'’-]+){0,2}?\s+`;
  const re = new RegExp(`(?<![\\p{L}])${parts.map(formPattern).join(gap)}(?![\\p{L}])`, 'iu');
  return sentence.match(re)?.[0];
}
