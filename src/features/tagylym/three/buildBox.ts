import * as THREE from 'three';

/*
 * 3D box mockup (SPEC Module 3 › Packaging mockup, WEB EDITION). The lid's top face carries a
 * label drawn on a canvas from editable fields — kit name in Kazakh and Russian, age band, grades,
 * three bullets, and placeholders for the EAC mark, the age warning and the barcode. The lid
 * hinges at the back (0 → 110°) to show an insert with the parts laid out. Metres.
 */

export interface LabelFields {
  titleKk: string;
  titleRu: string;
  age: string; // "6+"
  grades: string; // "1–3 сынып / класс"
  bullets: [string, string, string];
  code: string; // option letter, shown large
}

export interface BoxSize {
  w: number;
  h: number;
  d: number;
}

export function drawLabel(g: CanvasRenderingContext2D, W: number, H: number, f: LabelFields) {
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d1834');
  bg.addColorStop(1, '#050a16');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // corner glows
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.6);
  glow.addColorStop(0, 'rgba(70,110,255,0.45)');
  glow.addColorStop(1, 'rgba(70,110,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  // gradient band
  const band = g.createLinearGradient(0, 0, W, 0);
  ['#8ff1ff', '#5fb8ff', '#7f88ff', '#c27bff'].forEach((c, i) => band.addColorStop(i / 3, c));
  g.fillStyle = band;
  g.fillRect(0, H * 0.06, W, H * 0.018);

  const pad = W * 0.06;
  g.fillStyle = 'rgba(170,200,255,0.8)';
  g.font = `700 ${Math.round(H * 0.035)}px Archivo, system-ui, sans-serif`;
  g.fillText('TAGYLYM KIT', pad, H * 0.16);
  g.fillStyle = '#ffffff';
  g.font = `800 ${Math.round(H * 0.11)}px Archivo, system-ui, sans-serif`;
  g.fillText(f.titleKk || '—', pad, H * 0.31, W - pad * 2 - H * 0.2);
  g.fillStyle = 'rgba(222,233,255,0.85)';
  g.font = `600 ${Math.round(H * 0.06)}px Manrope, system-ui, sans-serif`;
  g.fillText(f.titleRu || '—', pad, H * 0.41, W - pad * 2 - H * 0.2);
  g.font = `500 ${Math.round(H * 0.042)}px Manrope, system-ui, sans-serif`;
  g.fillText(f.grades, pad, H * 0.5);

  // bullets
  g.font = `500 ${Math.round(H * 0.045)}px Manrope, system-ui, sans-serif`;
  f.bullets.forEach((b, i) => {
    if (!b) return;
    g.fillStyle = '#8ff1ff';
    g.beginPath();
    g.arc(pad + 8, H * (0.6 + i * 0.08) - 10, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(222,233,255,0.9)';
    g.fillText(b, pad + 28, H * (0.6 + i * 0.08), W * 0.62);
  });

  // big option letter
  g.fillStyle = 'rgba(143,241,255,0.12)';
  g.font = `800 ${Math.round(H * 0.5)}px Archivo, system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText(f.code, W - pad, H * 0.72);
  g.textAlign = 'left';

  // age badge
  const r = H * 0.075;
  g.fillStyle = '#ffb36b';
  g.beginPath();
  g.arc(W - pad - r, H * 0.2, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#050a16';
  g.font = `800 ${Math.round(r * 0.9)}px Archivo, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText(f.age, W - pad - r, H * 0.2 + r * 0.32);
  g.textAlign = 'left';

  // placeholders: EAC mark, age warning, barcode
  const y = H * 0.86;
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 3;
  g.strokeRect(pad, y, H * 0.1, H * 0.08);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = `700 ${Math.round(H * 0.035)}px Archivo, system-ui, sans-serif`;
  g.fillText('EAC', pad + H * 0.012, y + H * 0.055);
  g.fillText('0–3 ⚠', pad + H * 0.14, y + H * 0.055);
  for (let i = 0; i < 34; i++) {
    const bw = i % 3 === 0 ? 4 : 2;
    g.fillRect(W - pad - 220 + i * 6.5, y, bw, H * 0.08);
  }
}

export interface BoxModel {
  group: THREE.Group;
  setLid(deg: number): void;
  setLabel(f: LabelFields): void;
  dispose(): void;
}

export function buildBox(size: BoxSize, fields: LabelFields): BoxModel {
  const group = new THREE.Group();
  group.name = 'Kit box';
  const { w, h, d } = size;
  const lidH = Math.max(0.008, h * 0.18);
  const baseH = h - lidH * 0.6;

  const side = new THREE.MeshStandardMaterial({ color: '#2a3c8f', roughness: 0.5, emissive: '#1b2a5c', emissiveIntensity: 0.35 });
  const inner = new THREE.MeshStandardMaterial({ color: '#e4ecff', roughness: 0.9, side: THREE.BackSide });
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), [side, side, inner, side, side, side]);
  base.position.y = baseH / 2;
  group.add(base);

  // Insert with the parts laid out, visible when the lid opens.
  const insert = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.004, d * 0.94), new THREE.MeshStandardMaterial({ color: '#131c33', roughness: 0.9 }));
  insert.add(tray);
  const colors = ['#8ff1ff', '#7f88ff', '#c27bff', '#5fb8ff', '#ffb36b', '#7dffb0'];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, Math.min(baseH * 0.4, 0.02), d * 0.22), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.5 }));
    p.position.set(-w * 0.3 + (i % 3) * w * 0.3, 0.01, i < 3 ? -d * 0.2 : d * 0.2);
    insert.add(p);
  }
  insert.position.y = Math.min(baseH * 0.55, baseH - 0.012);
  group.add(insert);

  // Label texture on the lid's top face.
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let tex: THREE.CanvasTexture | null = null;
  if (canvas) {
    canvas.width = 1024;
    canvas.height = Math.round((1024 * d) / w);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  const topMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex ?? undefined, roughness: 0.4 });
  const setLabel = (f: LabelFields) => {
    if (!canvas || !tex) return;
    drawLabel(canvas.getContext('2d')!, canvas.width, canvas.height, f);
    tex.needsUpdate = true;
  };
  setLabel(fields);

  const hinge = new THREE.Group();
  hinge.position.set(0, baseH + lidH / 2 - lidH * 0.4, -d / 2);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, lidH, d * 1.01), [side, side, topMat, inner, side, side]);
  lid.position.set(0, 0, d / 2);
  hinge.add(lid);
  group.add(hinge);

  return {
    group,
    setLid(deg) {
      hinge.rotation.x = -THREE.MathUtils.degToRad(Math.min(110, Math.max(0, deg)));
    },
    setLabel,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      tex?.dispose();
    },
  };
}

/** Box size from the option's packaging (cm in the spec → metres). */
export function boxSizeFor(code: string): BoxSize {
  if (code === 'A') return { w: 0.324, h: 0.02, d: 0.229 }; // C4 envelope
  if (code === 'B') return { w: 0.3, h: 0.05, d: 0.21 }; // 30×21×5 carton
  return { w: 0.3, h: 0.08, d: 0.21 };
}
