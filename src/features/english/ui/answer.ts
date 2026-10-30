import type { Grade } from '../model/types';

// Typed answers (SPEC § 7): exact → Good, one-letter typo → Hard, otherwise Again. The user can override.

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’']/g, "'");

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function gradeTyped(typed: string, answer: string): Grade {
  const d = editDistance(norm(typed), norm(answer));
  return d === 0 ? 3 : d === 1 ? 2 : 1;
}

/** Letter-by-letter comparison for the spelling card: which typed letters are wrong. */
export function letterDiff(typed: string, answer: string): { ch: string; ok: boolean }[] {
  const t = typed.trim();
  const a = answer.trim();
  return [...t].map((ch, i) => ({ ch, ok: (a[i] ?? '').toLowerCase() === ch.toLowerCase() }));
}

/** "The debate continues unabated." with target "unabated" → before / target / after for highlighting or blanking. */
export function splitTarget(text: string, target?: string): [string, string, string] | null {
  if (!target) return null;
  const i = text.toLowerCase().indexOf(target.toLowerCase());
  if (i < 0) return null;
  return [text.slice(0, i), text.slice(i, i + target.length), text.slice(i + target.length)];
}
