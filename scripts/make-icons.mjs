// Draws the app icons from the droplet mascot (brand/droplet.svg) on the Deep Blue background.
// Run: npm run icons   → writes public/icons/*.png and public/favicon.svg
// Uses headless Google Chrome to rasterise the SVG (its soft blurs need a real renderer), so no
// npm dependency. Set CHROME=/path/to/chrome if Chrome is not in the default macOS location.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Droplet artwork without the XML header and provenance metadata
const droplet = readFileSync('brand/droplet.svg', 'utf8')
  .replace(/<\?xml[^>]*>\s*/, '')
  .replace(/<metadata>[\s\S]*?<\/metadata>/, '');
const inner = droplet.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

// Page background + corner glows, same as --bg, --glow-tl, --glow-br in tokens.css
const BG = `radial-gradient(55% 70% at 0% 0%, rgba(70,110,255,0.6), rgba(70,110,255,0) 62%),
  radial-gradient(50% 65% at 100% 100%, rgba(0,180,255,0.42), rgba(0,180,255,0) 62%),
  linear-gradient(160deg, #0d1834 0%, #081022 55%, #050a16 100%)`;

/** `height` = droplet height as a share of the icon (smaller for the maskable safe zone). */
function page(size, height) {
  const h = size * height;
  const w = (h * 200) / 240;
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:${BG};}
    svg{position:absolute;left:${(size - w) / 2}px;top:${(size - h) / 2 - h * 0.02}px;width:${w}px;height:${h}px;overflow:visible}
  </style></head><body>${droplet.replace(/ width="200" height="240"/, '')}</body></html>`;
}

const work = mkdtempSync(join(tmpdir(), 'dosym-icons-'));
function render(out, size, height) {
  const html = join(work, `${size}-${height}.html`);
  writeFileSync(html, page(size, height));
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${size},${size}`,
    `--screenshot=${resolve(out)}`,
    `file://${html}`,
  ], { stdio: 'ignore' });
}

mkdirSync('public/icons', { recursive: true });
render('public/icons/icon-192.png', 192, 0.66);
render('public/icons/icon-512.png', 512, 0.66);
render('public/icons/icon-maskable-512.png', 512, 0.5); // inside the 80% safe circle
render('public/icons/apple-touch-icon.png', 180, 0.62); // iOS rounds the corners itself
rmSync(work, { recursive: true, force: true });

// Favicon: rounded deep-blue tile with the droplet (SVG, so it stays sharp at every size)
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="fav-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2b66"/><stop offset="0.55" stop-color="#081022"/><stop offset="1" stop-color="#050a16"/></linearGradient></defs>
<rect width="64" height="64" rx="14" fill="url(#fav-bg)"/>
<svg x="13" y="6" width="38" height="46" viewBox="0 0 200 240" overflow="visible">${inner}</svg>
</svg>
`,
);
console.log('Icons written to public/icons and public/favicon.svg');
