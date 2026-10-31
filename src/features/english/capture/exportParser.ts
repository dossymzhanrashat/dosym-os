/*
 * Tolerant reader for Claude's data export, conversations.json (SPEC § 6.1 step 3).
 * Expected shape (unofficial, may change): an array of conversations with uuid, name, created_at,
 * updated_at, chat_messages[]; each message has sender ("human" | "assistant") and text and/or
 * content[] items of type "text". Unknown fields are ignored; a conversation or message that does
 * not fit is skipped, never fatal. If nothing fits, the caller shows the keys-only structure.
 */

export interface ExportMessage {
  sender: 'human' | 'assistant';
  text: string;
}

export interface ExportConversation {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: ExportMessage[];
}

export type ParseResult =
  | { ok: true; conversations: ExportConversation[]; skipped: number }
  | { ok: false; structure: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const date = (v: unknown) => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined;
};

function messageText(m: Obj): string {
  const parts: string[] = [];
  if (Array.isArray(m.content)) {
    for (const c of m.content) {
      // Only plain text: tool calls, tool results, thinking and attachments are left out.
      if (isObj(c) && (c.type === 'text' || c.type === undefined) && typeof c.text === 'string') parts.push(c.text);
    }
  }
  if (!parts.length && typeof m.text === 'string') parts.push(m.text);
  return parts.join('\n');
}

function sender(m: Obj): ExportMessage['sender'] | undefined {
  const s = (str(m.sender) ?? str(m.role) ?? '').toLowerCase();
  if (s === 'human' || s === 'user') return 'human';
  if (s === 'assistant' || s === 'claude' || s === 'ai') return 'assistant';
  return undefined;
}

function conversation(c: unknown): ExportConversation | null {
  if (!isObj(c)) return null;
  const id = str(c.uuid) ?? str(c.id);
  const raw = Array.isArray(c.chat_messages) ? c.chat_messages : Array.isArray(c.messages) ? c.messages : null;
  if (!id || !raw) return null;
  const messages: ExportMessage[] = [];
  for (const m of raw) {
    if (!isObj(m)) continue;
    const who = sender(m);
    const text = messageText(m);
    if (who && text.trim()) messages.push({ sender: who, text });
  }
  return { id, title: str(c.name) ?? str(c.title) ?? '', createdAt: date(c.created_at), updatedAt: date(c.updated_at) ?? date(c.created_at), messages };
}

export function parseConversations(raw: unknown): ParseResult {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.conversations) ? raw.conversations : null;
  if (list) {
    const conversations: ExportConversation[] = [];
    let skipped = 0;
    for (const c of list) {
      const conv = conversation(c);
      if (conv) conversations.push(conv);
      else skipped++;
    }
    if (conversations.length || !list.length) return { ok: true, conversations, skipped };
  }
  return { ok: false, structure: structureOf(raw) };
}

/** Keys and types only, never text — what the user may share when the format is new (≤ 2 KB). */
export function structureOf(value: unknown, depth = 0): string {
  const out = shape(value, depth);
  return out.length > 2048 ? `${out.slice(0, 2045)}…` : out;
}

function shape(v: unknown, depth: number): string {
  if (Array.isArray(v)) return depth > 3 ? '[…]' : `[${v.length ? shape(v[0], depth + 1) : ''}] (${v.length})`;
  if (isObj(v)) {
    if (depth > 3) return '{…}';
    return `{ ${Object.keys(v)
      .slice(0, 30)
      .map((k) => `${k}: ${shape(v[k], depth + 1)}`)
      .join(', ')} }`;
  }
  return v === null ? 'null' : typeof v;
}

/** Incremental import (§ 6.1 step 4): skip conversations not changed since they were processed. */
export function isNewOrChanged(c: ExportConversation, processed: Record<string, string>): boolean {
  const before = processed[c.id];
  if (!before) return true;
  return !!c.updatedAt && c.updatedAt > before;
}
