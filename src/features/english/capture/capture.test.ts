import { describe, expect, it } from 'vitest';
import { parseConversations, structureOf } from './exportParser';
import { buildIndex, isKnownForm, lemmatize, loadIndex } from './lemma';
import { pickCandidates } from './picker';
import { englishScore, englishSentences, findTarget, stripNoise } from './text';
import { readFileFromZip } from './zip';

const index = await loadIndex();
const known = (w: string) => isKnownForm(index, w);

// A small export in the documented shape, with extra unknown fields and every kind of noise.
const EXPORT = [
  {
    uuid: 'c1',
    name: 'Freeze desalination notes',
    created_at: '2026-09-12T08:00:00Z',
    updated_at: '2026-09-12T09:00:00Z',
    account: { uuid: 'x' },
    some_new_field: [1, 2, 3],
    chat_messages: [
      { uuid: 'm1', sender: 'human', text: 'Тұзды су туралы айтшы. Расскажи про опреснение.', attachments: [] },
      {
        uuid: 'm2',
        sender: 'assistant',
        text: '',
        content: [
          { type: 'text', text: 'Rising salinity poses a threat to well water in the region. Freezing can mitigate the problem when temperatures are low.' },
          { type: 'tool_use', name: 'web_search', input: { query: 'brine rejection' } },
          { type: 'text', text: '```python\nmitigation_factor = compute(x)\n```\nSee https://example.com/brine for details or write to someone@example.com.\n42.5\nThe brine is gradually rejected as the ice front advances.' },
        ],
      },
    ],
  },
  {
    uuid: 'c2',
    name: 'Essay feedback',
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-02T08:00:00Z',
    chat_messages: [
      { sender: 'assistant', text: 'Teenagers are highly susceptible to advertising, which amplifies their anxiety. Social media amplified the effect in many countries.' },
      { sender: 'assistant', text: 'Governments should mitigate inequality, and well-designed policies have mitigated it before.' },
    ],
  },
  { not_a_conversation: true },
];

describe('export parser', () => {
  it('reads the documented shape and ignores unknown fields', () => {
    const r = parseConversations(EXPORT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conversations).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.conversations[0].title).toBe('Freeze desalination notes');
    expect(r.conversations[0].messages.map((m) => m.sender)).toEqual(['human', 'assistant']);
    // text parts joined, the tool call left out
    expect(r.conversations[0].messages[1].text).toContain('poses a threat');
    expect(r.conversations[0].messages[1].text).not.toContain('web_search');
  });

  it('accepts { conversations: [...] } and role/messages variants', () => {
    const r = parseConversations({ conversations: [{ id: 'a', title: 'T', messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello there friend.' }] }] }] });
    expect(r.ok && r.conversations[0].messages[0]).toEqual({ sender: 'human', text: 'Hello there friend.' });
  });

  it('reports an unknown format as keys only, no text', () => {
    const r = parseConversations({ data: { items: [{ secret: 'my private words' }] } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.structure).toContain('secret: string');
    expect(r.structure).not.toContain('private');
    expect(structureOf('x'.repeat(5000)).length).toBeLessThanOrEqual(2048);
  });
});

describe('text clean-up', () => {
  it('drops code, URLs, e-mails and number-only lines', () => {
    const t = stripNoise('Intro line here.\n```js\nconst a = 1;\n```\nUse `npm run dev` then visit https://x.io/a or mail a@b.co\n12.5\n| a | b |\n|---|---|');
    expect(t).not.toMatch(/const a|npm run|https|a@b|12\.5|---/);
    expect(t).toContain('Intro line here.');
  });

  it('keeps English sentences and drops Kazakh and Russian ones', () => {
    const s = englishSentences('Мен ағылшын тілін үйренемін. The government should invest in renewable energy sources. Это очень важно для нас.', known);
    expect(s).toEqual(['The government should invest in renewable energy sources.']);
    expect(englishScore('Мен ағылшын тілін үйренемін', known)).toBe(0);
  });

  it('finds the exact words of a headword in a sentence', () => {
    expect(findTarget('Salinity posed a serious threat to wells.', 'pose a threat to')).toBe('posed a serious threat to');
    expect(findTarget('Media amplifies anxiety.', 'amplify')).toBe('amplifies');
    expect(findTarget('Teenagers are highly susceptible to ads.', 'susceptible to')).toBe('susceptible to');
    expect(findTarget('Nothing here.', 'mitigate')).toBeUndefined();
  });
});

describe('lemmas', () => {
  it('uses the lists, then suffix rules', () => {
    expect(lemmatize('abandoned', index)).toBe('abandon');
    expect(lemmatize('amplified', index)).toBe('amplify');
    expect(lemmatize('amplifies', index)).toBe('amplify');
    expect(lemmatize('mitigating', index, (w) => w === 'mitigate')).toBe('mitigate');
    expect(lemmatize('mitigated', index, (w) => w === 'mitigate')).toBe('mitigate');
  });

  it('builds an index from list lines', () => {
    const i = buildIndex({ ngsl: ['go goes went gone going'], nawl: ['hypothesis hypotheses'] });
    expect(i.lemmaOf.get('went')).toBe('go');
    expect(i.academic.has('hypothesis')).toBe(true);
  });
});

describe('candidate picking', () => {
  const conversations = (() => {
    const r = parseConversations(EXPORT);
    return r.ok ? r.conversations : [];
  })();

  it('picks rare words from Claude’s messages with their sentence and chat', () => {
    const r = pickCandidates(conversations, index, { includeMine: false, processed: {}, knownLemmas: new Set() });
    const lemmas = r.picks.map((p) => p.lemma);
    expect(lemmas).toContain('amplify'); // "amplifies" + "amplified" → one candidate…
    const amp = r.picks.find((p) => p.lemma === 'amplify')!;
    expect(amp.count).toBe(2); // …with both sentences
    expect(amp.examples[0].title).toBe('Essay feedback');
    expect(lemmas).toContain('mitigate');
    expect(lemmas).toContain('salinity');
    // common words, code, names and Kazakh/Russian never become candidates
    expect(lemmas).not.toContain('government');
    expect(lemmas).not.toContain('compute');
    expect(lemmas.some((l) => /[Ѐ-ӿ]/.test(l))).toBe(false);
    expect(r.stats.newConversations).toBe(2);
  });

  it('only English sentences without code or URLs can reach the prompt', () => {
    const r = pickCandidates(conversations, index, { includeMine: true, processed: {}, knownLemmas: new Set() });
    const sent = r.picks.flatMap((p) => p.examples.map((e) => e.text)).join('\n');
    expect(sent).not.toMatch(/[Ѐ-ӿ]|https?:|@example|mitigation_factor|```/);
  });

  it('re-importing the same export finds nothing new', () => {
    const first = pickCandidates(conversations, index, { includeMine: false, processed: {}, knownLemmas: new Set() });
    const again = pickCandidates(conversations, index, { includeMine: false, processed: first.processed, knownLemmas: new Set() });
    expect(again.stats.newConversations).toBe(0);
    expect(again.picks).toHaveLength(0);
    // and words already in notes or the inbox are not offered again even on a full rescan
    const rescan = pickCandidates(conversations, index, { includeMine: false, processed: {}, knownLemmas: new Set(first.picks.map((p) => p.lemma)), rescanAll: true });
    expect(rescan.picks).toHaveLength(0);
  });
});

describe('zip reader', () => {
  async function makeZip(name: string, text: string, method: 0 | 8): Promise<Blob> {
    const raw = new TextEncoder().encode(text);
    const data = method === 8 ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : raw;
    const nameBytes = new TextEncoder().encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, method, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(10, method, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, raw.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, 0, true);
    const cdOffset = 30 + nameBytes.length + data.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, 46 + nameBytes.length, true);
    end.setUint32(16, cdOffset, true);
    return new Blob([local, nameBytes, data, cen, nameBytes, end]);
  }

  it('reads conversations.json from a deflated or stored zip', async () => {
    const json = JSON.stringify(EXPORT);
    expect(await readFileFromZip(await makeZip('data-2026/conversations.json', json, 8), 'conversations.json')).toBe(json);
    expect(await readFileFromZip(await makeZip('conversations.json', json, 0), 'conversations.json')).toBe(json);
    await expect(readFileFromZip(new Blob(['not a zip']), 'conversations.json')).rejects.toThrow(/not a \.zip/);
  });
});

describe('from pick to note', () => {
  it('"amplifies" and "amplified" in two chats become one note with two examples', async () => {
    const { noteInputFrom } = await import('../data/capture');
    const r = parseConversations([
      ...EXPORT.slice(0, 2),
      { uuid: 'c3', name: 'Media essay', updated_at: '2026-10-05T08:00:00Z', chat_messages: [{ sender: 'assistant', text: 'Algorithms often amplified extreme views during the campaign last year.' }] },
    ]);
    const pick = pickCandidates(r.ok ? r.conversations : [], index, { includeMine: false, processed: {}, knownLemmas: new Set() }).picks.find((p) => p.lemma === 'amplify')!;
    expect(new Set(pick.examples.map((e) => e.conversationId)).size).toBe(2);
    const [ex, ...more] = pick.examples;
    const input = noteInputFrom(
      { headword: pick.lemma, kind: 'word', exampleText: ex.text, exampleTarget: ex.target, moreExamples: more, family: [], collocations: [], synonymLadder: [] },
      { kind: 'claudeExport', title: ex.title },
    );
    expect(input.headword).toBe('amplify');
    expect(input.examples.length).toBe(pick.examples.length);
    expect(input.examples.every((e) => e.target && e.text.includes(e.target))).toBe(true);
    expect(new Set(input.examples.map((e) => e.source.title)).size).toBeGreaterThan(1);
  });
});
