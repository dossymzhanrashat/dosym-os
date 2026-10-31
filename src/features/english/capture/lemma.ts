/*
 * Word lists and a small lemmatizer for the browser (no NLP library).
 *
 * wordlists.json = NGSL 1.2 (2,809 common lemmas) and NAWL 1.2 (959 academic lemmas), each line a
 * lemma followed by its inflected forms. By Browne, C., Culligan, B., and Phillips, J.,
 * https://www.newgeneralservicelist.com, licensed CC BY-SA 4.0. Credited on the Import page.
 */

export interface WordLists {
  ngsl: string[];
  nawl: string[];
}

export interface LemmaIndex {
  /** form → lemma for every listed form. */
  lemmaOf: Map<string, string>;
  common: Set<string>; // NGSL lemmas
  academic: Set<string>; // NAWL lemmas
}

export function buildIndex(lists: WordLists): LemmaIndex {
  const lemmaOf = new Map<string, string>();
  const common = new Set<string>();
  const academic = new Set<string>();
  const add = (lines: string[], into: Set<string>) => {
    for (const line of lines) {
      const [lemma, ...forms] = line.split(' ');
      into.add(lemma);
      for (const f of [lemma, ...forms]) if (!lemmaOf.has(f)) lemmaOf.set(f, lemma);
    }
  };
  add(lists.ngsl, common);
  add(lists.nawl, academic);
  return { lemmaOf, common, academic };
}

export async function loadIndex(): Promise<LemmaIndex> {
  const lists = (await import('./wordlists.json')).default as WordLists;
  return buildIndex(lists);
}

/** Function words and contractions the lists do not spell out. */
const EXTRA_COMMON = new Set(["i'm", "it's", "don't", "doesn't", "isn't", "aren't", "can't", "won't", "you're", "that's", "there's", "let's", "i'll", "i've", "you'll", "we're", "they're", "didn't", "wasn't", "ok", 'okay', 'etc', 'e.g', 'i.e']);

export function isKnownForm(index: LemmaIndex, w: string): boolean {
  return index.lemmaOf.has(w) || EXTRA_COMMON.has(w) || index.lemmaOf.has(w.replace(/'s$/, ''));
}

/**
 * Lemma of a word not in the lists, by suffix rules; `seen` (words found elsewhere in the same
 * text) settles "compute" vs "comput": "amplified", "amplifies" → "amplify"; "mitigating" → "mitigate".
 */
export function lemmatize(word: string, index: LemmaIndex, seen?: (w: string) => boolean): string {
  const w = word.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
  const listed = index.lemmaOf.get(w);
  if (listed) return listed;
  const known = (c: string) => index.lemmaOf.has(c) || !!seen?.(c);
  const pick = (cands: string[], fallback: string) => {
    for (const c of cands) {
      const l = index.lemmaOf.get(c);
      if (l) return l;
    }
    return cands.find(known) ?? fallback;
  };
  if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /ied$/.test(w)) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) {
    const s = w.slice(0, -3);
    const undoubled = /(.)\1$/.test(s) ? s.slice(0, -1) : s;
    return pick([s + 'e', undoubled, s], /[^aeiou][aeiou][^aeiouwxy]$/.test(s) || /(?:at|iz|is|uc|rg|lv|rs|ns|ur|ag|og)$/.test(s) ? s + 'e' : s);
  }
  if (w.length > 4 && w.endsWith('ed')) {
    const s = w.slice(0, -2);
    const undoubled = /(.)\1$/.test(s) && !/(?:ss|ll)$/.test(s) ? s.slice(0, -1) : s;
    return pick([w.slice(0, -1), undoubled, s], /(?:at|iz|is|uc|rg|lv|rs|ns|ur|ag|og|v|c)$/.test(s) ? s + 'e' : undoubled);
  }
  if (w.length > 4 && /(?:ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is|ous)$/.test(w)) return w.slice(0, -1);
  return w;
}
