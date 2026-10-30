// Draws the app icons (Freeze Front motif) as PNGs with no dependencies.
// Run: npm run icons   → writes public/icons/*.png and public/favicon.svg
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const C = {
  night: [0x0f, 0x1e, 0x2c],
  front: [0x0b, 0x6a, 0x94],
  glacier: [0x4f, 0xa7, 0xcf],
  ice: [0xdf, 0xf1, 0xf9],
  amber: [0xd9, 0x8a, 0x2b],
};

// Motif in unit coordinates (0–1) inside the icon; `scale` shrinks it for the maskable safe zone.
function shapes(scale) {
  const m = (v) => 0.5 + (v - 0.5) * scale;
  const L = m(0.2), R = m(0.8);
  const cols = 5, gap = 0.018 * scale, w = (R - L - gap * (cols - 1)) / cols;
  const out = [];
  for (let i = 0; i < cols; i++) {
    const x = L + i * (w + gap);
    out.push({ rect: [x, m(0.2), x + w, m(0.47)], color: C.ice });
  }
  out.push({ rect: [L, m(0.47), R, m(0.53)], color: C.front });
  out.push({ rect: [L, m(0.53), R, m(0.8)], color: C.amber });
  for (const [cx, cy] of [[0.33, 0.62], [0.55, 0.7], [0.69, 0.6], [0.43, 0.74]]) {
    out.push({ circle: [m(cx), m(cy), 0.03 * scale], color: C.night });
  }
  return out;
}

function hit(s, x, y) {
  if (s.rect) {
    const [x0, y0, x1, y1] = s.rect;
    return x >= x0 && x < x1 && y >= y0 && y < y1;
  }
  const [cx, cy, r] = s.circle;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, scale) {
  const list = shapes(scale);
  const SS = 4; // 4×4 supersampling for smooth edges
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
          let col = C.night;
          for (const s of list) if (hit(s, u, v)) col = s.color;
          acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
        }
      }
      const i = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(acc[k] / (SS * SS));
    }
  }
  return png(size, px);
}

function png(size, rgb) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let c = 0xffffffff;
  for (const b of td) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  const len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function svg(scale) {
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const body = shapes(scale)
    .map((s) =>
      s.rect
        ? `<rect x="${s.rect[0] * 64}" y="${s.rect[1] * 64}" width="${(s.rect[2] - s.rect[0]) * 64}" height="${(s.rect[3] - s.rect[1]) * 64}" fill="${hex(s.color)}"/>`
        : `<circle cx="${s.circle[0] * 64}" cy="${s.circle[1] * 64}" r="${s.circle[2] * 64}" fill="${hex(s.color)}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${hex(C.night)}"/>${body}</svg>\n`;
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 1));
writeFileSync('public/icons/icon-512.png', render(512, 1));
writeFileSync('public/icons/icon-maskable-512.png', render(512, 0.72));
writeFileSync('public/icons/apple-touch-icon.png', render(180, 0.9));
writeFileSync('public/favicon.svg', svg(1));
console.log('Icons written to public/icons and public/favicon.svg');
