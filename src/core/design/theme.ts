// Theme override: 'auto' follows the phone/laptop setting; 'light' and 'dark' force one.
// Stored per device only (a convenience, not synced data).

export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'dosym-theme';

export function savedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTheme(choice: ThemeChoice): void {
  if (choice === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // private mode or blocked storage: the choice lasts until the page closes
  }
}

export function applySavedTheme(): void {
  const choice = savedTheme();
  if (choice !== 'auto') document.documentElement.setAttribute('data-theme', choice);
}
