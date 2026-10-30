// Shared data model (SPEC.md › Architecture › Shared data model).

export type PlannerKind = 'task' | 'event' | 'deadline' | 'review' | 'practice' | 'testMoment';
export type PlannerSource = 'user' | 'english' | 'frostpure' | 'tagylym' | 'radar';
export type Importance = 'normal' | 'important' | 'critical';

export interface PlannerItem {
  id: string; // uuid
  title: string;
  notes?: string;
  start?: string; // ISO; undefined = all-day or unscheduled
  end?: string;
  dueDate?: string;
  kind: PlannerKind;
  source: PlannerSource;
  sourceRef?: string;
  priority: 0 | 1 | 2 | 3;
  importance: Importance;
  reminders: { offsetMinutes: number; alarm?: boolean }[];
  recurrence?: { freq: 'daily' | 'weekly' | 'monthly'; interval: number; byWeekday?: number[]; until?: string };
  done: boolean;
  completedAt?: string;
  updatedAt: string; // sync: last write wins
  deletedAt?: string; // soft delete (WEB EDITION)
}

export interface PlannerItemProvider {
  plannerItems(range: { start: Date; end: Date }): Promise<PlannerItem[]>;
}
