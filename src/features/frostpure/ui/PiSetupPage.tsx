import { useState } from 'react';
import { Link } from 'react-router';
import { GlassCard, PillButton, StepBadge } from '../../../core/design/components';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../../../core/db/supabase';
import { saveDevice, useDevice } from '../data/store';
import { fitCalibration } from '../engine/results';
import type { DeviceSettings } from '../model/types';
import { FrostNav } from './common';

/*
 * Pi setup (Build steps 2–6 and 9): the probe IDs and depths, EC calibration, level distances,
 * servo angles and control rule, kept in the app (synced) and copied to the Pi as config.json.
 * The Pi's own password never passes through the app: it lives only in /etc/frostpure/password.
 */

const README = 'https://github.com/dossymzhanrashat/dosym-os/blob/main/pi/README.md';

export function piConfig(d: DeviceSettings, piEmail: string) {
  return {
    supabase_url: SUPABASE_URL,
    anon_key: SUPABASE_PUBLISHABLE_KEY,
    email: piEmail || 'PI_EMAIL',
    password_file: '/etc/frostpure/password',
    device_id: d.deviceId,
    run_id: null,
    interval_s: d.intervalS,
    probes: Object.fromEntries(d.probes.map((p) => [p.key, { id: p.id || null, depth_cm: p.depthCm ?? null }])),
    ice_threshold_c: d.iceThresholdC,
    water_depth_cm: d.waterDepthCm ?? null,
    ec: Object.fromEntries(d.ec.map((e) => [e.key, { channel: e.channel, slope: e.slope, offset: e.offset }])),
    level: { trig_gpio: d.level.trigGpio, echo_gpio: d.level.echoGpio, empty_cm: d.level.emptyCm ?? null, full_cm: d.level.fullCm ?? null },
    servos: Object.fromEntries(d.servos.map((s) => [s.key, { gpio: s.gpio, closed_deg: s.closedDeg, open_deg: s.openDeg }])),
    solenoid_v1_gpio: d.solenoidGpio,
    control: { enabled: d.control.enabled, target_ice_pct: d.control.targetIcePct, ec1_limit_ms: d.control.ec1LimitMS ?? null },
    simulate: false,
  };
}

const num = (v: string) => (v === '' ? undefined : Number(v));

export function PiSetupPage() {
  const saved = useDevice();
  const [d, setD] = useState<DeviceSettings | null>(null);
  const [piEmail, setPiEmail] = useState('');
  const [msg, setMsg] = useState('');
  const dev = d ?? saved;
  const set = (patch: Partial<DeviceSettings>) => setD({ ...dev, ...patch });
  const json = JSON.stringify(piConfig(dev, piEmail.trim()), null, 2);

  const save = async () => {
    await saveDevice(dev);
    setD(null);
    setMsg('Saved.');
  };

  const numberField = (label: string, value: number | undefined, onChange: (v: number | undefined) => void, step = 'any') => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="number" step={step} value={value ?? ''} onChange={(e) => onChange(num(e.target.value))} />
    </label>
  );

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · <Link to="/frostpure/build">Build</Link> · Pi setup
        </p>
        <h1 className="ff-title">Pi setup</h1>
        <p className="m-0">
          Full step-by-step guide (accounts, wiring, install, test without sensors):{' '}
          <a href={README} target="_blank" rel="noopener noreferrer">
            pi/README.md
          </a>
          .
        </p>
      </header>
      <FrostNav />

      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <GlassCard className="grid gap-3" aria-labelledby="probes-h">
          <h2 id="probes-h" className="card-title m-0">
            <StepBadge n={3} /> Temperature string
          </h2>
          <p className="m-0 text-sm">On the Pi, run <code>ls /sys/bus/w1/devices</code> to list probe IDs (they start with 28-). Depth = cm below the water surface.</p>
          {dev.probes.map((p, i) => (
            <div key={p.key} className="grid gap-2 sm:grid-cols-[4rem_1fr_8rem] items-end">
              <strong>{p.key}</strong>
              <label className="field">
                <span className="field-label">Sensor ID</span>
                <input
                  className="input"
                  value={p.id}
                  placeholder="28-0123456789ab"
                  autoCapitalize="off"
                  onChange={(e) => set({ probes: dev.probes.map((x, j) => (j === i ? { ...x, id: e.target.value.trim() } : x)) })}
                />
              </label>
              {p.key !== 'air' ? (
                numberField('Depth, cm', p.depthCm, (v) => set({ probes: dev.probes.map((x, j) => (j === i ? { ...x, depthCm: v } : x)) }))
              ) : (
                <span className="text-sm">air</span>
              )}
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            {numberField('Ice threshold, °C', dev.iceThresholdC, (v) => set({ iceThresholdC: v ?? -0.3 }))}
            {numberField('Water depth in the tank, cm', dev.waterDepthCm, (v) => set({ waterDepthCm: v }))}
          </div>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="ec-h">
          <h2 id="ec-h" className="card-title m-0">
            <StepBadge n={4} /> EC calibration
          </h2>
          <p className="m-0 text-sm">
            Put both probes in each solution. On the Pi run <code>python3 frostpure_sender.py --read-raw</code> for the volts; measure the same solution with the handheld meter (mS/cm). Add 2–3 points per probe; the line is fitted for you.
          </p>
          {dev.ec.map((e, i) => (
            <div key={e.key} className="grid gap-2">
              <strong>
                {e.key} · ADS1115 A{e.channel} · EC = {e.slope.toFixed(3)} × V + {e.offset.toFixed(3)}
              </strong>
              {e.points.map((pt, k) => (
                <div key={k} className="flex flex-wrap items-end gap-2">
                  {numberField('Volts', pt.volts, (v) => set({ ec: dev.ec.map((x, j) => (j === i ? { ...x, points: x.points.map((q, m) => (m === k ? { ...q, volts: v ?? 0 } : q)) } : x)) }))}
                  {numberField('Handheld, mS/cm', pt.ecMS, (v) => set({ ec: dev.ec.map((x, j) => (j === i ? { ...x, points: x.points.map((q, m) => (m === k ? { ...q, ecMS: v ?? 0 } : q)) } : x)) }))}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <PillButton variant="secondary" onClick={() => set({ ec: dev.ec.map((x, j) => (j === i ? { ...x, points: [...x.points, { volts: 0, ecMS: 0 }] } : x)) })}>
                  Add a point
                </PillButton>
                <PillButton
                  variant="secondary"
                  disabled={e.points.length < 2}
                  onClick={() => {
                    const fit = fitCalibration(e.points);
                    if (fit) set({ ec: dev.ec.map((x, j) => (j === i ? { ...x, ...fit } : x)) });
                    else setMsg('These points do not make a line: use different solutions.');
                  }}
                >
                  Fit the line
                </PillButton>
              </div>
            </div>
          ))}
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="hw-h">
          <h2 id="hw-h" className="card-title m-0">
            <StepBadge n={5} /> Level, valves and control
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {numberField('Level: distance when empty, cm', dev.level.emptyCm, (v) => set({ level: { ...dev.level, emptyCm: v } }))}
            {numberField('Level: distance when full, cm', dev.level.fullCm, (v) => set({ level: { ...dev.level, fullCm: v } }))}
            {numberField('Level TRIG GPIO', dev.level.trigGpio, (v) => set({ level: { ...dev.level, trigGpio: v ?? 23 } }), '1')}
            {numberField('Level ECHO GPIO', dev.level.echoGpio, (v) => set({ level: { ...dev.level, echoGpio: v ?? 24 } }), '1')}
          </div>
          {dev.servos.map((s, i) => (
            <div key={s.key} className="grid gap-2 sm:grid-cols-3">
              {numberField(`${s.key} servo GPIO`, s.gpio, (v) => set({ servos: dev.servos.map((x, j) => (j === i ? { ...x, gpio: v ?? x.gpio } : x)) }), '1')}
              {numberField(`${s.key} ${s.key === 'V3' ? 'clean' : 'closed'} angle °`, s.closedDeg, (v) => set({ servos: dev.servos.map((x, j) => (j === i ? { ...x, closedDeg: v ?? 0 } : x)) }))}
              {numberField(`${s.key} ${s.key === 'V3' ? 'brine' : 'open'} angle °`, s.openDeg, (v) => set({ servos: dev.servos.map((x, j) => (j === i ? { ...x, openDeg: v ?? 90 } : x)) }))}
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-3">
            {numberField('V1 solenoid GPIO', dev.solenoidGpio, (v) => set({ solenoidGpio: v ?? 17 }), '1')}
            {numberField('Send every … s (freeze)', dev.intervalS.freeze, (v) => set({ intervalS: { ...dev.intervalS, freeze: v ?? 60 } }), '1')}
            {numberField('Send every … s (drain)', dev.intervalS.drain, (v) => set({ intervalS: { ...dev.intervalS, drain: v ?? 10 } }), '1')}
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="check" checked={dev.control.enabled} onChange={(e) => set({ control: { ...dev.control, enabled: e.target.checked } })} />
            <span>Let the Pi open the drain (V2) by itself</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {numberField('Drain at ice %', dev.control.targetIcePct, (v) => set({ control: { ...dev.control, targetIcePct: v ?? 65 } }))}
            {numberField('…or when EC1 reaches, mS/cm (optional)', dev.control.ec1LimitMS, (v) => set({ control: { ...dev.control, ec1LimitMS: v } }))}
          </div>
          <label className="field">
            <span className="field-label">Device name</span>
            <input className="input" value={dev.deviceId} onChange={(e) => set({ deviceId: e.target.value.trim() || 'ayaz-pi-01' })} />
          </label>
        </GlassCard>

        <div className="flex flex-wrap gap-2">
          <PillButton type="submit" disabled={!d}>
            Save settings
          </PillButton>
          {msg && (
            <span className="text-sm" role="status">
              {msg}
            </span>
          )}
        </div>
      </form>

      <GlassCard className="grid gap-3 mt-3" aria-labelledby="cfg-h">
        <h2 id="cfg-h" className="card-title m-0">
          config.json for the Pi
        </h2>
        <label className="field">
          <span className="field-label">The Pi account’s e-mail (from Supabase › Authentication)</span>
          <input className="input" type="email" value={piEmail} onChange={(e) => setPiEmail(e.target.value)} autoCapitalize="off" placeholder="the e-mail you gave the pi user" />
        </label>
        <p className="m-0 text-sm">Contains only public values (site address, public key, device settings). The Pi’s password goes in a separate file on the Pi.</p>
        <textarea className="input fp-code" readOnly rows={12} value={json} aria-label="config.json" />
        <PillButton
          variant="secondary"
          className="justify-self-start"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(json);
              setMsg('config.json copied.');
            } catch {
              setMsg('Select the text above and copy it.');
            }
          }}
        >
          Copy config.json
        </PillButton>
      </GlassCard>
    </>
  );
}
