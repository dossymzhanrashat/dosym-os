/*
 * Reads one file out of a .zip with the browser's own DecompressionStream (no zip library):
 * end-of-central-directory → central directory → the entry's local header → inflate.
 * Handles "stored" and "deflate" entries, which is what Claude's export uses.
 */

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export interface ZipEntry {
  name: string;
  method: number; // 0 stored, 8 deflate
  compressedSize: number;
  size: number;
  localOffset: number;
}

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

export async function listZip(blob: Blob): Promise<ZipEntry[]> {
  // The end record sits in the last 22 bytes plus an optional comment of up to 64 KB.
  const tailStart = Math.max(0, blob.size - 22 - 65_535);
  const tail = await bytes(blob, tailStart, blob.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This file is not a .zip archive.');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('This .zip is too large to open here (ZIP64). Unzip it first and choose conversations.json.');
  const cd = await bytes(blob, cdOffset, cdOffset + cdSize);
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== CEN_SIG) break;
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    entries.push({
      method: cd.getUint16(p + 10, true),
      compressedSize: cd.getUint32(p + 20, true),
      size: cd.getUint32(p + 24, true),
      localOffset: cd.getUint32(p + 42, true),
      name: decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function readZipEntry(blob: Blob, entry: ZipEntry): Promise<string> {
  const loc = await bytes(blob, entry.localOffset, entry.localOffset + 30);
  if (loc.getUint32(0, true) !== LOC_SIG) throw new Error('The .zip file looks damaged.');
  const start = entry.localOffset + 30 + loc.getUint16(26, true) + loc.getUint16(28, true);
  const data = blob.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return data.text();
  if (entry.method !== 8) throw new Error(`Unsupported compression in the .zip (method ${entry.method}).`);
  const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** Every JSON / JSON Lines entry, as [name, text]; `prefer` picks e.g. names with "conversation". */
export async function readJsonEntries(blob: Blob, prefer?: RegExp): Promise<{ name: string; text: string }[]> {
  const entries = (await listZip(blob)).filter((e) => /\.jsonl?$/i.test(e.name) && !e.name.endsWith('/') && !/(^|\/)__MACOSX\//.test(e.name));
  const preferred = prefer ? entries.filter((e) => prefer.test(e.name)) : [];
  const out: { name: string; text: string }[] = [];
  for (const e of preferred.length ? preferred : entries) out.push({ name: e.name, text: await readZipEntry(blob, e) });
  return out;
}

/** The text of the first entry whose name ends with `fileName` (any folder). */
export async function readFileFromZip(blob: Blob, fileName: string): Promise<string> {
  const entries = await listZip(blob);
  const entry = entries.find((e) => e.name === fileName || e.name.endsWith(`/${fileName}`));
  if (!entry) throw new Error(`No ${fileName} inside this .zip. Found: ${entries.slice(0, 8).map((e) => e.name).join(', ') || 'nothing'}.`);
  return readZipEntry(blob, entry);
}
