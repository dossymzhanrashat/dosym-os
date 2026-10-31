import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import type * as THREE from 'three';
import { GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { ArButton } from '../../../core/three/ArButton';
import { saveSetting, useSetting } from '../../../core/planner/store';
import { useFx, useTgData } from '../data/store';
import { lineKZT } from '../engine/econ';
import { boxSizeFor, buildBox, type LabelFields } from '../three/buildBox';
import { buildRobot, DEFAULT_STYLE, PALETTE, presetFor, ROBOTS, tooClose, type KitStyle, type StylePreset } from '../three/buildRobot';
import type { KitOption } from '../model/types';
import { kzt, TgNav } from './common';

/*
 * 3D Studio (SPEC Module 3 › Visuals and 3D, WEB EDITION): each option's robot built in code with
 * the four style presets and a colour configurator (palette only, contrast warning), an
 * exploded-view slider with part names and unit costs, assembly steps (play / step), a snapshot
 * PNG, and the 3D box mockup with an editable Kazakh/Russian label and an opening lid.
 * "View in AR" exports either one.
 */

const STYLE_LABEL: Record<StylePreset, string> = { cardboard: 'Cardboard', plywood: 'Plywood', glossy: 'Glossy plastic', brand: 'Deep Blue' };
const STYLES = 'tagylym:styles';
const PACKAGING = 'tagylym:packaging';
const NO_STYLES: Record<string, KitStyle> = {};
const NO_PACK: Record<string, LabelFields> = {};

const defaultLabel = (o: KitOption): LabelFields => ({
  titleKk: o.nameKk ?? o.name,
  titleRu: o.nameRu ?? o.name,
  age: '6+',
  grades: `${o.gradeMin}–${o.gradeMax} сынып / класс`,
  bullets: [o.lessonCount ? `${o.lessonCount} lessons` : '', o.controller ? `${o.controller} controller` : 'No screens needed', 'Kazakh · Russian'],
  code: o.code,
});

function RobotScene({ option, style, explode, active, done, labels, fx }: { option: KitOption; style: KitStyle; explode: number; active: string[]; done: string[] | null; labels: boolean; fx: number }) {
  const spec = ROBOTS[presetFor(option.code, option.controller)];
  const robot = useMemo(() => buildRobot(spec, style), [spec, style]);
  useEffect(() => () => robot.dispose(), [robot]);
  // Steps mode: assembled parts (done) in place, the current step's parts animating in, the rest exploded.
  useEffect(() => {
    robot.setExplode(done ? (id) => (done.includes(id) ? 0 : active.includes(id) ? explode : 1) : explode);
    robot.highlight(active);
  }, [robot, explode, active, done]);
  const cost = (re?: RegExp) => {
    const line = re ? option.bom.find((l) => re.test(l.name)) : undefined;
    return line ? `${kzt(lineKZT(line, fx) / Math.max(1, line.qty))}` : '';
  };
  return (
    <>
      <primitive object={robot.group} />
      {labels &&
        spec.parts
          .filter((p) => !/-r$|eye-r|card-[23]/.test(p.id))
          .map((p) => (
            <Html key={p.id} position={robot.positionOf(p.id, done ? (done.includes(p.id) ? 0 : 1) : explode).toArray()} center zIndexRange={[10, 0]}>
              <span className="tg-3d-label">
                {p.name}
                {cost(p.bom) && <span className="tg-3d-cost"> · {cost(p.bom)}</span>}
              </span>
            </Html>
          ))}
    </>
  );
}

function BoxScene({ option, fields, lid }: { option: KitOption; fields: LabelFields; lid: number }) {
  const box = useMemo(() => buildBox(boxSizeFor(option.code), fields), [option.code]);
  useEffect(() => () => box.dispose(), [box]);
  useEffect(() => {
    const t = setTimeout(() => box.setLabel(fields), 120); // redraw within 0.5 s of an edit
    return () => clearTimeout(t);
  }, [box, fields]);
  useEffect(() => box.setLid(lid), [box, lid]);
  return <primitive object={box.group} />;
}

export function StudioPage() {
  const data = useTgData();
  const fx = useFx();
  const [params, setParams] = useSearchParams();
  const styles = useSetting(STYLES, NO_STYLES);
  const packs = useSetting(PACKAGING, NO_PACK);
  const options = data.options.filter((o) => !o.isTeacherBox);
  const option = options.find((o) => o.id === params.get('option')) ?? options.find((o) => o.status === 'active') ?? options[0];
  const tab = params.get('view') === 'box' ? 'box' : 'robot';
  const style = (option && styles[option.id]) ?? DEFAULT_STYLE.plywood;
  const [explode, setExplode] = useState(0);
  const [labels, setLabels] = useState(true);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [lid, setLid] = useState(0);
  const [dpr, setDpr] = useState(1.5);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const sceneRoot = useRef<THREE.Object3D | null>(null);
  const spec = option ? ROBOTS[presetFor(option.code, option.controller)] : undefined;
  const fields = option ? (packs[option.id] ?? defaultLabel(option)) : undefined;

  // Assembly: each step moves its parts from exploded to assembled over 0.6 s.
  const [stepT, setStepT] = useState(0);
  useEffect(() => {
    if (step === null) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 600);
      setStepT(1 - (1 - k) * (1 - k)); // ease-out
      if (k < 1) raf = requestAnimationFrame(tick);
      else if (playing && spec && step < spec.steps.length - 1) setTimeout(() => setStep((s) => (s === null ? s : s + 1)), 700);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, playing]);

  if (!data.loaded) return <SaltDotsLoader label="Opening the studio" />;
  if (!option || !spec || !fields) return null;

  const saveStyle = (s: KitStyle) => void saveSetting(STYLES, { ...styles, [option.id]: s });
  const saveFields = (f: LabelFields) => void saveSetting(PACKAGING, { ...packs, [option.id]: f });
  const done = step === null ? null : spec.steps.slice(0, step).flatMap((s) => s.parts);
  const active = step === null ? [] : spec.steps[step].parts;
  const close = tooClose(style.body, style.wheels);

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/tagylym">Kit Studio</Link> · 3D Studio
        </p>
        <h1 className="ff-title">3D Studio</h1>
        <div className="seg" role="radiogroup" aria-label="Option">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={o.id === option.id} className="seg-btn" onClick={() => (setParams({ option: o.id, ...(tab === 'box' ? { view: 'box' } : {}) }, { replace: true }), setStep(null))}>
              {o.code} · {o.name}
            </button>
          ))}
        </div>
      </header>
      <TgNav />

      <div className="grid gap-3">
        <div className="seg" role="tablist" aria-label="View">
          {(
            [
              ['robot', 'Robot'],
              ['box', 'Box mockup'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} aria-pressed={tab === v} className="seg-btn" onClick={() => setParams({ option: option.id, ...(v === 'box' ? { view: 'box' } : {}) }, { replace: true })}>
              {l}
            </button>
          ))}
        </div>

        <div className="tg-3d" onDoubleClick={() => controls.current?.reset()}>
          <Canvas
            key={tab /* a fresh camera for each view */}
            dpr={dpr}
            camera={{ position: tab === 'box' ? [0.62, 0.5, 0.7] : [0.36, 0.26, 0.4], fov: 40, near: 0.01, far: 20 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            onCreated={({ gl, scene }) => {
              canvasEl.current = gl.domElement;
              sceneRoot.current = scene;
            }}
          >
            <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(2, window.devicePixelRatio))} />
            <color attach="background" args={['#050a16']} />
            <hemisphereLight args={['#dfe8ff', '#0d1834', 1.1]} />
            <directionalLight position={[1, 2, 1]} intensity={1.6} />
            <directionalLight position={[-1, 0.5, -1]} intensity={0.5} color="#c27bff" />
            <mesh name="ground" rotation-x={-Math.PI / 2} position-y={-0.0005}>
              <circleGeometry args={[0.6, 48]} />
              <meshStandardMaterial color="#0d1834" roughness={1} />
            </mesh>
            {tab === 'robot' ? (
              <RobotScene option={option} style={style} explode={step === null ? explode : 1 - stepT} active={active} done={done} labels={labels && (step !== null || explode > 0.4)} fx={fx.usdToKzt} />
            ) : (
              <BoxScene option={option} fields={fields} lid={lid} />
            )}
            <OrbitControls ref={controls} target={[0, tab === 'box' ? 0.03 : 0.05, 0]} minDistance={0.15} maxDistance={1.5} enablePan={false} autoRotate={step === null && explode === 0 && tab === 'robot'} autoRotateSpeed={0.6} />
          </Canvas>
        </div>

        {tab === 'robot' ? (
          <>
            <GlassCard size="md" className="grid gap-3">
              <div className="seg" role="radiogroup" aria-label="Style">
                {(Object.keys(STYLE_LABEL) as StylePreset[]).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={style.preset === p} className="seg-btn" onClick={() => saveStyle(p === style.preset ? style : DEFAULT_STYLE[p])}>
                    {STYLE_LABEL[p]}
                  </button>
                ))}
              </div>
              {style.preset !== 'brand' && (
                <div className="grid gap-2">
                  {(['body', 'wheels', 'accent'] as const).map((k) => (
                    <div key={k} className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`${k} colour`}>
                      <span className="text-sm tg-swatch-label">{k}</span>
                      {PALETTE.map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={style[k] === c} aria-label={`${k} ${c}`} className="tg-swatch" style={{ background: c }} onClick={() => saveStyle({ ...style, [k]: c })} />
                      ))}
                    </div>
                  ))}
                  {close && <p className="notice notice--warm m-0 text-sm">Body and wheel colours are very close: pick more contrast so children can tell the parts apart.</p>}
                </div>
              )}
              {style.preset === 'brand' && <p className="m-0 text-sm">Deep Blue uses brand colours only, with warm amber on the sensor alone.</p>}
            </GlassCard>

            <GlassCard size="md" className="grid gap-2">
              <label className="field">
                <span className="field-label">Exploded view</span>
                <input type="range" min={0} max={100} value={Math.round(explode * 100)} onChange={(e) => (setStep(null), setExplode(Number(e.target.value) / 100))} className="fp-scrub" aria-valuetext={`${Math.round(explode * 100)}% apart`} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <PillButton
                  onClick={() => {
                    if (playing) return setPlaying(false);
                    setPlaying(true);
                    setStep(0);
                  }}
                >
                  {playing ? 'Pause' : 'Play assembly'}
                </PillButton>
                <PillButton variant="secondary" disabled={step === null || step === 0} onClick={() => (setPlaying(false), setStep((s) => Math.max(0, (s ?? 0) - 1)))}>
                  ← Step
                </PillButton>
                <PillButton variant="secondary" disabled={step !== null && step >= spec.steps.length - 1} onClick={() => (setPlaying(false), setStep((s) => (s === null ? 0 : s + 1)))}>
                  Step →
                </PillButton>
                <button type="button" className="seg-btn" aria-pressed={labels} onClick={() => setLabels(!labels)}>
                  Labels
                </button>
                <PillButton
                  variant="secondary"
                  onClick={() => {
                    const c = canvasEl.current;
                    if (!c) return;
                    const a = document.createElement('a');
                    a.href = c.toDataURL('image/png');
                    a.download = `${option.name.replace(/\s+/g, '-')}.png`;
                    a.click();
                  }}
                >
                  Snapshot PNG
                </PillButton>
              </div>
              {step !== null && (
                <p className="m-0" aria-live="polite">
                  <strong>
                    Step {step + 1} of {spec.steps.length}:
                  </strong>{' '}
                  {spec.steps[step].caption}
                </p>
              )}
              <p className="m-0 text-sm">Step captions are in English for now; Kazakh and Russian captions still to write.</p>
            </GlassCard>
          </>
        ) : (
          <GlassCard size="md" className="grid gap-3">
            <label className="field">
              <span className="field-label">Lid</span>
              <input type="range" min={0} max={110} value={lid} onChange={(e) => setLid(Number(e.target.value))} className="fp-scrub" aria-valuetext={`${lid}°`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">
                <span className="field-label">Name in Kazakh</span>
                <input className="input" lang="kk" value={fields.titleKk} onChange={(e) => saveFields({ ...fields, titleKk: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Name in Russian</span>
                <input className="input" lang="ru" value={fields.titleRu} onChange={(e) => saveFields({ ...fields, titleRu: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Age</span>
                <input className="input" value={fields.age} onChange={(e) => saveFields({ ...fields, age: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Grades line</span>
                <input className="input" value={fields.grades} onChange={(e) => saveFields({ ...fields, grades: e.target.value })} />
              </label>
              {fields.bullets.map((b, i) => (
                <label key={i} className="field">
                  <span className="field-label">Bullet {i + 1}</span>
                  <input className="input" value={b} onChange={(e) => saveFields({ ...fields, bullets: fields.bullets.map((x, j) => (j === i ? e.target.value : x)) as LabelFields['bullets'] })} />
                </label>
              ))}
            </div>
            <p className="m-0 text-sm">EAC mark, “0–3” warning and barcode are placeholders until certification and GS1 registration (to confirm).</p>
          </GlassCard>
        )}

        <GlassCard size="md">
          <ArButton getRoot={() => sceneRoot.current} metres={tab === 'box' ? 0.3 : 0.22} title={`${option.name} ${tab === 'box' ? 'box' : 'robot'}`} />
        </GlassCard>
      </div>
    </>
  );
}
