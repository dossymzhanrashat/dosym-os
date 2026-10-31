import * as THREE from 'three';

/*
 * Kit robots built in code (SPEC Module 3 › Visuals and 3D, WEB EDITION; no model files).
 * One preset per option: Qagaz Bot a low, wide cardboard box on bottle-cap wheels; Steppe Bot a
 * flat plywood deck with tabs, ESP32 board and ultrasonic "eyes"; Tumar Blocks stacked beams with
 * a hole pattern; Ertegi Cards a rounded shell with a card slot at the front. Every part has an
 * assembled position and an explode vector: position = assembled + t · explode · 1.6.
 * Style presets: cardboard, plywood, glossy plastic, Deep Blue brand (brand colours only; warm
 * amber on one part only). Sizes in metres (a kit robot is ~20 cm).
 */

export type Slot = 'body' | 'wheel' | 'accent' | 'board' | 'metal' | 'card' | 'sensor';
export type Shape = 'box' | 'cyl' | 'sphere' | 'shell' | 'beam';
export type StylePreset = 'cardboard' | 'plywood' | 'glossy' | 'brand';
export type RobotPreset = 'cardboard-bot' | 'plywood-bot' | 'beam-bot' | 'card-bot';

type V3 = [number, number, number];

export interface PartSpec {
  id: string;
  name: string;
  shape: Shape;
  size: V3; // box: w,h,d · cyl: radius, length, - (axis along x) · sphere/shell: radius scale x,y,z
  pos: V3;
  explode: V3;
  slot: Slot;
  /** Finds this part's line in the option's BOM, for the cost label. */
  bom?: RegExp;
  axis?: 'x' | 'y' | 'z'; // cylinders: default x (wheels)
}

export interface AssemblyStep {
  parts: string[];
  caption: string;
}

export interface RobotSpec {
  preset: RobotPreset;
  parts: PartSpec[];
  steps: AssemblyStep[];
}

export interface KitStyle {
  preset: StylePreset;
  body: string;
  wheels: string;
  accent: string;
}

/** Brand colours plus six kid-friendly ones (the colour configurator's palette). */
export const PALETTE = ['#8ff1ff', '#5fb8ff', '#7f88ff', '#c27bff', '#ffb36b', '#7dffb0', '#050a16', '#e4ecff', '#ff5a5f', '#ffd23f', '#3bceac', '#ee6c4d', '#2a9d8f', '#f4a6c1'];

export const DEFAULT_STYLE: Record<StylePreset, KitStyle> = {
  cardboard: { preset: 'cardboard', body: '#b98a5a', wheels: '#ee6c4d', accent: '#ffd23f' },
  plywood: { preset: 'plywood', body: '#d9b98a', wheels: '#2a2f3a', accent: '#3bceac' },
  glossy: { preset: 'glossy', body: '#5fb8ff', wheels: '#050a16', accent: '#ffd23f' },
  brand: { preset: 'brand', body: '#8ff1ff', wheels: '#7f88ff', accent: '#ffb36b' },
};

/** Two colours too close to tell apart (simple RGB distance). */
export function tooClose(a: string, b: string): boolean {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b) * 255 < 70;
}

const wheelPair = (x: number, y: number, z: number, r: number, w: number, bom: RegExp): PartSpec[] => [
  { id: 'wheel-l', name: 'Wheel (left)', shape: 'cyl', size: [r, w, 0], pos: [x, y, z], explode: [0, 0, 0.09], slot: 'wheel', bom, axis: 'z' },
  { id: 'wheel-r', name: 'Wheel (right)', shape: 'cyl', size: [r, w, 0], pos: [x, y, -z], explode: [0, 0, -0.09], slot: 'wheel', bom, axis: 'z' },
];

export const ROBOTS: Record<RobotPreset, RobotSpec> = {
  'cardboard-bot': {
    preset: 'cardboard-bot',
    parts: [
      { id: 'body', name: 'Cereal-box body', shape: 'box', size: [0.22, 0.07, 0.15], pos: [0, 0.06, 0], explode: [0, 0, 0], slot: 'body', bom: /template/i },
      ...wheelPair(0.07, 0.035, 0.085, 0.035, 0.012, /fasteners|clips/i),
      { id: 'wheel-fl', name: 'Bottle-cap wheel', shape: 'cyl', size: [0.035, 0.012, 0], pos: [-0.07, 0.035, 0.085], explode: [-0.02, 0, 0.09], slot: 'wheel', axis: 'z' },
      { id: 'wheel-fr', name: 'Bottle-cap wheel', shape: 'cyl', size: [0.035, 0.012, 0], pos: [-0.07, 0.035, -0.085], explode: [-0.02, 0, -0.09], slot: 'wheel', axis: 'z' },
      { id: 'motor', name: 'TT gear motor', shape: 'box', size: [0.07, 0.022, 0.022], pos: [0.05, 0.106, 0], explode: [0, 0.07, 0], slot: 'metal', bom: /tt gear motor/i },
      { id: 'battery', name: '2×AA holder + switch', shape: 'box', size: [0.06, 0.018, 0.035], pos: [-0.045, 0.104, 0.02], explode: [-0.03, 0.08, 0.03], slot: 'board', bom: /holder/i },
      { id: 'led', name: 'LED + coin cell', shape: 'sphere', size: [0.009, 0.009, 0.009], pos: [-0.1, 0.1, -0.04], explode: [-0.06, 0.06, 0], slot: 'accent', bom: /led/i },
    ],
    steps: [
      { parts: ['body'], caption: 'Fold the printed template into the box body.' },
      { parts: ['wheel-l', 'wheel-r', 'wheel-fl', 'wheel-fr'], caption: 'Push the bottle-cap wheels onto the paper axles.' },
      { parts: ['motor'], caption: 'Clip the motor on top.' },
      { parts: ['battery', 'led'], caption: 'Add the battery pack and the LED, then switch on.' },
    ],
  },
  'plywood-bot': {
    preset: 'plywood-bot',
    parts: [
      { id: 'deck', name: 'Plywood deck (tab-and-slot)', shape: 'box', size: [0.2, 0.012, 0.13], pos: [0, 0.05, 0], explode: [0, 0, 0], slot: 'body', bom: /plywood/i },
      { id: 'tab-f', name: 'Front tab plate', shape: 'box', size: [0.012, 0.04, 0.13], pos: [-0.094, 0.076, 0], explode: [-0.06, 0.02, 0], slot: 'body' },
      { id: 'tab-b', name: 'Back tab plate', shape: 'box', size: [0.012, 0.04, 0.13], pos: [0.094, 0.076, 0], explode: [0.06, 0.02, 0], slot: 'body' },
      ...wheelPair(0.045, 0.035, 0.08, 0.035, 0.022, /tt motor/i),
      { id: 'caster', name: 'Ball caster', shape: 'sphere', size: [0.013, 0.013, 0.013], pos: [-0.075, 0.013, 0], explode: [0, -0.05, 0], slot: 'metal', bom: /caster/i },
      { id: 'battery', name: '4×AA holder', shape: 'box', size: [0.065, 0.016, 0.06], pos: [0.01, 0.034, 0], explode: [0, -0.07, 0], slot: 'board', bom: /holder/i },
      { id: 'esp32', name: 'ESP32 board', shape: 'box', size: [0.055, 0.006, 0.028], pos: [0.02, 0.06, 0], explode: [0, 0.08, 0], slot: 'board', bom: /esp32/i },
      { id: 'driver', name: 'Motor driver', shape: 'box', size: [0.022, 0.006, 0.022], pos: [0.065, 0.06, 0.03], explode: [0.03, 0.07, 0.03], slot: 'board', bom: /driver/i },
      { id: 'sonar', name: 'HC-SR04 ultrasonic', shape: 'box', size: [0.012, 0.022, 0.046], pos: [-0.09, 0.108, 0], explode: [-0.07, 0.04, 0], slot: 'sensor', bom: /hc-sr04/i },
      { id: 'eye-l', name: 'Ultrasonic eye', shape: 'cyl', size: [0.008, 0.012, 0], pos: [-0.1, 0.108, 0.012], explode: [-0.09, 0.04, 0], slot: 'metal', axis: 'x' },
      { id: 'eye-r', name: 'Ultrasonic eye', shape: 'cyl', size: [0.008, 0.012, 0], pos: [-0.1, 0.108, -0.012], explode: [-0.09, 0.04, 0], slot: 'metal', axis: 'x' },
      { id: 'servo', name: 'SG90 servo + flag', shape: 'box', size: [0.023, 0.022, 0.012], pos: [0.07, 0.068, -0.035], explode: [0.04, 0.06, -0.04], slot: 'accent', bom: /servo/i },
      { id: 'ir', name: 'IR line sensors', shape: 'box', size: [0.02, 0.004, 0.06], pos: [-0.07, 0.04, 0], explode: [-0.02, -0.06, 0], slot: 'board', bom: /ir line/i },
    ],
    steps: [
      { parts: ['deck', 'tab-f', 'tab-b'], caption: 'Slot the plywood deck and the two tab plates together (no glue).' },
      { parts: ['wheel-l', 'wheel-r', 'caster'], caption: 'Fix both motors with wheels, and the ball caster at the front.' },
      { parts: ['battery', 'ir'], caption: 'Battery holder and the line sensors go underneath.' },
      { parts: ['esp32', 'driver'], caption: 'Screw the ESP32 and the motor driver onto the deck.' },
      { parts: ['sonar', 'eye-l', 'eye-r', 'servo'], caption: 'Mount the ultrasonic “eyes” and the servo flag. Switch on and open the block editor.' },
    ],
  },
  'beam-bot': {
    preset: 'beam-bot',
    parts: [
      { id: 'beam-1', name: 'Beam 15-hole', shape: 'beam', size: [0.12, 0.008, 0.008], pos: [0, 0.045, 0.04], explode: [0, 0, 0.06], slot: 'body', bom: /filament/i },
      { id: 'beam-2', name: 'Beam 15-hole', shape: 'beam', size: [0.12, 0.008, 0.008], pos: [0, 0.045, -0.04], explode: [0, 0, -0.06], slot: 'body', bom: /filament/i },
      { id: 'beam-3', name: 'Cross beam', shape: 'beam', size: [0.008, 0.008, 0.088], pos: [0.05, 0.053, 0], explode: [0.03, 0.05, 0], slot: 'body' },
      { id: 'beam-4', name: 'Cross beam', shape: 'beam', size: [0.008, 0.008, 0.088], pos: [-0.05, 0.053, 0], explode: [-0.03, 0.05, 0], slot: 'body' },
      { id: 'brain', name: 'Brain brick (ESP32-C3)', shape: 'box', size: [0.048, 0.024, 0.04], pos: [0, 0.07, 0], explode: [0, 0.09, 0], slot: 'board', bom: /esp32/i },
      { id: 'motor-l', name: 'Motor brick', shape: 'box', size: [0.032, 0.024, 0.016], pos: [0.035, 0.03, 0.025], explode: [0, -0.05, 0.03], slot: 'accent', bom: /motors/i },
      { id: 'motor-r', name: 'Motor brick', shape: 'box', size: [0.032, 0.024, 0.016], pos: [0.035, 0.03, -0.025], explode: [0, -0.05, -0.03], slot: 'accent', bom: /motors/i },
      ...wheelPair(0.035, 0.03, 0.06, 0.03, 0.014, /motors/i),
      { id: 'sensor', name: 'Sensor brick', shape: 'box', size: [0.016, 0.016, 0.04], pos: [-0.066, 0.06, 0], explode: [-0.07, 0.03, 0], slot: 'sensor', bom: /sensors/i },
      { id: 'pins', name: 'Pins and axles', shape: 'cyl', size: [0.0024, 0.1, 0], pos: [-0.035, 0.03, 0], explode: [0, -0.04, 0], slot: 'metal', bom: /pins/i, axis: 'z' },
    ],
    steps: [
      { parts: ['beam-1', 'beam-2', 'beam-3', 'beam-4'], caption: 'Pin the four beams into a frame.' },
      { parts: ['motor-l', 'motor-r', 'pins'], caption: 'Snap the two motor bricks under the frame; slide in the axle.' },
      { parts: ['wheel-l', 'wheel-r'], caption: 'Press the wheels onto the motor shafts.' },
      { parts: ['brain', 'sensor'], caption: 'Click the brain brick on top and the sensor brick at the front.' },
    ],
  },
  'card-bot': {
    preset: 'card-bot',
    parts: [
      { id: 'shell', name: 'Rounded shell', shape: 'shell', size: [0.09, 0.05, 0.075], pos: [0, 0.06, 0], explode: [0, 0.09, 0], slot: 'body', bom: /shell/i },
      { id: 'base', name: 'Base plate', shape: 'box', size: [0.16, 0.01, 0.13], pos: [0, 0.03, 0], explode: [0, 0, 0], slot: 'body' },
      { id: 'slot', name: 'Card slot + RFID reader', shape: 'box', size: [0.02, 0.012, 0.07], pos: [-0.085, 0.05, 0], explode: [-0.07, 0.03, 0], slot: 'sensor', bom: /rc522/i },
      ...wheelPair(0.03, 0.03, 0.075, 0.03, 0.016, /tt motors/i),
      { id: 'caster', name: 'Ball caster', shape: 'sphere', size: [0.01, 0.01, 0.01], pos: [-0.06, 0.012, 0], explode: [0, -0.04, 0], slot: 'metal', bom: /tt motors/i },
      { id: 'go', name: 'Go button', shape: 'cyl', size: [0.012, 0.008, 0], pos: [0, 0.114, 0], explode: [0, 0.14, 0], slot: 'accent', bom: /go button/i, axis: 'y' },
      { id: 'esp32', name: 'ESP32 + driver', shape: 'box', size: [0.05, 0.006, 0.03], pos: [0.01, 0.04, 0], explode: [0.02, 0.06, 0.05], slot: 'board', bom: /esp32/i },
      { id: 'card-1', name: 'NTAG card “forward”', shape: 'box', size: [0.04, 0.002, 0.055], pos: [-0.16, 0.001, 0], explode: [-0.03, 0, 0], slot: 'card', bom: /ntag/i },
      { id: 'card-2', name: 'NTAG card “turn”', shape: 'box', size: [0.04, 0.002, 0.055], pos: [-0.21, 0.001, 0], explode: [-0.05, 0, 0], slot: 'card', bom: /ntag/i },
      { id: 'card-3', name: 'NTAG card “repeat”', shape: 'box', size: [0.04, 0.002, 0.055], pos: [-0.26, 0.001, 0], explode: [-0.07, 0, 0], slot: 'card', bom: /ntag/i },
    ],
    steps: [
      { parts: ['base', 'wheel-l', 'wheel-r', 'caster'], caption: 'Wheels and caster on the base plate.' },
      { parts: ['esp32', 'slot'], caption: 'ESP32 board and the RFID card slot at the front.' },
      { parts: ['shell', 'go'], caption: 'Close the shell and fit the Go button.' },
      { parts: ['card-1', 'card-2', 'card-3'], caption: 'Lay out the cards, swipe the row through the slot, press Go.' },
    ],
  },
};

/** Which robot an option shows. */
export function presetFor(code: string, controller?: string): RobotPreset {
  if (code === 'A') return 'cardboard-bot';
  if (code === 'C' || /c3/i.test(controller ?? '')) return 'beam-bot';
  if (code === 'D') return 'card-bot';
  return 'plywood-bot';
}

// ---------- Materials ----------

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Corrugated cardboard: soft vertical flutes. */
const corrugation = (base: string) =>
  canvasTex((g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(x, 0, 3, s);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x + 4, 0, 2, s);
    }
  });

/** Plywood: sine-noise grain stripes. */
const woodGrain = (base: string) =>
  canvasTex((g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      const v = Math.sin(y * 0.11) * 0.5 + Math.sin(y * 0.031 + 1.3) * 0.5;
      g.fillStyle = `rgba(110,70,30,${0.06 + 0.08 * (v + 1) * 0.5})`;
      g.fillRect(0, y, s, 1);
    }
  });

function slotMaterial(slot: Slot, style: KitStyle, textures: THREE.Texture[]): THREE.Material {
  const p = style.preset;
  const make = (params: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ roughness: 0.6, ...params });
  if (slot === 'board') return make({ color: p === 'brand' ? '#050a16' : '#1f5c47', roughness: 0.5, emissive: p === 'brand' ? '#7f88ff' : '#000000', emissiveIntensity: p === 'brand' ? 0.15 : 0 });
  if (slot === 'metal') return make({ color: p === 'brand' ? '#5fb8ff' : '#a9b2c3', metalness: 0.7, roughness: 0.3 });
  if (slot === 'card') return make({ color: p === 'brand' ? '#e4ecff' : '#f5efe2', roughness: 0.8 });
  if (slot === 'sensor') return make({ color: p === 'brand' ? style.accent : '#2f6fb3', roughness: 0.4, emissive: p === 'brand' ? style.accent : '#000000', emissiveIntensity: p === 'brand' ? 0.3 : 0 }); // brand: the one amber part
  if (slot === 'accent') return make({ color: p === 'brand' ? '#c27bff' : style.accent, roughness: p === 'glossy' ? 0.15 : 0.5, clearcoat: p === 'glossy' ? 1 : 0 });
  if (slot === 'wheel') return make({ color: style.wheels, roughness: p === 'glossy' || p === 'brand' ? 0.2 : 0.7, clearcoat: p === 'glossy' ? 1 : 0 });
  // body
  if (p === 'cardboard') {
    const t = corrugation(style.body);
    if (t) textures.push(t);
    return make({ color: '#ffffff', map: t ?? undefined, roughness: 0.95 });
  }
  if (p === 'plywood') {
    const t = woodGrain(style.body);
    if (t) textures.push(t);
    return make({ color: '#ffffff', map: t ?? undefined, roughness: 0.75 });
  }
  if (p === 'brand') return make({ color: '#8ff1ff', roughness: 0.1, transparent: true, opacity: 0.82, clearcoat: 1, emissive: '#8ff1ff', emissiveIntensity: 0.06 });
  return make({ color: style.body, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
}

function geometryFor(p: PartSpec): THREE.BufferGeometry {
  const [a, b, c] = p.size;
  switch (p.shape) {
    case 'box':
      return new THREE.BoxGeometry(a, b, c);
    case 'cyl': {
      const g = new THREE.CylinderGeometry(a, a, b, p.slot === 'wheel' ? 28 : 12);
      if ((p.axis ?? 'x') === 'x') g.rotateZ(Math.PI / 2);
      if (p.axis === 'z') g.rotateX(Math.PI / 2);
      return g;
    }
    case 'sphere':
      return new THREE.SphereGeometry(a, 16, 12);
    case 'shell': {
      const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(a, b, c);
      return g;
    }
    case 'beam':
      return new THREE.BoxGeometry(a, b, c);
  }
}

export interface Robot {
  group: THREE.Group;
  parts: Map<string, THREE.Mesh>;
  /** 0 = assembled, 1 = exploded, per part (assembly steps animate parts one group at a time). */
  setExplode(t: number | ((id: string) => number)): void;
  highlight(ids: string[]): void;
  /** Where a part sits at explode t (for labels). */
  positionOf(id: string, t: number): THREE.Vector3;
  dispose(): void;
}

export function buildRobot(spec: RobotSpec, style: KitStyle): Robot {
  const group = new THREE.Group();
  group.name = spec.preset;
  const parts = new Map<string, THREE.Mesh>();
  const textures: THREE.Texture[] = [];
  const mats = new Map<Slot, THREE.Material>();
  const matFor = (slot: Slot) => mats.get(slot) ?? mats.set(slot, slotMaterial(slot, style, textures)).get(slot)!;
  const holeMat = new THREE.MeshStandardMaterial({ color: '#0b1022', roughness: 0.9 });
  const holeGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 0.0005, 10);

  for (const p of spec.parts) {
    // Each part gets its own material copy so highlighting one does not light up the others.
    const mesh = new THREE.Mesh(geometryFor(p), matFor(p.slot).clone());
    mesh.name = p.name;
    mesh.userData = { id: p.id };
    mesh.position.set(...p.pos);
    // Beams: a row of dark discs as the 4.8 mm hole pattern on the visible face.
    if (p.shape === 'beam') {
      const long = p.size[0] >= p.size[2];
      const n = Math.floor((long ? p.size[0] : p.size[2]) / 0.008);
      const holes = new THREE.InstancedMesh(holeGeo, holeMat, n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const off = -((n - 1) * 0.008) / 2 + i * 0.008;
        d.position.set(long ? off : 0, p.size[1] / 2 + 0.0003, long ? 0 : off);
        d.updateMatrix();
        holes.setMatrixAt(i, d.matrix);
      }
      holes.userData = { id: p.id };
      mesh.add(holes);
    }
    group.add(mesh);
    parts.set(p.id, mesh);
  }

  const positionOf = (id: string, t: number) => {
    const p = spec.parts.find((x) => x.id === id)!;
    return new THREE.Vector3(p.pos[0] + t * p.explode[0] * 1.6, p.pos[1] + t * p.explode[1] * 1.6, p.pos[2] + t * p.explode[2] * 1.6);
  };

  return {
    group,
    parts,
    positionOf,
    setExplode(t) {
      for (const p of spec.parts) parts.get(p.id)!.position.copy(positionOf(p.id, typeof t === 'number' ? t : t(p.id)));
    },
    highlight(ids) {
      for (const [id, m] of parts) {
        const mat = m.material as THREE.MeshPhysicalMaterial;
        mat.userData.base ??= { e: mat.emissive.getHex(), i: mat.emissiveIntensity };
        const on = ids.includes(id);
        mat.emissive.setHex(on ? 0x5fb8ff : mat.userData.base.e);
        mat.emissiveIntensity = on ? 0.6 : mat.userData.base.i;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      for (const m of mats.values()) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
