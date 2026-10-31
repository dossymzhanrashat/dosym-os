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
