import type { BomLine, Criterion, EconInputs, FxSetting, KitOption, Score, Weights } from '../model/types';

/*
 * The five kit options (SPEC Module 3 › The five option-scenarios), checked 30 Oct 2026.
 * Component prices are AliExpress-class estimates, stored in USD and shown in ₸ at the user's
 * rate (450 ₸ = $1, decided 1 Nov 2026); every line is marked "estimate" until a real quote is
 * pasted. The spec's BOM rows give line totals; unit cost = line total ÷ qty. Lesson titles are
 * the spec's English samples only (Kazakh/Russian titles are for the user to add).
 */

export const SEED_TIME = '2026-11-01T00:00:00.000Z';
const CHECKED = '2026-10-30';
const SRC_TT = 'https://thepihut.com/collections/all/products/dc-gearbox-motor-tt-motor-200rpm-3-to-6vdc';
const SRC_ESP32 = 'https://www.cnx-software.com/2017/03/31/is-nodemcu-esp-32s-board-now-selling-for-8-50-shipped/';
const SRC_MOLD = 'https://formlabs.com/global/blog/race-to-1000-parts-3d-printing-injection-molding/';

/** A BOM row from the spec: line total in USD for `qty`. */
const line = (name: string, qty: number, totalUSD: number, extra: Partial<BomLine> = {}): BomLine => ({
  name,
  qty,
  unitCost: totalUSD / qty,
  currency: 'USD',
  isEstimate: true,
  checkedAt: CHECKED,
  ...extra,
});

const s = (v: number): Score => ({ value: v });
const scores = (cost: number, durability: number, learningDepth: number, scalability: number, rural: number, teacherEffort: number, uniqueness: number): Record<Criterion, Score> => ({
  cost: s(cost),
  durability: s(durability),
  learningDepth: s(learningDepth),
  scalability: s(scalability),
  rural: s(rural),
  teacherEffort: s(teacherEffort),
  uniqueness: s(uniqueness),
});

const TR_TOYS = { regulation: 'TR CU 008/2011 (toys)', text: 'EAC certificate route for toys; scheme and accredited KZ lab to confirm.', toConfirm: true };
const TR_ELEC = { regulation: 'TR CU 004/2011 + TR CU 020/2011 (EMC)', text: 'Likely for kits with electronics; to confirm with an accredited body.', toConfirm: true };

const base = { status: 'exploring' as const, source: 'seed' as const, isTeacherBox: false, sellAsTeacherBox: false, createdAt: SEED_TIME, updatedAt: SEED_TIME };

export const SEED_OPTIONS: KitOption[] = [
  {
    ...base,
    id: 'kit-a',
    code: 'A',
    name: 'Qagaz Bot',
    nameKk: 'Қағаз Бот',
    concept: 'A zero-waste kit. Printed A3 templates turn a cereal box into a vibrating “bristle bot”, a wheeled car and a crank animal. One motor, one battery pack, clips and paper fasteners. No coding.',
    gradeMin: 1,
    gradeMax: 3,
    outcomes: [
      { grade: 1, text: 'Circuit = closed loop, switch on/off.' },
      { grade: 2, text: 'Motion from rotation; wheel size vs speed.' },
      { grade: 3, text: 'Simple gears and cams; fair test (one variable at a time).' },
    ],
    bom: [
      line('TT gear motor', 1, 0.9, { sourceUrl: SRC_TT }),
      line('2×AA holder with switch + leads', 1, 0.45),
      line('LED + resistor + coin cell', 1, 0.3),
      line('A3 printed templates', 3, 0.35),
      line('Paper fasteners, clips, rubber bands', 1, 0.3, { qtyLabel: 'set' }),
      line('Lesson card set (8 cards)', 1, 0.45),
      line('Kraft envelope + label', 1, 0.3),
      line('Labour (pack)', 1, 0.25, { qtyLabel: '—' }),
    ],
    manufacturing: { method: 'Digital-print templates (local print shop, Almaty); hand-pack motors and holders. Fully local assembly by volunteers or a social-enterprise partner [TO CONFIRM].', moq: 200, fixedCostsKZT: 0, supplierNotes: '' },
    packaging: 'Kraft envelope C4 with sticker label, Kazakh front / Russian back.',
    curriculum: ['Circuit bracelet', 'Bristle bot race', 'Bottle-cap car', 'Bigger wheels, faster?', 'Crank camel', 'Clip switch', 'Design a steppe animal', 'Show day'].map((title, i) => ({ index: i + 1, title })),
    lessonCount: 8,
    softwareNeeds: 'None. QR to short videos on Tagylym.',
    safetyNotes: [
      { regulation: 'Small parts', text: 'Motor and clips → “not for 0–3” marking. Sharp template edges cut by the teacher.', toConfirm: false },
      { regulation: 'Batteries', text: 'AA alkaline only, no Li-ion.', toConfirm: false },
      TR_TOYS,
    ],
    risks: ['Low perceived value', 'Cardboard wears out', 'Teachers must source boxes'],
    scores: scores(5, 1, 2, 5, 5, 4, 2),
    prices: { b2b: 3500, b2c: 4990, grant: 2500 },
  },
  {
    ...base,
    id: 'kit-b',
    code: 'B',
    name: 'Steppe Bot',
    concept: 'A two-wheel plywood robot (3 mm birch plywood, tab-and-slot, no glue). ESP32 hosts its own Wi-Fi hotspot and a browser block editor in Kazakh/Russian. No app install; works on any school phone or old laptop, offline.',
    gradeMin: 3,
    gradeMax: 6,
    controller: 'ESP32',
    outcomes: [
      { grade: 3, text: 'Sequences and loops.' },
      { grade: 4, text: 'Sensors and conditions (if obstacle → turn).' },
      { grade: 5, text: 'Variables, line following.' },
      { grade: 6, text: 'Functions, simple data logging, mini-project.' },
    ],
    bom: [
      line('ESP32 dev board', 1, 4.0, { sourceUrl: SRC_ESP32 }),
      line('Motor driver (TB6612 / DRV8833 module)', 1, 1.2),
      line('TT motor + wheel', 2, 2.6, { sourceUrl: SRC_TT }),
      line('Ball caster', 1, 0.3),
      line('4×AA holder with switch', 1, 0.6),
      line('HC-SR04 ultrasonic', 1, 0.9),
      line('IR line sensor modules', 2, 0.8),
      line('SG90 servo', 1, 1.3),
      line('Buzzer + RGB LED', 1, 0.4),
      line('Jumper wires, screws, standoffs', 1, 1.2, { qtyLabel: 'set' }),
      line('Plywood 3 mm + laser cutting', 1, 3.0, { qtyLabel: '1 sheet' }),
      line('Carton + insert + manual', 1, 2.5),
      line('Labour (kit + QC test)', 1, 1.0, { qtyLabel: '—' }),
    ],
    manufacturing: { method: 'Laser cutting through local Almaty workshops (price per cut-metre [TO CONFIRM]); electronics from China in bulk; carrier PCB after v2 (JLCPCB-class, MOQ 100).', moq: 100, fixedCostsKZT: 0, supplierNotes: '' },
    packaging: 'Flat plywood sheet in a 30×21×5 cm printed carton with die-cut insert.',
    curriculum: [
      [1, 'Meet Steppe Bot'],
      [3, 'Square dance (loops)'],
      [5, 'Don’t hit the wall (ultrasonic)'],
      [7, 'Follow the river (line sensors)'],
      [9, 'Servo flag'],
      [11, 'Melody of dombyra notes (buzzer)'],
      [13, 'Variables: count laps'],
      [15, 'Rescue mission project (15–16)'],
    ].map(([index, title]) => ({ index: index as number, title: title as string })),
    lessonCount: 16,
    softwareNeeds: 'Firmware with embedded Blockly (Kazakh/Russian/English toolbox), stored in ESP32 flash. Optional MicroPython for G6.',
    safetyNotes: [
      { regulation: 'Batteries', text: 'AA only. Enclosed board, no exposed mains.', toConfirm: false },
      TR_TOYS,
      TR_ELEC,
      { regulation: 'Materials', text: 'Sanded plywood edges; formaldehyde class E1 plywood.', toConfirm: true },
    ],
    risks: ['Wi-Fi block editor on cheap phones', 'Laser-cut supply consistency', 'Firmware support load'],
    scores: scores(3, 4, 5, 4, 4, 3, 4),
    prices: { b2b: 19900, b2c: 24900, grant: 14900 },
  },
  {
    ...base,
    id: 'kit-c',
    code: 'C',
    name: 'Tumar Blocks',
    concept: 'Printed beams and bricks on an 8 mm grid with 4.8 mm cross-axle/pin holes, so standard Technic-style pins and axles fit. A “brain brick” holds an ESP32-C3; motor bricks hold N20 or TT motors. Rebuild into a car, crane or sorting arm. Marketing wording “compatible with standard Technic-style pins” [TO CONFIRM legal wording].',
    gradeMin: 2,
    gradeMax: 6,
    controller: 'ESP32-C3',
    outcomes: [
      { grade: 2, text: 'Structures and stability.' },
      { grade: 3, text: 'Gears and ratios.' },
      { grade: 4, text: 'Programming with blocks.' },
      { grade: 5, text: 'Mechanisms (levers, linkages); design-iterate-test (G5–6).' },
    ],
    bom: [
      line('Filament 120 g PETG/PLA', 1, 2.4),
      line('Print farm machine time + power + failures', 1, 3.0),
      line('ESP32-C3 mini + driver', 1, 4.5, { sourceUrl: SRC_ESP32 }),
      line('2 motors + wheels', 1, 2.6, { sourceUrl: SRC_TT }),
      line('Sensors (ultrasonic, 2 IR, button)', 1, 2.0),
      line('Battery box 4×AA', 1, 0.6),
      line('Pins and axles (bought)', 1, 1.0),
      line('Tray box + manual', 1, 2.5),
      line('Labour (sort + pack + QC)', 1, 1.5),
    ],
    manufacturing: {
      method: 'Phase 1: print farm (5–10 FDM printers, PLA/PETG), ~120 g filament and ~6–8 h per kit. Phase 2: injection mold for the 6 most common parts once demand passes ~5,000 kits (≈ $14 per kit at 10k, estimate).',
      moq: 50,
      fixedCostsKZT: 0,
      supplierNotes: `Mold example ~$3,600; print-vs-mold break-even ~13,000 parts for that part (${SRC_MOLD}). Mold MOQ 3,000.`,
    },
    packaging: 'Sorting tray box with 6 compartments; part map printed on the lid.',
    curriculum: [1, 2, 3, 4].map((b) => ({ index: (b - 1) * 5 + 1, title: `Build ${b} (5 lessons)` })),
    lessonCount: 20,
    softwareNeeds: 'Same Blockly firmware as Steppe Bot (shared codebase).',
    safetyNotes: [
      { regulation: 'Mechanical', text: 'Print tolerance on pins; PLA edges; small-parts warning.', toConfirm: false },
      { regulation: 'TR CU 008/2011 (toys)', text: 'Chemical migration testing of PLA/PETG.', toConfirm: true },
    ],
    risks: ['Print time (~6–8 h per kit)', 'Dimensional drift', 'Part breakage', 'Slow to scale without molds'],
    scores: scores(3, 3, 5, 2, 3, 2, 4),
    prices: { b2b: 24900, b2c: 29900 },
  },
  {
    ...base,
    id: 'kit-d',
    code: 'D',
    name: 'Ertegi Cards',
    nameKk: 'Ертегі',
    concept: 'Children line up printed cards (forward, turn, repeat, sound, if-obstacle), swipe the row under the robot’s RFID reader and press Go. Cards double as a Kazakh fairy-tale map game (“ertegi” = tale). No screens, so it suits rural classrooms without devices.',
    gradeMin: 1,
    gradeMax: 3,
    controller: 'ESP32',
    outcomes: [
      { grade: 1, text: 'Sequencing and direction words in Kazakh and Russian.' },
      { grade: 2, text: 'Debugging (find the wrong card).' },
      { grade: 3, text: 'Loops, simple conditions, functions (grade 4 extension with “function” cards).' },
    ],
    bom: [
      line('ESP32 + driver', 1, 5.2, { sourceUrl: SRC_ESP32 }),
      line('2 TT motors + wheels + caster', 1, 2.9, { sourceUrl: SRC_TT }),
      line('RC522 RFID reader', 1, 1.5),
      line('30 NTAG cards printed', 30, 3.6),
      line('Buzzer, RGB LED, Go button, IR bumper', 1, 1.0),
      line('4×AA holder', 1, 0.6),
      line('Shell (plywood) + fasteners', 1, 3.5),
      line('A2 map mat', 1, 1.2),
      line('Box + teacher card', 1, 2.5),
      line('Labour', 1, 1.2),
    ],
    manufacturing: { method: 'Plywood or molded shell, RC522 RFID + NTAG cards, ESP32. Alternative: ESP32-CAM reading printed markers (cheaper cards, worse in poor light). Default RFID.', moq: 100, fixedCostsKZT: 0, supplierNotes: '' },
    packaging: 'Box with 30 cards and an A2 fold-out tale map mat.',
    curriculum: ['Go to the yurt', 'Help the camel find water', 'Repeat the dance', 'Fix the broken path', 'Aldar Kose’s trick (if-obstacle)'].map((title, i) => ({ index: i + 1, title })),
    lessonCount: 12,
    softwareNeeds: 'Firmware only. Optional teacher app later (reads robot logs by Bluetooth).',
    safetyNotes: [{ regulation: 'Cards', text: 'Laminated, rounded corners.', toConfirm: false }, TR_TOYS, TR_ELEC],
    risks: ['Only 1 robot per 4 kids', 'Cards get lost (sell refill packs)'],
    scores: scores(3, 4, 3, 3, 5, 5, 5),
    prices: { b2b: 26900, b2c: 32900, refill: 2900 },
  },
  {
    ...base,
    id: 'kit-e',
    code: 'E',
    name: 'Teacher Box',
    concept: 'A plastic crate for a class of 24: 6 robots of the chosen kit + 12 Qagaz Bot envelopes + spare-parts bag + 48 AA rechargeable cells and 2 chargers + printed teacher guide (KZ/RU) + 1-day training certificate. Treated as a “sell as Teacher Box too” toggle on another option, not a competitor.',
    gradeMin: 1,
    gradeMax: 6,
    outcomes: [],
    bom: [
      line('Spare-parts bag', 1, 8000, { currency: 'KZT', unitCost: 8000 }),
      line('48 AA rechargeable cells + 2 chargers', 1, 20000, { currency: 'KZT', unitCost: 20000 }),
      line('Plastic crate', 1, 4000, { currency: 'KZT', unitCost: 4000 }),
      line('Printed teacher guide (KZ/RU)', 1, 3000, { currency: 'KZT', unitCost: 3000 }),
    ],
    manufacturing: { method: 'Packs 6 robots of the chosen kit + 12 Qagaz Bot envelopes with the extras above.', moq: 1, fixedCostsKZT: 0, supplierNotes: 'Needs training capacity.' },
    packaging: 'Plastic crate for a class of 24.',
    curriculum: [],
    lessonCount: 0,
    softwareNeeds: 'As the chosen kit.',
    safetyNotes: [],
    risks: ['Long procurement cycles', 'Needs training capacity'],
    scores: scores(3, 3, 3, 3, 3, 3, 3),
    prices: { b2b: 229000, grant: 199000 },
    isTeacherBox: true,
  },
];

export const CRITERIA: { id: Criterion; label: string; hint: string }[] = [
  { id: 'cost', label: 'Cost', hint: 'low is good, already inverted' },
  { id: 'durability', label: 'Durability', hint: '' },
  { id: 'learningDepth', label: 'Learning depth', hint: '' },
  { id: 'scalability', label: 'Scalability', hint: 'manufacturing' },
  { id: 'rural', label: 'Rural suitability', hint: 'no devices, no internet' },
  { id: 'teacherEffort', label: 'Teacher effort', hint: 'low is good' },
  { id: 'uniqueness', label: 'Uniqueness', hint: '' },
];

export const DEFAULT_WEIGHTS: Weights = { cost: 9, durability: 6, learningDepth: 8, scalability: 7, rural: 9, teacherEffort: 6, uniqueness: 5 };

/** Built-in presets (the user can save their own). */
export const PRESETS: { name: string; weights: Weights }[] = [
  { name: 'Default', weights: DEFAULT_WEIGHTS },
  { name: 'Rural first', weights: { cost: 8, durability: 6, learningDepth: 5, scalability: 5, rural: 10, teacherEffort: 7, uniqueness: 3 } },
  { name: 'Learning first', weights: { cost: 5, durability: 6, learningDepth: 10, scalability: 4, rural: 6, teacherEffort: 4, uniqueness: 6 } },
  { name: 'Cheapest', weights: { cost: 10, durability: 4, learningDepth: 3, scalability: 7, rural: 5, teacherEffort: 4, uniqueness: 2 } },
  { name: 'Balanced', weights: { cost: 5, durability: 5, learningDepth: 5, scalability: 5, rural: 5, teacherEffort: 5, uniqueness: 5 } },
];

export const DEFAULT_FX: FxSetting = { usdToKzt: 450, updatedAt: '2026-11-01', history: [] };

export const DEFAULT_ECON: EconInputs = {
  labourKZT: 0,
  packKZT: 0,
  freightKZT: 0,
  dutyPct: 16, // user, 1 Nov 2026
  defectPct: 0,
  kaspiFeePct: 12.5, // electronics example [TO CONFIRM toy/constructor category]
  kaspiDeliveryKZT: 1699, // top of 799–1,699 ₸ [TO CONFIRM]
  unitsPerOrder: 1,
};

/** Teacher Box contents (Option E): 6 robots of the chosen kit + 12 Qagaz Bot envelopes + extras. */
export const TEACHER_BOX = { robots: 6, qagaz: 12, qagazId: 'kit-a' };
