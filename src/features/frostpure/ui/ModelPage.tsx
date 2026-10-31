import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Link } from 'react-router';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { Sheet } from '../../../core/design/Sheet';
import { ArButton } from '../../../core/three/ArButton';
import { useDevice, useFrostData, useFrostSettings } from '../data/store';
import { fetchTelemetry } from '../data/telemetry';
import type { TelemetryRow } from '../model/types';
import { buildTank, PARTS, type Tank } from '../three/buildTank';
import { dataState, demoState, PHASES, type TankState } from '../three/tankState';
import { FrostNav, money } from './common';

/*
 * The FrostPure unit in 3D (SPEC Module 2 › 4, WEB EDITION: React Three Fiber, procedural, no
 * model files). Drag to orbit, pinch or scroll to zoom, double-tap to reset. X-ray, labels and
 * cross-section toggles; tap a part for its BOM item (parts not owned yet are ghosted with a
 * dashed outline). The timeline plays Fill · Freeze · Drain · Sweat · Harvest as a 20 s demo
 * ("illustration"), or follows a run's real readings when it has telemetry.
 */

const DEMO_SECONDS = 20;
/** Movement (px) still counted as a tap rather than a drag. */
const TAP_SLOP = 6;
const TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });

function TankModel({ tank, state, onPick }: { tank: Tank; state: TankState; onPick: (tag: string) => void }) {
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    elapsed.current += Math.min(dt, 0.1);
    tank.update(state, elapsed.current);
  });
  return (
    <primitive
      object={tank.group}
      // A tap opens a part; a drag (to turn the model) never does. `delta` = pixels moved since touch-down.
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const tag = e.object.userData.tag as string | undefined;
        if (!tag || e.delta > TAP_SLOP) return;
        e.stopPropagation();
        onPick(tag);
      }}
    />
  );
}

export function ModelPage() {
  const data = useFrostData();
  const settings = useFrostSettings();
  const device = useDevice();
  const tank = useMemo(() => buildTank(), []);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [t, setT] = useState(0.45);
  const [playing, setPlaying] = useState(false);
  const [xray, setXray] = useState(false);
  const [labels, setLabels] = useState(true);
  const [section, setSection] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [dpr, setDpr] = useState(1.5);
  const [runId, setRunId] = useState<string>('');
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loadingRun, setLoadingRun] = useState(false);

  useEffect(() => () => tank.dispose(), [tank]);
  useEffect(() => tank.setXray(xray), [tank, xray]);
  useEffect(() => tank.setSection(section), [tank, section]);
  useEffect(() => tank.highlight(picked), [tank, picked]);
  useEffect(() => {
    const status = new Map(data.bom.map((b) => [b.id, b.status]));
    tank.setOwned((id) => status.get(id) === 'have' || (id === 'bom-drum' && status.get('bom-bucket') === 'have'));
  }, [tank, data.bom]);

  // Play: one 20 s cycle, looping.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      setT((x) => (x + (now - last) / 1000 / DEMO_SECONDS) % 1);
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // A run's readings, when picked.
  const runs = data.runs.filter((r) => r.startedAt);
  useEffect(() => {
    const run = runs.find((r) => r.id === runId);
    if (!run?.startedAt) {
      setRows([]);
      return;
    }
    setLoadingRun(true);
    fetchTelemetry(new Date(Date.parse(run.startedAt) - 10 * 60_000), run.endedAt ? new Date(run.endedAt) : undefined)
      .then((r) => setRows(r.filter((x) => x.run_id === run.id || (!x.run_id && (!run.deviceId || x.device_id === run.deviceId)))))
      .catch(() => setRows([]))
      .finally(() => setLoadingRun(false));
  }, [runId]);

  const real = useMemo(() => dataState(rows, t, device.waterDepthCm), [rows, t, device.waterDepthCm]);
  const state = real ?? demoState(t, (data.runs.find((r) => r.id === runId)?.targetFrozenPct ?? 65) / 100);
  const part = PARTS.find((p) => p.tag === picked);
  const bom = part?.bomId ? data.bom.find((b) => b.id === part.bomId) : undefined;

  if (!data.loaded) return <SaltDotsLoader label="Building the unit" />;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · 3D unit
        </p>
        <h1 className="ff-title">The unit in 3D</h1>
        <p className="m-0">Drag to turn, pinch or scroll to zoom, double-tap to reset. Tap a part for its place in the parts list.</p>
      </header>
      <FrostNav />

      <div className="grid gap-3">
        <div className="fp-3d" onDoubleClick={() => controls.current?.reset()}>
          <Canvas dpr={dpr} camera={{ position: [3.6, 2.5, 4.3], fov: 45 }} gl={{ localClippingEnabled: true, antialias: true }} onPointerMissed={(e) => (e as MouseEvent).type === 'click' && setPicked(null)}>
            <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(2, window.devicePixelRatio))} />
            <color attach="background" args={['#050a16']} />
            <hemisphereLight args={['#bcd4ff', '#050a16', 0.9]} />
            <directionalLight position={[3, 5, 2]} intensity={1.6} />
            <directionalLight position={[-3, 2, -2]} intensity={0.4} color="#c27bff" />
            <TankModel tank={tank} state={state} onPick={setPicked} />
            {labels &&
              PARTS.map((p) => (
                <Html key={p.tag} position={p.anchor} center zIndexRange={[10, 0]}>
                  <button type="button" className={`fp-3d-label ${picked === p.tag ? 'fp-3d-label--on' : ''}`} onClick={() => setPicked(p.tag)}>
                    <span className="fp-3d-tag">{p.tag}</span> {p.name}
                  </button>
                </Html>
              ))}
            <OrbitControls ref={controls} target={[0, 0.55, 0]} minDistance={1.4} maxDistance={9} maxPolarAngle={Math.PI * 0.49} enablePan={false} />
          </Canvas>
          <span className={`fp-3d-badge ${real ? 'fp-3d-badge--data' : ''}`}>{real ? 'run data' : 'illustration'}</span>
        </div>

        <GlassCard size="md" className="grid gap-2">
          <div className="fp-timeline-3d" aria-hidden="true">
            {PHASES.map((p) => (
              <span key={p.id} className={state.phase === p.id ? 'on' : ''} style={{ left: `${p.from * 100}%`, width: `${(p.to - p.from) * 100}%` }}>
                {p.label}
              </span>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(t * 1000)}
            onChange={(e) => {
              setPlaying(false);
              setT(Number(e.target.value) / 1000);
            }}
            aria-label="Timeline"
            aria-valuetext={`${PHASES.find((p) => p.id === state.phase)?.label}, ${Math.round(state.ice * 100)}% ice`}
            className="fp-scrub"
          />
          <div className="flex flex-wrap items-center gap-2">
            <PillButton onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</PillButton>
            <span className="tnum fp-readout">
              {PHASES.find((p) => p.id === state.phase)?.label} · ice {Math.round(state.ice * 100)}% · V2 {state.v2Open ? 'open' : 'closed'} · V3 → {state.v3}
              {state.reading && (
                <>
                  {' '}
                  · {TIME.format(new Date(state.reading.ts))}
                  {state.reading.iceCm !== undefined && ` · ${state.reading.iceCm} cm`}
                  {state.reading.ec1 !== undefined && ` · EC1 ${state.reading.ec1} mS/cm`}
                </>
              )}
            </span>
          </div>
          <label className="field">
            <span className="field-label">Run</span>
            <select className="input" value={runId} onChange={(e) => setRunId(e.target.value)}>
              <option value="">Illustration (demo cycle)</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {runId && !loadingRun && !real && <span className="text-sm">This run has no Pi readings yet, so the demo cycle is shown (illustration).</span>}
            {loadingRun && <span className="text-sm">Loading readings…</span>}
          </label>
        </GlassCard>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="seg-btn" aria-pressed={xray} onClick={() => setXray(!xray)}>
            X-ray
          </button>
          <button type="button" className="seg-btn" aria-pressed={labels} onClick={() => setLabels(!labels)}>
            Labels
          </button>
          <button type="button" className="seg-btn" aria-pressed={section} onClick={() => setSection(!section)}>
            Cross-section
          </button>
        </div>
        <GlassCard size="md">
          <ArButton getRoot={() => tank.group} metres={2.4} title="FrostPure unit" />
        </GlassCard>
        <p className="m-0 text-sm">Ghosted parts with a dashed outline are not in your hands yet (Build › Parts list).</p>
      </div>

      <Sheet open={!!part} onClose={() => setPicked(null)} title={part ? `${part.tag} · ${part.name}` : ''}>
        {part && (
          <div className="grid gap-3">
            {bom ? (
              <>
                <p className="m-0">
                  {bom.name}
                  {bom.model && ` · ${bom.model}`} <Chip tone={bom.status === 'have' ? 'good' : bom.status === 'ordered' ? 'ice' : 'warm'}>{bom.status}</Chip>
                </p>
                <p className="m-0 text-sm">{bom.purpose}</p>
                {bom.unitPriceKZT !== undefined && (
                  <p className="m-0">
                    {money(bom.unitPriceKZT * bom.qty, settings.usdRate)} <span className="text-sm">approx.</span>
                  </p>
                )}
              </>
            ) : (
              <p className="m-0">Not in the parts list (built on site).</p>
            )}
            <Link to="/frostpure/build" className="pill justify-self-start">
              Open in Build
            </Link>
          </div>
        )}
      </Sheet>
    </>
  );
}
