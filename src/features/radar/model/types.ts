// Module 4 — Opportunities Radar (SPEC.md › Module 4, WEB EDITION).

export type OppCategory =
  | 'olympiad'
  | 'mathModeling'
  | 'research'
  | 'summerProgram'
  | 'innovation'
  | 'entrepreneurship'
  | 'sustainability'
  | 'scholarship'
  | 'applicationSupport'
  | 'artWriting'
  | 'csCyber'
  | 'physics'
  | 'other';
export type DeadlineType = 'registration' | 'application' | 'submission' | 'event' | 'decision' | 'payment';
export type DateStatus = 'confirmed' | 'estimated' | 'stale';
export type Confidence = 'high' | 'medium' | 'low';
export type PipelineStatus = 'watching' | 'preparing' | 'submitted' | 'result' | 'hidden';
export type ResultOutcome = 'accepted' | 'award' | 'finalist' | 'waitlisted' | 'notSelected' | 'withdrawn';

// ---------- The daily feed file, public/data/opportunities.json (shape fixed by the user) ----------

export interface FeedDeadline {
  type: DeadlineType;
  /** The organiser's local time in `tz`: "YYYY-MM-DD" (no time stated → 23:59) or "YYYY-MM-DDTHH:mm". */
  date: string;
  tz: string; // IANA
  status: DateStatus;
  sourceUrl: string | null;
}

export interface FeedOpportunity {
  id: string; // slug, e.g. "conrad-2026-27"
  name: string;
  category: OppCategory;
  url: string;
  deadlines: FeedDeadline[];
  requirements: string[];
  cost: string | null;
  aid: string | null;
  eligibility: string;
  lastVerified: string | null; // "YYYY-MM-DD" or ISO
}

export interface FeedChange {
  id: string; // the opportunity's id
  field: string; // "deadlines[submission].date", "cost", "requirements", "cancelled", …
  old: string | null;
  new: string | null;
  sourceUrl: string | null;
  confidence: Confidence;
}

export interface Feed {
  generatedAt: string;
  opportunities: FeedOpportunity[];
  changes: FeedChange[];
}

// ---------- Local records (Dexie + Supabase) ----------

export interface RadarDeadline {
  id: string; // stable within the opportunity: "submission", "application-2", …
  type: DeadlineType;
  date: string; // local time in tz, as in the feed
  tz: string;
  status: DateStatus;
  confidence: Confidence;
  sourceUrl?: string;
  lastVerified?: string;
  manual?: boolean; // edited by hand: never overwritten silently
}

export type RequirementKind = 'essay' | 'rec' | 'transcript' | 'test' | 'video' | 'website' | 'problemSet' | 'fee' | 'team' | 'form' | 'other';

export interface Requirement {
  id: string;
  title: string;
  kind: RequirementKind;
  done: boolean;
}

/** One backward-planned step (SPEC § 4.6); shown in the Planner as a generated task. */
export interface PlanTask {
  id: string; // "rec-ask", "essay-draft", "final-check", …
  title: string;
  day: string; // Almaty day "YYYY-MM-DD", due 08:00
  offset: number; // days before D in the template
}

export interface RadarPlan {
  deadlineId: string; // the main deadline D the plan counts back from
  createdAt: string;
  compressed?: { days: number; insteadOf: number };
  tasks: PlanTask[];
}

export interface HistoryEntry {
  at: string;
  field: string;
  old: string | null;
  new: string | null;
  sourceUrl?: string;
}

export interface Opportunity {
  id: string;
  name: string;
  category: OppCategory;
  url: string;
  deadlines: RadarDeadline[];
  requirements: Requirement[];
  cost?: string;
  aid?: string;
  eligibility: string;
  lastVerified?: string;
  status: PipelineStatus;
  result?: ResultOutcome;
  confirmationNumber?: string;
  plan?: RadarPlan;
  notes: string;
  history: HistoryEntry[];
  cancelled?: boolean;
  createdBy: 'seed' | 'radar' | 'user';
  updatedAt: string;
  deletedAt?: string;
}

export type ChangeState = 'pending' | 'accepted' | 'rejected' | 'expired';

/** A pending diff from the feed (or a new opportunity). Never applied automatically. */
export interface RadarChange {
  id: string; // `${oppId}|${field}|${new}` — the same diff is the same row on every device
  oppId: string;
  field: string; // "new" for a new opportunity
  old?: string;
  new?: string;
  sourceUrl?: string;
  confidence: Confidence;
  fetchedAt: string; // the feed's generatedAt
  state: ChangeState;
  decidedAt?: string;
  opportunity?: FeedOpportunity; // for "new"
  updatedAt: string;
  deletedAt?: string;
}

/** Set by the user in Radar settings; every field [TO CONFIRM] by the user. */
export interface EligibilityProfile {
  birthDate?: string; // YYYY-MM-DD
  usGrade?: number; // US-equivalent grade now
  resultsBy?: string; // "results-by" date for the fit score's timing part
}
