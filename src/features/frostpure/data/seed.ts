import type { BomItem, BuildStep, CheckItem, Competition, CompRequirement, DeviceSettings, FrostSettings, MediaAsset, PhaseId, Subsystem } from '../model/types';

/*
 * First-open data for FrostPure (SPEC Module 2). Ids are stable slugs, so every device seeds the
 * same rows, and the fixed SEED_TIME means a late seed never overwrites the user's edits.
 * Confirmed with the user on 31 Oct–1 Nov 2026: the three seed media cards have no links (the user
 * pastes them in the app; the repo is public); the parts on hand have unknown models for now;
 * 450 ₸ = $1; temperature probes 5 cm apart.
 */

export const SEED_TIME = '2026-11-01T00:00:00.000Z';

// ---------- BOM (prices are rough planning numbers, ₸, approximate) ----------

type Row = [id: string, name: string, subsystem: Subsystem, qty: number, status: BomItem['status'], kzt: number | undefined, purpose: string, extra?: Partial<BomItem>];

const BOM_ROWS: Row[] = [
  ['pi', 'Raspberry Pi + microSD 32 GB', 'have', 1, 'have', undefined, 'Controller, logger, Wi-Fi sender', { model: 'model to confirm', partTag: 'PI' }],
  ['servos', 'Servo motors', 'have', 2, 'have', undefined, 'Turn ball valves V2 (drain) and V3 (diverter)', { model: 'model to confirm', partTag: 'SERVO' }],
  ['battery', '12 V battery (AGM preferred in cold)', 'have', 1, 'have', undefined, 'Power for valves and electronics', { model: 'type to confirm', partTag: 'BAT' }],
  ['bucket', '20 L food-grade bucket with lid', 'waterPath', 1, 'need', 3000, 'Lab freezing vessel', { stage: 'lab', partTag: 'TANK' }],
  ['drum', '200 L food-grade HDPE drum', 'waterPath', 1, 'need', 15000, 'Outdoor vessel (stage B)', { stage: 'outdoor' }],
  ['xps', 'XPS foam boards 50 mm', 'waterPath', 3, 'need', 3500, 'Insulate sides and bottom so ice grows top-down'],
  ['clean-store', 'Food-grade clean-water container 20–40 L, insulated', 'waterPath', 1, 'need', 5000, 'Clean-water store'],
  ['ball-valves', 'Brass ball valves 1/2" (servo-actuated)', 'waterPath', 2, 'need', 3000, 'V2 drain, V3 diverter (3-way if available)', { partTag: 'V2' }],
  ['solenoid', '12 V solenoid valve 1/2", normally closed', 'waterPath', 1, 'need', 5000, 'V1 fill (optional in lab)', { partTag: 'V1' }],
  ['pump', 'Small 12 V water pump (optional)', 'waterPath', 1, 'need', 5000, 'Fill from bucket/well'],
  ['plumbing', 'Food-grade silicone tube, fittings, mesh lid', 'waterPath', 1, 'need', 6000, 'Plumbing and lid', { qtyLabel: 'set' }],
  ['ec-probes', 'Analog EC/TDS probe kit (K=1 or K=10 for brine)', 'sensors', 2, 'need', 12000, 'EC1 in tank, EC2 on outlet', { partTag: 'EC1' }],
  ['ads1115', 'ADS1115 16-bit ADC module (I²C)', 'sensors', 1, 'need', 2000, 'The Pi has no analog inputs; reads EC probes'],
  ['ds18b20', 'DS18B20 waterproof temperature probes', 'sensors', 6, 'need', 1200, 'T1–T5 ice-thickness string + air temp', { partTag: 'T1' }],
  ['pullup', '4.7 kΩ resistor + screw terminal board', 'sensors', 1, 'need', 500, '1-Wire pull-up'],
  ['level', 'JSN-SR04T waterproof ultrasonic level sensor', 'sensors', 1, 'need', 4000, 'Water level, ice expansion', { partTag: 'LVL' }],
  ['brackets', 'Servo-to-valve brackets + couplers (3D printed or aluminium)', 'controlPower', 2, 'need', 2000, 'Mechanical link servo → valve stem'],
  ['mosfet', 'Logic-level MOSFET module or 2-ch relay module', 'controlPower', 1, 'need', 1500, 'Switch solenoid and pump'],
  ['diodes', 'Flyback diode 1N4007', 'controlPower', 2, 'need', 100, 'Protect MOSFET from solenoid kickback'],
  ['buck-5v', 'Buck converter 12 V → 5.1 V 3 A+', 'controlPower', 1, 'need', 2500, 'Power the Pi'],
  ['buck-6v', 'Buck converter 12 V → 6 V 3 A (servo rail)', 'controlPower', 1, 'need', 2500, 'Separate servo supply, common ground'],
  ['fuse', 'Inline fuse holder + 5 A fuse', 'controlPower', 1, 'need', 800, 'Battery protection'],
  ['enclosure', 'IP65 enclosure ~200×150×100 mm + cable glands', 'controlPower', 1, 'need', 6000, 'Electronics box, foam-lined'],
  ['solar', '20 W solar panel + PWM charge controller', 'controlPower', 1, 'need', 25000, 'Outdoor rig power (stage B)', { stage: 'outdoor' }],
  ['tds-meter', 'Handheld TDS/EC meter', 'safetyTools', 1, 'need', 5000, 'Calibrate probes, manual samples'],
  ['scale', 'Kitchen scale (0.1 g) + measuring cylinder 1 L', 'safetyTools', 1, 'need', 6000, 'Make salt solutions, measure volumes'],
  ['salt', 'Non-iodised salt 1 kg', 'safetyTools', 1, 'need', 300, 'Feed solutions 2/4/6 g/L'],
  ['ppe', 'Nitrile gloves, safety glasses', 'safetyTools', 1, 'need', 2000, 'Safety'],
];

export const SEED_BOM: BomItem[] = BOM_ROWS.map(([id, name, subsystem, qty, status, kzt, purpose, extra], i) => ({
  id: `bom-${id}`,
  order: i,
  name,
  subsystem,
  qty,
  status,
  unitPriceKZT: kzt,
  purpose,
  notes: '',
  updatedAt: SEED_TIME,
  ...extra,
}));

// ---------- Build guide ----------

const checks = (prefix: string, items: string[]): CheckItem[] => items.map((text, i) => ({ id: `${prefix}-${i + 1}`, text, done: false }));
const b = (ids: string[]) => ids.map((x) => `bom-${x}`);

type StepRow = [id: string, title: string, minutes: number, bom: string[], body: string, list: string[]];
const STEP_ROWS: StepRow[] = [
  ['power', 'Bench power', 90, ['battery', 'fuse', 'buck-5v', 'buck-6v'], 'Wire battery → fuse → two buck converters. Common ground for everything.', [
    'Fuse within 10 cm of the battery +',
    'Buck 1 set to 5.1 V (multimeter)',
    'Buck 2 set to 6 V (multimeter)',
    'All grounds joined',
  ]],
  ['pi', 'Pi setup', 60, ['pi'], 'Flash Raspberry Pi OS Lite, enable I²C and 1-Wire (dtoverlay=w1-gpio, GPIO4), set Wi-Fi and the time zone Asia/Almaty. Full steps: FrostPure › Build › Pi setup.', [
    'OS flashed with Wi-Fi and SSH',
    'I²C on',
    '1-Wire on (GPIO4)',
    'Time zone Asia/Almaty',
  ]],
  ['temps', 'Temperature string', 90, ['ds18b20', 'pullup', 'pi'], 'Mount 5 DS18B20 probes on a rod 5 cm apart (5, 10, 15, 20, 25 cm below the water surface). Record each sensor ID and depth in Pi setup.', [
    '4.7 kΩ pull-up between 3.3 V and data',
    '6 probe IDs listed on the Pi',
    'IDs and depths saved in Pi setup',
  ]],
  ['ec', 'EC probes', 120, ['ec-probes', 'ads1115', 'tds-meter', 'salt', 'scale'], 'Connect the probe boards to ADS1115 A0/A1. Calibrate with the handheld meter in 3 solutions (e.g. 2, 4, 6 g/L). Save the calibration in Pi setup.', [
    'ADS1115 seen on I²C (address 0x48)',
    '3 solutions mixed and measured with the handheld meter',
    'Calibration saved for EC1 and EC2',
  ]],
  ['level', 'Level sensor', 45, ['level', 'pi'], 'Mount the JSN-SR04T above the water. Record empty and full distances in Pi setup.', ['Echo pin through a voltage divider (5 V → 3.3 V)', 'Empty distance recorded', 'Full distance recorded']],
  ['valves', 'Valve actuators', 120, ['servos', 'ball-valves', 'brackets', 'buck-6v'], 'Mount the servos to the ball valves. Find the open and closed angles. Test 10 cycles.', ['V2 open/closed angles saved', 'V3 clean/brine angles saved', '10 cycles without slipping']],
  ['insulation', 'Insulation', 60, ['xps', 'bucket'], 'Wrap sides and bottom with XPS. Leave the top open with mesh, so ice grows from the top down.', ['Sides wrapped', 'Bottom insulated', 'Mesh lid on top']],
  ['leak', 'Leak test', 150, ['bucket', 'plumbing', 'ball-valves'], 'Fill with tap water for 2 h. Check every fitting.', ['Filled and left 2 h', 'No drips at valves', 'No drips at tube fittings']],
  ['dry', 'Dry run', 60, ['pi', 'ds18b20', 'ec-probes', 'level'], 'Run the controller script with no salt. Confirm telemetry reaches the app (FrostPure › Lab › Live).', ['Sender running as a service', 'Readings visible in the app', 'Valves move on command test']],
  ['first-run', 'First salt run', 30, ['salt', 'tds-meter', 'bucket'], 'Start Experiment Lab run #1.', ['Run defined in Lab', 'Feed sample measured', 'Freeze started']],
];

export const SEED_STEPS: BuildStep[] = STEP_ROWS.map(([id, title, estMinutes, bom, body, list], i) => ({
  id: `step-${id}`,
  order: i + 1,
  title,
  body,
  estMinutes,
  requiredBomIds: b(bom),
  checklist: checks(`step-${id}`, list),
  photoAssetIds: [],
  updatedAt: SEED_TIME,
}));

// ---------- Media (links pasted later by the user) ----------

const asset = (id: string, title: string, kind: MediaAsset['kind'], tags: string[], extra: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  title,
  kind,
  tags,
  notes: '',
  pinned: false,
  versions: [],
  photos: [],
  chapters: [],
  linkedBomIds: [],
  linkedStepIds: [],
  linkedRunIds: [],
  createdAt: SEED_TIME,
  updatedAt: SEED_TIME,
  ...extra,
});

export const SEED_ASSETS: MediaAsset[] = [
  asset('asset-unit-design', 'FrostPure Unit Design', 'link', ['design', 'conrad']),
  asset('asset-brand-identity', 'FrostPure Brand Identity', 'brandBoard', ['brand'], { notes: 'Boards: HowItWorks, LeanCanvas, ImpactBrand, Logos, Poster.' }),
  asset('asset-film-plan', 'Cinematic Motion Film Plan', 'video', ['video', 'teaser', 'conrad'], {
    notes: 'The 2:20 cinematic cut is a teaser; the Conrad Innovation Video must be 3–5 min and under 800 MB.',
    chapters: [
      { title: 'Cold open', start: 0 },
      { title: 'The problem', start: 18 },
      { title: 'The science', start: 42 },
      { title: 'One cold night', start: 62 },
      { title: 'Impact', start: 105 },
      { title: 'Logo reveal', start: 123 },
    ],
  }),
];

// ---------- Run-sheet phases ----------

export const PHASES: { id: PhaseId; label: string; checklist: string[]; timerMin?: number }[] = [
  { id: 'prepare', label: 'Prepare', checklist: ['Weigh salt for the feed solution', 'Label all samples “not for drinking”', 'Gloves and glasses on'] },
  { id: 'fill', label: 'Fill', checklist: ['Fill to the planned volume', 'Take the feed sample (EC, temperature, volume)'] },
  { id: 'freeze', label: 'Freeze', checklist: ['Lid with mesh on, sides insulated', 'Check ice depth at the test moments'] },
  { id: 'drain', label: 'Drain', checklist: ['Open V2 / drain brine', 'Measure brine volume and EC'], timerMin: 20 },
  { id: 'sweat', label: 'Sweat', checklist: ['Let the ice surface melt slightly', 'Collect sweat water separately'], timerMin: 30 },
  { id: 'harvest', label: 'Harvest', checklist: ['Melt the ice', 'Measure clean-water volume'] },
  { id: 'measure', label: 'Measure', checklist: ['Clean-water EC with the handheld meter', 'Enter energy (Wh) if logged', 'Note the ice thickness at drain'] },
];

// ---------- Competitions ----------

const CONRAD_GUIDE = 'https://conrad.spacecenter.org/wp-content/uploads/2026/08/2026-2027-Conrad-Challenge-Student-Guide-Official.pdf';
const CT = 'America/Chicago';

/** Innovation Brief sections and word limits (3,000 words in total), from the 2026–27 Student Guide. */
export const BRIEF_SECTIONS: [id: string, title: string, limit: number, hours: number, weight: number, dependsOn?: string[]][] = [
  ['elevator', 'Elevator Pitch', 150, 2, 20],
  ['team', 'Team', 150, 1, 20],
  ['opportunity', 'Opportunity', 300, 3, 30],
  ['metrics', 'Key Metrics', 750, 6, 30, ['runs:3']],
  ['validation', 'Validation/Progress', 450, 4, 20, ['runs:1']],
  ['market', 'Market', 300, 3, 20],
  ['competition', 'Competition', 300, 3, 30],
  ['gtm', 'Go-To-Market', 150, 2, 20],
  ['business', 'Business Model', 300, 3, 10],
  ['fundraising', 'Fundraising', 150, 2, 10],
];

const req = (id: string, title: string, kind: CompRequirement['kind'], estHours: number, weight: number, extra: Partial<CompRequirement> = {}): CompRequirement => ({
  id,
  title,
  kind,
  estHours,
  weight,
  dependsOn: [],
  ...extra,
});

const CONRAD: Competition = {
  id: 'comp-conrad-2026-27',
  name: 'Conrad Challenge 2026–27',
  url: 'https://conrad.spacecenter.org',
  status: 'preparing',
  source: 'seed',
  notes: 'Judging weights: Innovation 30% · Storytelling and Professionalism 20% · Practicality 20% · Marketing Strategy 20% · Finances 10%.',
  phases: [
    {
      id: 'activation',
      name: 'Activation Stage',
      start: '2026-08-27',
      deadline: { date: '2026-10-29T23:59', tz: CT },
      verified: true,
      sourceUrl: CONRAD_GUIDE,
      doneAt: '2026-10-29T12:00:00.000Z', // team Ayaz submitted the Lean Canvas (confirmed 30 Oct 2026)
      requirements: [
        req('team', 'Team of 2–5 students (13–18) + coach over 18', 'task', 1, 20, { doneAt: '2026-10-29T12:00:00.000Z' }),
        req('portal', 'Portal registration', 'task', 1, 10, { doneAt: '2026-10-29T12:00:00.000Z' }),
        req('lean-canvas', 'Lean Canvas: 12 questions (most ≤ 40 words, tagline ≤ 10) + category', 'task', 4, 30, { doneAt: '2026-10-29T12:00:00.000Z' }),
      ],
    },
    {
      id: 'innovation',
      name: 'Innovation Stage',
      start: '2026-10-30',
      deadline: { date: '2027-01-07T23:59', tz: CT },
      verified: true,
      sourceUrl: CONRAD_GUIDE,
      requirements: [
        ...BRIEF_SECTIONS.map(([id, title, limit, hours, weight, dependsOn]) => req(`brief-${id}`, title, 'brief', hours, weight, { wordLimit: limit, text: '', dependsOn: dependsOn ?? [] })),
        req('video', 'Innovation Video: 3–5 min, MP4 under 800 MB, shows a model + YouTube/Vimeo link', 'link', 16, 20, { dependsOn: ['runs:1'] }),
        req('website', 'Public website: team story, model and brand', 'link', 8, 20),
        req('fee', 'Entry fee $499 (or financial aid request)', 'fee', 1, 10),
      ],
    },
    { id: 'judging', name: 'Lead judging deadline', deadline: { date: '2027-02-16', tz: CT }, verified: true, sourceUrl: 'https://conrad.spacecenter.org/calendar/lead-judging-deadline-for-phase-2-innovation-stage/', requirements: [] },
    { id: 'finalists', name: 'Finalists announcement (livestream)', deadline: { date: '2027-02-26T19:00', tz: CT }, verified: true, sourceUrl: 'https://conrad.spacecenter.org/calendar/2026-2027-conrad-challenge-finalists-announcement/', requirements: [] },
    { id: 'summit', name: 'Innovation Summit, Space Center Houston (power pitch)', start: '2027-04-21', deadline: { date: '2027-04-24', tz: CT }, verified: true, sourceUrl: CONRAD_GUIDE, requirements: [] },
  ],
  milestones: [
    { id: 'lab-runs', title: 'Lab runs done', day: '2026-11-30' },
    { id: 'outdoor-run', title: 'Outdoor run done', day: '2026-12-20' },
    { id: 'brief-draft', title: 'Brief draft complete', day: '2026-12-20' },
    { id: 'video-final', title: 'Video final', day: '2026-12-31' },
    { id: 'website-live', title: 'Website live', day: '2027-01-03' },
    { id: 'submit', title: 'Submit Innovation Stage (2 days early)', day: '2027-01-05' },
  ],
  updatedAt: SEED_TIME,
};

export const SEED_COMPS: Competition[] = [
  CONRAD,
  ...(
    [
      ['comp-sjwp-kz', 'Stockholm Junior Water Prize — Kazakhstan national round', 'National round to confirm (Miras School, Almaty; secretary@miras.kz).'],
      ['comp-isef', 'Regeneron ISEF via a national affiliate fair', 'Kazakhstan affiliated fair and date to confirm with the school research coordinator.'],
      ['comp-kz-national', 'Kazakhstan national science project competition', 'Name and dates to confirm.'],
      ['comp-grants', 'Water / climate youth innovation grants', 'Watch Radar for items tagged FrostPure.'],
    ] as const
  ).map(([id, name, notes]): Competition => ({ id, name, status: 'watching', source: 'seed', phases: [], milestones: [], notes, updatedAt: SEED_TIME })),
].map((c) => ({ ...c, updatedAt: SEED_TIME }));

// ---------- Settings ----------

export const DEFAULT_SETTINGS: FrostSettings = { usdRate: 450, targetUsd: [300, 360] };

export const DEFAULT_DEVICE: DeviceSettings = {
  deviceId: 'ayaz-pi-01',
  probes: [
    { key: 'T1', id: '', depthCm: 5 },
    { key: 'T2', id: '', depthCm: 10 },
    { key: 'T3', id: '', depthCm: 15 },
    { key: 'T4', id: '', depthCm: 20 },
    { key: 'T5', id: '', depthCm: 25 },
    { key: 'air', id: '' },
  ],
  iceThresholdC: -0.3,
  ec: [
    { key: 'EC1', channel: 0, slope: 1, offset: 0, points: [] },
    { key: 'EC2', channel: 1, slope: 1, offset: 0, points: [] },
  ],
  level: { trigGpio: 23, echoGpio: 24 },
  servos: [
    { key: 'V2', gpio: 18, closedDeg: 0, openDeg: 90 },
    { key: 'V3', gpio: 19, closedDeg: 0, openDeg: 90 },
  ],
  solenoidGpio: 17,
  intervalS: { freeze: 60, drain: 10 },
  control: { enabled: false, targetIcePct: 65 },
};
