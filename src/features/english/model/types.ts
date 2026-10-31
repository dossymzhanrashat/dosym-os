// Module 1 data model (SPEC.md › Module 1 › 4. Data model), as TypeScript + Dexie + Supabase.
// Dates are ISO strings in UTC; "day" logic uses Asia/Almaty with a 04:00 boundary (srs/studyDay.ts).

export type NoteKind = 'word' | 'collocation' | 'phrase' | 'paraphrasePair' | 'spelling';
export type NoteStatus = 'active' | 'known' | 'suspended';
export type SourceKind = 'claudeExport' | 'share' | 'ocr' | 'manual' | 'seed' | 'errorLog';

export interface SourceRef {
  kind: SourceKind;
  title?: string;
  conversationId?: string;
  date?: string;
}

export interface Example {
  text: string;
  /** The exact words to highlight / blank in a cloze card. */
  target?: string;
  source: SourceRef;
}

export interface LadderRung {
  band: number;
  word: string;
  note?: string;
}

export interface VocabNote {
  id: string; // uuid
  key: string; // dedupe key (6.5)
  kind: NoteKind;
  headword: string;
  lemma: string;
  pos?: string;
  ipa?: string;
  cefr?: string;
  ieltsTopic?: string;
  definition: string;
  glossKK?: string;
  glossRU?: string;
  examples: Example[]; // max 5, newest first
  family: string[];
  collocations: string[];
  synonymLadder: LadderRung[];
  tip?: string;
  mnemonic?: string;
  source: SourceRef;
  packId?: string;
  status: NoteStatus;
  needsDetails?: boolean; // saved offline / without a definition; enriched later (Phase 3 Bridge)
  frozenAt?: string; // mastered
  isLeech: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Card types (SPEC § 7). Phase 2 renders the first six; the rest arrive with the Bridge and Practice. */
export type CardType =
  | 'recognition'
  | 'production'
  | 'cloze'
  | 'listening'
  | 'spelling'
  | 'collocation'
  | 'synonymLadder'
  | 'wordFamily'
  | 'useIt'
  | 'palace';

export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export type SchedulerKind = 'fsrs5' | 'ladder';

export interface VocabCard {
  id: string; // uuid
  noteId: string;
  type: CardType;
  state: CardState;
  stability: number; // days; 0 for new
  difficulty: number; // 1–10; 0 for new
  due: string;
  lastReview?: string;
  scheduledDays: number; // last interval in days (fractional for learning steps)
  step: number; // learning step index
  ladderIndex: number; // Simple ladder only
  reps: number;
  lapses: number;
  lastGrade?: Grade;
  goodStreak: number; // consecutive Good/Easy (clears the leech flag at 3)
  isLeech: boolean;
  suspended: boolean;
  introducedAt?: string; // first review: new cap and sibling spacing
  updatedAt: string;
  deletedAt?: string;
}

export interface ReviewLog {
  id: string; // uuid
  cardId: string;
  noteId: string;
  reviewedAt: string;
  grade: Grade;
  stateBefore: CardState;
  elapsedDays: number;
  scheduledDays: number;
  rBefore: number;
  sBefore: number;
  sAfter: number;
  dBefore: number;
  dAfter: number;
  durationMs: number; // active time on the card (idle > 30 s not counted)
  scheduler: SchedulerKind;
  updatedAt: string;
  deletedAt?: string; // undo
}

export interface EnglishSettings {
  scheduler: SchedulerKind;
  retention: number; // 0.80–0.95
  newPerDay?: number; // undefined = follow the phase (15/15/5/0)
  maxReviewsPerDay: number;
  maxIntervalDays: number;
  cardTypes: Partial<Record<CardType, boolean>>;
  voiceURI?: string;
  testDate: string; // YYYY-MM-DD
  morningReview: string; // HH:MM Almaty
  schoolQuiet: { start: string; end: string }; // Mon–Fri, no English notifications
}

export const DEFAULT_ENGLISH_SETTINGS: EnglishSettings = {
  scheduler: 'fsrs5',
  retention: 0.9,
  maxReviewsPerDay: 250,
  maxIntervalDays: 180,
  cardTypes: { recognition: true, production: true, cloze: true, listening: true, spelling: true, collocation: true, synonymLadder: true },
  testDate: '2027-06-10', // confirmed by the user, 31 Oct 2026
  morningReview: '07:15', // confirmed
  schoolQuiet: { start: '08:00', end: '15:00' }, // confirmed
};

// ---------- Capture (Phase 3): triage inbox and Use-it sentences ----------

/** What an import found: an extract-vocab item (SPEC § 12.1), or a bare word picked in the browser. */
export interface CandidateItem {
  headword: string;
  lemma?: string;
  kind: 'word' | 'collocation' | 'phrase';
  pos?: string;
  cefr?: string;
  ieltsTopic?: string;
  definition?: string; // empty until Claude fills the details
  glossKK?: string;
  glossRU?: string;
  ipa?: string;
  exampleText?: string;
  exampleTarget?: string; // the exact words inside exampleText
  exampleGenerated?: boolean; // topic packs: Claude wrote the sentence
  moreExamples?: { text: string; target?: string; title?: string; conversationId?: string; date?: string }[]; // other sentences (export picks)
  family: string[];
  collocations: string[];
  synonymLadder: LadderRung[];
  usefulness?: number; // 0–1
}

export type CandidateDecision = 'keep' | 'skip' | 'known' | 'later';

/** One card in the triage inbox (SPEC § 3.3). Skipped rows stay, so the key is never suggested again. */
export interface Candidate {
  id: string; // uuid
  key: string; // the note key it would get (6.5)
  item: CandidateItem;
  source: SourceRef;
  decision?: CandidateDecision;
  decidedAt?: string;
  importId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Claude's feedback on one Use-it sentence (SPEC § 12.3). */
export interface SentenceFeedback {
  usedCorrectly: boolean;
  naturalness: number; // 0–3
  corrected: string;
  errors: { span: string; type: string; explanation: string }[];
  suggestedGrade: Grade;
  tip?: string;
}

/** A sentence written on a Use-it card, waiting for the weekly feedback batch. */
export interface UseItAnswer {
  id: string; // uuid
  cardId: string;
  noteId: string;
  target: string;
  definition: string;
  prompt: string; // "about technology"
  sentence: string;
  selfGrade?: Grade;
  writtenAt: string;
  feedback?: SentenceFeedback;
  feedbackAt?: string;
  updatedAt: string;
  deletedAt?: string;
}
