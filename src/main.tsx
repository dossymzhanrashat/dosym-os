import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './core/design/fonts';
import './index.css';
import { App } from './app/App';
import { applySavedTheme } from './core/design/theme';

applySavedTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// After the first paint: the modules (their sync tables, Planner items, reminders and seeds),
// then background sync. Local data is already on screen by then.
async function boot() {
  await Promise.all([
    import('./core/planner/reminderSync'),
    import('./features/english/register'),
    import('./features/radar/register'),
    import('./features/frostpure/register'),
    import('./features/tagylym/register'),
  ]);
  (await import('./core/db/sync')).startSync();
}
const later = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
if (document.readyState === 'complete') later(() => void boot());
else window.addEventListener('load', () => later(() => void boot()), { once: true });

// Updates: an installed iPhone app resumed from the background never re-checks for a new version
// on its own, so check whenever it comes back to the screen, and reload once when the new version
// takes over (otherwise pages could ask for files the old version no longer has).
if ('serviceWorker' in navigator) {
  const check = () => void navigator.serviceWorker.getRegistration().then((r) => r?.update());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  const hadOldVersion = !!navigator.serviceWorker.controller; // a first install needs no reload
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadOldVersion) return;
    reloaded = true;
    window.location.reload();
  });
}
