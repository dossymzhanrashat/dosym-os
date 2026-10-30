// Shared data model (SPEC.md › Architecture › Shared data model).

export type PlannerKind = 'task' | 'event' | 'deadline' | 'review' | 'practice' | 'testMoment';
export type PlannerSource = 'user' | 'english' | 'frostpure' | 'tagylym' | 'radar';
export type Importance = 'normal' | 'important' | 'critical';

export interface ReminderOffset {
  offsetMinutes: number;
  alarm?: boolean;
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  byWeekday?: number[]; // 0 = Sunday … 6 = Saturday (JavaScript getDay)
  until?: string;
}

export interface ChecklistEntry {
  id: string;
  text: string;
  done: boolean;
}

/** Attachments are links for now (files go to Supabase Storage in Phase 5). */
export interface LinkAttachment {
  title: string;
  url: string;
}

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
  reminders: ReminderOffset[];
  recurrence?: Recurrence;
  done: boolean;
  completedAt?: string;
  updatedAt: string; // sync: last write wins
  deletedAt?: string; // soft delete (WEB EDITION)
  // Web additions for the Item detail page:
  completions?: string[]; // recurring: days (YYYY-MM-DD) whose occurrence is done
  exceptions?: string[]; // recurring: days skipped because they were moved or deleted
  snoozedUntil?: string; // "Snooze 1 h": remind again at this time
  checklist?: ChecklistEntry[];
  links?: LinkAttachment[];
}

export interface PlannerItemProvider {
  plannerItems(range: { start: Date; end: Date }): Promise<PlannerItem[]>;
}

/** Fixed weekly block (school, training, sleep): nothing auto-schedules inside it. */
export interface FixedBlock {
  id: string;
  label: string;
  days: number[]; // 0 = Sunday … 6 = Saturday
  start: string; // "08:00"
  end: string; // "14:30"
}
