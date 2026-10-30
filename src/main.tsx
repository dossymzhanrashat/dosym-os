import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './core/design/fonts';
import './index.css';
import { App } from './app/App';
import { applySavedTheme } from './core/design/theme';
import { startSync } from './core/db/sync';
import './core/planner/reminderSync';

applySavedTheme();
startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
