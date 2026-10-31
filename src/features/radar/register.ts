import { registerPlannerProvider } from '../../core/planner/providers';
import { registerReminderSource } from '../../core/planner/reminderSync';
import './data/db'; // registers the Radar sync tables
import { radarPlannerProvider, radarReminderSource } from './data/planner';
import { refreshFeed } from './data/store';

// Module 4 start-up: sync tables, Planner items, the deadline reminder ladder, and the daily feed
// (fetched now and whenever the page becomes visible again; at most every 10 minutes).
registerPlannerProvider(radarPlannerProvider);
registerReminderSource(radarReminderSource);

void refreshFeed();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshFeed();
});
