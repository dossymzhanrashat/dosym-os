import { registerPlannerProvider } from '../../core/planner/providers';
import { registerReminderSource } from '../../core/planner/reminderSync';
import './data/db'; // registers the English sync tables
import { englishPlannerProvider, englishReminders } from './data/planner';

// Module 1 start-up: sync tables, Planner items and the morning review notification.
registerPlannerProvider(englishPlannerProvider);
registerReminderSource(englishReminders);
