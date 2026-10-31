import { registerPlannerProvider } from '../../core/planner/providers';
import './data/db'; // registers the Tagylym sync tables
import { tagylymPlannerProvider } from './data/planner';
import { seedIfNeeded } from './data/store';

// Module 3 start-up: sync tables, Planner items (checklist tasks and stage ends), seed options.
registerPlannerProvider(tagylymPlannerProvider);
void seedIfNeeded();
