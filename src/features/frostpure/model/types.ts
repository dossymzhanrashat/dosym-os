// Module 2 — FrostPure Project Hub (SPEC.md › Module 2, WEB EDITION). Dates are ISO strings (UTC).

// ---------- Media ----------

export type AssetKind = 'video' | 'canva' | 'brandBoard' | 'document' | 'photoSet' | 'data' | 'link';

export interface AssetVersion {
  id: string;
  number: number; // 1, 2, 3 … per asset
  note: string;
  url?: string; // YouTube, Drive, Canva, artifact link
  byteSize?: number;
  durationSec?: number; // video
  createdAt: string;
}

/** One photo in a photo set, stored in the private Supabase Storage bucket. */
export interface Photo {
  id: string;
  path: string; // "<user id>/<asset id>/<photo id>.jpg"
  thumbPath: string;
  caption: string;
  byteSize: number;
  createdAt: string;
}

export interface VideoChapter {
  title: string;
  start: number; // seconds
}

export interface MediaAsset {
  id: string;
  title: string;
  kind: AssetKind;
  tags: string[];
  notes: string;
  pinned: boolean;
  versions: AssetVersion[];
  currentVersionId?: string;
  photos: Photo[];
  chapters: VideoChapter[];
  linkedBomIds: string[];
  linkedStepIds: string[];
  linkedRunIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// ---------- Build ----------

export type Subsystem = 'have' | 'waterPath' | 'sensors' | 'controlPower' | 'safetyTools';
export type BomStatus = 'need' | 'ordered' | 'have';

export interface BomItem {
  id: string;
  order: number;
  name: string;
  model?: string; // e.g. "MG996R" — [TO CONFIRM] for the parts on hand
  subsystem: Subsystem;
  qty: number;
  qtyLabel?: string; // "set"
  status: BomStatus;
  unitPriceKZT?: number; // approximate
  supplierUrl?: string;
  datasheetUrl?: string;
  purpose: string;
  notes: string;
  orderedAt?: string;
  expectedAt?: string; // YYYY-MM-DD: a "Parcel due" Planner item
  partTag?: string; // "EC1", "V2" …
  stage?: 'lab' | 'outdoor';
  updatedAt: string;
  deletedAt?: string;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface BuildStep {
  id: string;
  order: number;
  title: string;
  body: string;
  estMinutes: number;
  requiredBomIds: string[];
  checklist: CheckItem[];
  photoAssetIds: string[];
  doneAt?: string;
  updatedAt: string;
  deletedAt?: string;
}

// ---------- Experiment lab ----------

export type Rig = 'lab' | 'outdoor' | 'custom';
export type RunStatus = 'planned' | 'running' | 'done' | 'aborted';
export type PhaseId = 'prepare' | 'fill' | 'freeze' | 'drain' | 'sweat' | 'harvest' | 'measure';
export type SamplePoint = 'feed' | 'brine' | 'sweat' | 'clean' | 'iceCore';
export type Variable = 'salinity' | 'temperature' | 'frozenPct' | 'drainTiming' | 'duration';

export interface DrainRule {
  kind: 'targetIce' | 'ec1Limit' | 'fixedTime' | 'manual';
  value?: number; // % ice, mS/cm, or hours after start
}

export interface RunPhase {
  id: PhaseId;
  checklist: CheckItem[];
  timerMin?: number;
  timerEndsAt?: string; // running timer; a push reminder fires then
  startedAt?: string;
  doneAt?: string;
}

export interface Sample {
  id: string;
  at: string;
  point: SamplePoint;
  ecMS?: number; // mS/cm as measured at tempC
  tdsMgL?: number;
  tempC?: number;
  volumeL?: number;
  source: 'handheld' | 'pi';
  note: string;
}

export interface TestMoment {
  id: string;
  title: string;
  kind: 'at' | 'afterStart' | 'when';
  at?: string; // kind "at"
  afterMin?: number; // kind "afterStart"
  when?: { metric: 'icePct' | 'ec1'; value: number }; // kind "when": checked as telemetry arrives
  instruction: string;
  doneAt?: string;
}

export interface Run {
  id: string;
  name: string;
  rig: Rig;
  status: RunStatus;
  feedSalinityGL: number;
  feedVolumeL: number;
  plannedAmbientC: number;
  plannedFreezeHours: number;
  targetFrozenPct: number;
  drainRule: DrainRule;
  sweatEnabled: boolean;
  sweatMinutes?: number;
  ec2SwitchMS?: number;
  variable: Variable;
  hypothesis: string;
  tdsK: number; // TDS (mg/L) ≈ k · EC (µS/cm)
  startedAt?: string;
  endedAt?: string;
  phases: RunPhase[];
  samples: Sample[];
  moments: TestMoment[];
  energyWh?: number; // electrical energy of the rig (not the freezer)
  freezerWh?: number; // logged separately: not part of field energy
  iceThicknessCm?: number; // measured at drain
  freezeHoursActual?: number;
  deviceId?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// ---------- Compete ----------

export interface CompRequirement {
  id: string;
  title: string;
  kind: 'brief' | 'link' | 'task' | 'fee';
  wordLimit?: number;
  text?: string; // brief section draft
  url?: string; // video link, website
  estHours: number;
  dependsOn: string[]; // requirement ids, or "runs:3" (needs 3 completed runs)
  weight: number; // judging weight of the related criterion, 0–30
  doneAt?: string;
}

export interface LocalDeadline {
  date: string; // organiser local time "YYYY-MM-DD[THH:mm]"
  tz: string;
}

export interface CompPhase {
  id: string;
  name: string;
  start?: string; // YYYY-MM-DD
  deadline?: LocalDeadline;
  verified: boolean;
  sourceUrl?: string;
  requirements: CompRequirement[];
  doneAt?: string;
}

export interface Milestone {
  id: string;
  title: string;
  day: string; // YYYY-MM-DD (Almaty)
  doneAt?: string;
}

export interface Competition {
  id: string;
  name: string;
  url?: string;
  status: 'watching' | 'preparing' | 'submitted' | 'done';
  source: 'seed' | 'radar' | 'manual';
  phases: CompPhase[];
  milestones: Milestone[];
  notes: string;
  updatedAt: string;
  deletedAt?: string;
}

// ---------- Telemetry (Supabase table `telemetry`, written by the Pi) ----------

export interface TelemetryPayload {
  device_id: string;
  run_id?: string | null;
  ts: string;
  seq: number;
  phase?: string;
  temps_c?: Record<string, number | null>;
  ec_ms_cm?: Record<string, number | null>;
  ec_temp_c?: Record<string, number | null>;
  level_cm?: number | null;
  ice_depth_cm?: number | null;
  valves?: Record<string, string>;
  power?: { battery_v?: number | null; load_w?: number | null };
  fw?: string;
  [key: string]: unknown;
}

export interface TelemetryRow {
  id: number;
  device_id: string;
  run_id: string | null;
  seq: number;
  ts: string;
  phase: string | null;
  payload: TelemetryPayload;
  flags: string[];
  received_at: string;
}

/** The Pi's settings, edited in the app (Build › Pi setup) and copied to the Pi as config.json. */
export interface DeviceSettings {
  deviceId: string;
  probes: { key: string; id: string; depthCm?: number }[]; // T1–T5 and "air"
  iceThresholdC: number;
  waterDepthCm?: number;
  ec: { key: 'EC1' | 'EC2'; channel: number; slope: number; offset: number; points: { volts: number; ecMS: number }[] }[];
  level: { trigGpio: number; echoGpio: number; emptyCm?: number; fullCm?: number };
  servos: { key: 'V2' | 'V3'; gpio: number; closedDeg: number; openDeg: number }[];
  solenoidGpio: number;
  intervalS: { freeze: number; drain: number };
  control: { enabled: boolean; targetIcePct: number; ec1LimitMS?: number };
}

export interface FrostSettings {
  usdRate: number; // ₸ per $1, approximate
  targetUsd: [number, number]; // Unit Design estimate for the full prototype
}
