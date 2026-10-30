// Theme: dark by default. 'light' forces the optional light theme; 'auto' follows the
// phone/laptop setting. Stored per device only (a convenience, not synced data).

export type ThemeChoice = 'dark' | 'light' | 'auto';
const KEY = 'dosym-theme';
const lightQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

export function savedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'auto' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

let current: ThemeChoice = 'dark';

function paint(): void {
  const light = current === 'light' || (current === 'auto' && !!lightQuery?.matches);
  const root = document.documentElement;
  if (light) root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  // Browser bar / status bar colour follows the page
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#eef3ff' : '#050a16');
}

lightQuery?.addEventListener('change', () => {
  if (current === 'auto') paint();
});

export function setTheme(choice: ThemeChoice): void {
  current = choice;
  paint();
  try {
    if (choice === 'dark') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // private mode or blocked storage: the choice lasts until the page closes
  }
}

export function applySavedTheme(): void {
  current = savedTheme();
  paint();
}
