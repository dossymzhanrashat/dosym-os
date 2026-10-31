// Module 3 — Tagylym Kit Studio (SPEC.md › Module 3, WEB EDITION). Dates are ISO strings / YYYY-MM-DD.

export type Criterion = 'cost' | 'durability' | 'learningDepth' | 'scalability' | 'rural' | 'teacherEffort' | 'uniqueness';
export type Weights = Record<Criterion, number>;

export interface BomLine {
  name: string;
  qty: number;
  qtyLabel?: string; // "set", "1 sheet"
  unitCost: number; // in `currency`
  currency: 'USD' | 'KZT';
  isEstimate: boolean;
  sourceUrl?: string;
  checkedAt?: string; // YYYY-MM-DD
}

export interface Manufacturing {
  method: string;
  moq: number;
  leadTimeDays?: number;
  fixedCostsKZT: number; // molds, certification, jigs, first-batch tooling
  supplierNotes: string;
}

export interface SafetyNote {
  regulation: string;
  text: string;
  toConfirm: boolean;
}

export interface Score {
  value: number; // 1–5
  aiEstimate?: boolean; // shown "AI estimate" until edited
}

/** Target prices in ₸ (approximate). */
export interface TargetPrices {
  grant?: number;
  b2b?: number;
  b2c?: number;
  refill?: number;
}

export interface KitOption {
  id: string;
  code: string; // "A".."E", "B+D", "AI-1" …
  name: string;
  nameKk?: string;
  nameRu?: string;
  concept: string;
  gradeMin: number;
  gradeMax: number;
  controller?: string; // "ESP32", "ESP32-C3"; shared controller → "Merge as one platform"
  outcomes: { grade: number; text: string }[];
  bom: BomLine[];
  manufacturing: Manufacturing;
  packaging: string;
  curriculum: { index: number; title: string }[];
  lessonCount: number;
  softwareNeeds: string;
  safetyNotes: SafetyNote[];
  risks: string[];
  scores: Record<Criterion, Score>;
  prices: TargetPrices;
  status: 'exploring' | 'active' | 'parked';
  source: 'seed' | 'manual' | 'ai' | 'merge';
  isTeacherBox: boolean; // Option E: a modifier, not a competitor
  sellAsTeacherBox: boolean; // "sell as Teacher Box too"
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DecisionRecord {
  id: string;
  winnerId: string;
  runnerUpId?: string;
  weights: Weights;
  scores: Record<string, number>;
  robustness: number; // 0–1
  reason: string;
  decidedAt: string;
  archived: boolean;
  updatedAt: string;
  deletedAt?: string;
}

export type StageKind =
  | 'research'
  | 'concept'
  | 'proto1'
  | 'userTest'
  | 'proto2'
  | 'dfm'
  | 'pilot'
  | 'certification'
  | 'production'
  | 'launch'
  | 'sales';

export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
  due: string; // YYYY-MM-DD (Almaty)
  done: boolean;
}

export interface Deliverable {
  title: string;
  required: boolean;
  link?: string;
}

export interface PipelineStage {
  kind: StageKind;
  days: number;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive)
  checklist: ChecklistItem[];
  deliverables: Deliverable[];
  state: 'todo' | 'active' | 'done';
  overrideNote?: string;
}

export interface KitProject {
  id: string;
  optionId: string;
  decisionId: string;
  mode: 'forward' | 'backward';
  anchorDate: string; // start (forward) or target launch (backward)
  stages: PipelineStage[];
  archived: boolean;
  updatedAt: string;
  deletedAt?: string;
}

/** Calculator inputs per option (₸ unless noted). Defaults agreed with the user on 1 Nov 2026. */
export interface EconInputs {
  labourKZT: number; // extra, beyond the BOM's labour line
  packKZT: number; // extra, beyond the BOM's packaging line
  freightKZT: number; // per kit
  dutyPct: number; // customs / VAT share — 16 % (user, 1 Nov 2026)
  defectPct: number;
  kaspiFeePct: number; // 12.5 % electronics example [TO CONFIRM toy category]
  kaspiDeliveryKZT: number; // per order, 1,699 ₸ (top of 799–1,699) [TO CONFIRM]
  unitsPerOrder: number;
}

export interface FxSetting {
  usdToKzt: number;
  updatedAt: string;
  history: { rate: number; until: string }[];
}
