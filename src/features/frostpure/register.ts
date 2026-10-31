import { registerPlannerProvider } from '../../core/planner/providers';
import { registerReminderSource } from '../../core/planner/reminderSync';
import './data/db'; // registers the FrostPure sync tables
import { frostPlannerProvider, frostReminderSource } from './data/planner';
import { seedIfNeeded } from './data/store';

// Module 2 start-up: sync tables, Planner items (milestones, test moments, parcels), timer pushes, seed.
registerPlannerProvider(frostPlannerProvider);
registerReminderSource(frostReminderSource);
void seedIfNeeded();
