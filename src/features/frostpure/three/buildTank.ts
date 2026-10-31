import * as THREE from 'three';
import type { TankState } from './tankState';

/*
 * The FrostPure unit, built in code (SPEC Module 2 › 4 Procedural build; no model files).
 * Tank (transparent, thin wall) in an insulation jacket with a hatched texture; inside, ice on
 * top, a glowing wavy freeze front, violet brine below with salt dots sinking — ice on top,
 * brine below, never flipped. Parts: temperature string (5 beads), EC1 probe, level sensor,
 * V2 drain valve and pipe, V3 diverter, brine pit, clean-water store, controller box, solar
 * panel. Each part carries userData.tag (and the BOM item id it opens). Under 50k triangles.
 */

export const COLORS = {
  ice: '#e4ecff',
  iceEdge: '#8ff1ff',
  front: '#8ff1ff',
  brineLight: '#7f88ff',
  brineDeep: '#c27bff',
  salt: '#0b1022',
  wall: '#bfe9ff',
  jacket: '#c3d8e2',
  metal: '#9aa7c0',
  dark: '#131c33',
  panel: '#1b2a5c',
  warm: '#ffb36b',
  ground: '#081022',
  snow: '#dfe8f7',
};

export interface PartInfo {
  tag: string; // label number in the Unit Design drawing order
  name: string;
  bomId?: string;
  anchor: THREE.Vector3; // where the label sits
}

export const PARTS: PartInfo[] = [
  { tag: '1', name: 'Tank', bomId: 'bom-drum', anchor: new THREE.Vector3(0, 1.32, 0) },
  { tag: '2', name: 'Insulation (XPS)', bomId: 'bom-xps', anchor: new THREE.Vector3(-0.62, 0.9, 0) },
  { tag: '3', name: 'Temperature string T1–T5', bomId: 'bom-ds18b20', anchor: new THREE.Vector3(0.18, 1.45, 0) },
  { tag: '4', name: 'EC1 probe', bomId: 'bom-ec-probes', anchor: new THREE.Vector3(-0.25, 0.28, 0.2) },
  { tag: '5', name: 'Level sensor', bomId: 'bom-level', anchor: new THREE.Vector3(-0.2, 1.42, 0.1) },
  { tag: '6', name: 'V2 drain valve', bomId: 'bom-ball-valves', anchor: new THREE.Vector3(0.78, 0.2, 0) },
  { tag: '7', name: 'V3 diverter', bomId: 'bom-ball-valves', anchor: new THREE.Vector3(1.05, 0.12, 0) },
  { tag: '8', name: 'Brine pit', anchor: new THREE.Vector3(1.05, -0.05, 0.45) },
  { tag: '9', name: 'Clean-water store', bomId: 'bom-clean-store', anchor: new THREE.Vector3(1.05, 0.55, -0.55) },
  { tag: '10', name: 'Controller box (Pi)', bomId: 'bom-enclosure', anchor: new THREE.Vector3(-0.95, 0.75, 0) },
  { tag: '11', name: 'Solar panel', bomId: 'bom-solar', anchor: new THREE.Vector3(-1.05, 1.5, -0.4) },
];

const R = 0.5; // tank radius
const H = 1.2; // tank height
const SEG = 40;

export interface Tank {
  group: THREE.Group;
  /** Meshes per part tag (for picking and highlighting). */
  parts: Map<string, THREE.Object3D[]>;
  update(state: TankState, seconds: number): void;
  setXray(on: boolean): void;
  setSection(on: boolean): void;
  setOwned(owned: (bomId: string) => boolean): void;
  highlight(tag: string | null): void;
  dispose(): void;
}

function canvasTexture(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256): THREE.Texture | null {
  if (typeof document === 'undefined') return null; // tests run without a DOM
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function hatchTexture() {
  return canvasTexture((g, s) => {
    g.fillStyle = COLORS.jacket;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(95,184,255,0.55)';
    g.lineWidth = 6;
    for (let i = -s; i < s * 2; i += 28) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + s, s);
      g.stroke();
    }
  });
}

/** Not tappable: big see-through surfaces (tank wall, jacket, water layers, ground) would catch every touch. */
const noPick = (o: THREE.Object3D) => {
  o.raycast = () => {};
  return o;
};

/** An invisible, slightly larger touch area for a thin part (a finger is ~1 cm wide). */
function hitProxy(tag: string, radius: number, length: number, at: THREE.Vector3, axis: 'x' | 'y' = 'y') {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
  m.position.copy(at);
  m.userData = { tag, proxy: true };
  return m;
}

const tagged = <T extends THREE.Object3D>(o: T, tag: string): T => {
  o.userData.tag = tag;
  o.traverse((c) => (c.userData.tag = tag));
  return o;
};

export function buildTank(): Tank {
  const group = new THREE.Group();
  group.name = 'FrostPure unit';
  const parts = new Map<string, THREE.Object3D[]>();
  const add = (tag: string, o: THREE.Object3D, parent: THREE.Object3D = group) => {
    tagged(o, tag);
    parent.add(o);
    parts.set(tag, [...(parts.get(tag) ?? []), o]);
    return o;
  };
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // keeps z < 0: the front half is cut away
  const clipped: THREE.Material[] = [];
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}, clipMe = false) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra });
    if (clipMe) clipped.push(m);
    return m;
  };

  // Ground: dark steppe with a soft snow disc.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), std(COLORS.ground, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.name = 'ground';
  group.add(noPick(ground));
  const snow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), std(COLORS.snow, { roughness: 1, transparent: true, opacity: 0.18 }));
  snow.rotation.x = -Math.PI / 2;
  snow.position.y = -0.195;
  snow.name = 'ground';
  group.add(noPick(snow));

  // Tank wall: transparent, thin, double-sided.
  const wallMat = std(COLORS.wall, { transparent: true, opacity: 0.25, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false }, true);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, SEG, 1, true), wallMat);
  wall.position.y = H / 2;
  add('1', noPick(wall));
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R, SEG), wallMat);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.002;
  add('1', noPick(bottom));

  // Insulation jacket (sides and bottom; top open with mesh).
  const hatch = hatchTexture();
  if (hatch) hatch.repeat.set(6, 3);
  const jacketMat = std(COLORS.jacket, { map: hatch ?? undefined, transparent: true, opacity: 0.85, side: THREE.DoubleSide, roughness: 0.9 }, true);
  const jacket = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, H * 0.95, SEG, 1, true), jacketMat);
  jacket.position.y = (H * 0.95) / 2 - 0.05;
  add('2', noPick(jacket));
  const jacketBase = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.06, SEG), jacketMat);
  jacketBase.position.y = -0.05;
  add('2', noPick(jacketBase));

  // Inside: ice (top), freeze front (wavy glowing ring), brine (bottom).
  const iceMat = std(COLORS.ice, { transparent: true, opacity: 0.9, roughness: 0.2, emissive: COLORS.iceEdge, emissiveIntensity: 0.08 }, true);
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 1, SEG), iceMat);
  group.add(noPick(ice));

  const frontGeo = new THREE.CylinderGeometry(R - 0.015, R - 0.015, 0.03, 64, 1, true);
  const pos = frontGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + Math.sin(a * 7) * 0.012);
  }
  const frontMat = std(COLORS.front, { emissive: COLORS.front, emissiveIntensity: 1.2, side: THREE.DoubleSide }, true);
  const front = new THREE.Mesh(frontGeo, frontMat);
  group.add(noPick(front));

  const brineGeo = new THREE.CylinderGeometry(R - 0.02, R - 0.02, 1, SEG, 4);
  const colors: number[] = [];
  const bp = brineGeo.attributes.position as THREE.BufferAttribute;
  const light = new THREE.Color(COLORS.brineLight);
  const deep = new THREE.Color(COLORS.brineDeep);
  for (let i = 0; i < bp.count; i++) {
    const c = deep.clone().lerp(light, bp.getY(i) + 0.5); // deeper violet at the bottom
    colors.push(c.r, c.g, c.b);
  }
  brineGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const brineMat = std('#ffffff', { vertexColors: true, transparent: true, opacity: 0.7, roughness: 0.3 }, true);
  const brine = new THREE.Mesh(brineGeo, brineMat);
  group.add(noPick(brine));

  // Salt dots sinking from the front into the brine (one instanced mesh).
  const SALT = 140;
  const salt = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4), std(COLORS.salt, { emissive: COLORS.brineDeep, emissiveIntensity: 0.25 }), SALT);
  const seeds = Array.from({ length: SALT }, (_, i) => {
    const r = Math.sqrt(((i * 7919) % 1000) / 1000) * (R - 0.06);
    const a = (i * 2.399963) % (Math.PI * 2);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, phase: ((i * 104729) % 1000) / 1000 };
  });
  group.add(noPick(salt));
  const dummy = new THREE.Object3D();

  // Temperature string with 5 beads.
  const stringGroup = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 8), std(COLORS.metal));
  rod.position.set(0.18, H - 0.35, 0);
  stringGroup.add(rod);
  for (let i = 0; i < 5; i++) {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), std(COLORS.warm, { emissive: COLORS.warm, emissiveIntensity: 0.25 }));
    bead.position.set(0.18, H * 0.85 - 0.06 - i * 0.12, 0);
    stringGroup.add(bead);
  }
  stringGroup.add(hitProxy('3', 0.05, 1.0, new THREE.Vector3(0.18, H - 0.35, 0)));
  add('3', stringGroup);

  // EC1 probe near the bottom.
  const probe = new THREE.Group();
  const probeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 10), std(COLORS.dark));
  probeBody.position.set(-0.25, 0.65, 0.15);
  probe.add(probeBody);
  const probeTip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), std(COLORS.metal, { metalness: 0.6 }));
  probeTip.position.set(-0.25, 0.18, 0.15);
  probe.add(probeTip);
  probe.add(hitProxy('4', 0.06, 0.95, new THREE.Vector3(-0.25, 0.62, 0.15)));
  add('4', probe);

  // Level sensor above the water.
  const level = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.03, 0.06), std(COLORS.metal));
  bar.position.set(0, H + 0.05, 0);
  level.add(bar);
  const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 16), std(COLORS.dark));
  sensor.position.set(-0.2, H + 0.0, 0.1);
  level.add(sensor);
  add('5', level);

  // V2 drain valve and pipe.
  const pipeMat = std(COLORS.metal, { metalness: 0.5, roughness: 0.35 });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 12), pipeMat);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(R + 0.3, 0.06, 0);
  add('6', pipe);
  group.add(tagged(hitProxy('6', 0.07, 0.55, new THREE.Vector3(R + 0.3, 0.06, 0), 'x'), '6'));
  const v2 = new THREE.Group();
  v2.position.set(R + 0.25, 0.06, 0);
  const v2Body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), std(COLORS.warm, { metalness: 0.5, roughness: 0.3 }));
  v2.add(v2Body);
  const v2Handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.03), std(COLORS.dark));
  v2Handle.position.y = 0.08;
  v2.add(v2Handle);
  add('6', v2);

  // V3 diverter: violet → brine pit, ice blue → clean store.
  const v3Mat = std(COLORS.brineDeep, { emissive: COLORS.brineDeep, emissiveIntensity: 0.3, metalness: 0.4 });
  const v3 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), v3Mat);
  v3.position.set(R + 0.6, 0.06, 0);
  add('7', v3);

  // Brine pit (open box in the ground).
  const pit = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.45), std(COLORS.brineDeep, { transparent: true, opacity: 0.55 }));
  pit.position.set(R + 0.6, -0.14, 0.45);
  add('8', pit);

  // Clean-water store with a fill level.
  const store = new THREE.Group();
  const storeWall = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 24, 1, true), std(COLORS.wall, { transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  storeWall.position.y = 0.275;
  store.add(storeWall);
  const storeWater = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 1, 24), std(COLORS.iceEdge, { transparent: true, opacity: 0.65, emissive: COLORS.iceEdge, emissiveIntensity: 0.2 }));
  store.add(storeWater);
  store.position.set(R + 0.6, -0.1, -0.55);
  add('9', store);

  // Controller box on a post, and the solar panel.
  const ctrl = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), pipeMat.clone());
  post.position.set(-R - 0.45, 0.3, 0);
  ctrl.add(post);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.14), std(COLORS.dark, { roughness: 0.5 }));
  box.position.set(-R - 0.45, 0.72, 0);
  ctrl.add(box);
  const ledMat = std(COLORS.iceEdge, { emissive: COLORS.iceEdge, emissiveIntensity: 1.5 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), ledMat);
  led.position.set(-R - 0.45 + 0.1, 0.78, 0.075);
  ctrl.add(led);
  add('10', ctrl);

  const solar = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.38), std(COLORS.panel, { metalness: 0.3, roughness: 0.25, emissive: '#2a3c8f', emissiveIntensity: 0.15 }));
  panel.rotation.z = Math.PI / 5;
  panel.position.set(-R - 0.55, 1.32, -0.35);
  solar.add(panel);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), pipeMat.clone());
  mast.position.set(-R - 0.55, 0.55, -0.35);
  solar.add(mast);
  add('11', solar);

  // Outlines (X-ray and "not owned yet"): edges of every part, hidden by default.
  const outlines: THREE.LineSegments[] = [];
  const dashed = new THREE.LineDashedMaterial({ color: COLORS.iceEdge, dashSize: 0.03, gapSize: 0.02 });
  for (const [tag, objs] of parts) {
    for (const o of objs) {
      o.traverse((m) => {
        if (!(m instanceof THREE.Mesh) || tag === '1' || tag === '2' || m.userData.proxy) return;
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), dashed);
        line.computeLineDistances();
        line.visible = false;
        noPick(line); // lines catch touches up to a metre away, even hidden: never let them
        line.userData = { tag, outline: true };
        m.add(line);
        outlines.push(line);
      });
    }
  }

  let xray = false;
  const owned = new Map<string, boolean>();

  const update = (s: TankState, seconds: number) => {
    const waterTop = s.water * H;
    const iceH = Math.max(0.001, s.ice * waterTop);
    ice.visible = s.ice > 0.005 && s.water > 0.02;
    ice.scale.y = iceH;
    ice.position.y = waterTop - iceH / 2;
    front.visible = ice.visible;
    front.position.y = waterTop - iceH;
    const brineTop = Math.min(waterTop - (ice.visible ? iceH : 0), s.brine * H);
    brine.visible = brineTop > 0.005;
    brine.scale.y = Math.max(0.001, brineTop);
    brine.position.y = brineTop / 2;
    brineMat.opacity = 0.45 + 0.4 * s.tint;
    brineMat.color.setScalar(1 - 0.25 * s.tint);
    // Salt dots: start at the front and sink to the bottom; hidden when there is no brine.
    const startY = ice.visible ? front.position.y : brineTop;
    for (let i = 0; i < SALT; i++) {
      const sd = seeds[i];
      const fall = (sd.phase + seconds * 0.06) % 1;
      const y = Math.max(0.02, startY - fall * Math.max(0.05, startY) * (0.3 + 0.7 * s.saltFall));
      dummy.position.set(sd.x, y, sd.z);
      dummy.scale.setScalar(brine.visible && i < SALT * Math.max(0.15, s.saltFall) ? 1 : 0.0001);
      dummy.updateMatrix();
      salt.setMatrixAt(i, dummy.matrix);
    }
    salt.instanceMatrix.needsUpdate = true;
    v2Handle.rotation.y = s.v2Open ? Math.PI / 2 : 0;
    v3Mat.color.set(s.v3 === 'brine' ? COLORS.brineDeep : COLORS.iceEdge);
    v3Mat.emissive.set(s.v3 === 'brine' ? COLORS.brineDeep : COLORS.iceEdge);
    storeWater.visible = s.clean > 0.01;
    storeWater.scale.y = Math.max(0.001, 0.5 * s.clean);
    storeWater.position.y = (0.5 * s.clean) / 2 + 0.01;
  };

  // Each part material's own look, recorded once, so toggles can restore it.
  const partMats: { tag: string; mat: THREE.MeshStandardMaterial; transparent: boolean; opacity: number; emissive: number; intensity: number }[] = [];
  for (const [tag, objs] of parts) {
    if (tag === '1' || tag === '2') continue;
    for (const o of objs)
      o.traverse((m) => {
        if (!(m instanceof THREE.Mesh) || m.userData.proxy) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (partMats.some((x) => x.mat === mat && x.tag === tag)) return;
        partMats.push({ tag, mat, transparent: mat.transparent, opacity: mat.opacity, emissive: mat.emissive.getHex(), intensity: mat.emissiveIntensity });
      });
  }
  const notOwned = (tag: string) => {
    const part = PARTS.find((p) => p.tag === tag);
    return part?.bomId ? owned.get(part.bomId) === false : false;
  };

  const applyOutlines = () => {
    for (const l of outlines) l.visible = xray || notOwned(l.userData.tag as string);
    for (const p of partMats) {
      const ghost = notOwned(p.tag);
      p.mat.transparent = ghost || p.transparent;
      p.mat.opacity = ghost ? 0.35 : p.opacity;
      p.mat.needsUpdate = true;
    }
  };

  return {
    group,
    parts,
    update,
    setXray(on) {
      xray = on;
      wallMat.opacity = on ? 0.1 : 0.25;
      jacketMat.opacity = on ? 0.1 : 0.85;
      applyOutlines();
    },
    setSection(on) {
      for (const m of clipped) {
        m.clippingPlanes = on ? [clip] : [];
        m.needsUpdate = true;
      }
    },
    setOwned(fn) {
      for (const p of PARTS) if (p.bomId) owned.set(p.bomId, fn(p.bomId));
      applyOutlines();
    },
    highlight(tag) {
      for (const p of partMats) {
        p.mat.emissive.setHex(p.emissive);
        p.mat.emissiveIntensity = p.intensity;
      }
      for (const p of partMats.filter((x) => x.tag === tag)) {
        if (p.emissive === 0) p.mat.emissive.set(COLORS.iceEdge);
        p.mat.emissiveIntensity = 0.9;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      hatch?.dispose();
    },
  };
}

/** Triangles in a scene graph (meshes only), for the 50k budget. */
export function triangleCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    n += o instanceof THREE.InstancedMesh ? tris * o.count : tris;
  });
  return n;
}
