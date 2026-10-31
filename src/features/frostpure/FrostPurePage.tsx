import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { GlassCard, PillButton } from '../../core/design/components';
import { FreezeFrontBar, FreezeFrontHeader, SaltDotsLoader } from '../../core/design/FreezeFront';
import { Mascot } from '../../core/design/Mascot';
import { daysLeft, describeDeadline } from '../radar/engine/time';
import { momentTime } from './data/planner';
import { newRun, saveRun, useBomMap, useDevice, useFrostData, useFrostSettings } from './data/store';
import { latestTelemetry } from './data/telemetry';
import { bomTotals, currentPhase, guidedPath } from './engine/compete';
import { computeResults, iceDepthCm, iceFraction, pct } from './engine/results';
import type { TelemetryRow } from './model/types';
import { FrostNav, money } from './ui/common';

/*
 * Hub Home (SPEC Module 2 › Navigation): live tank state if the Pi reported in the last 15 min,
 * else the last run's headline numbers; "This week" (Guided Path, max 3); next test moment;
 * next competition deadline; BOM progress; quick actions.
 */

const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });

function countdown(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `in ${d}d ${h}h` : `in ${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function FrostPurePage() {
  const data = useFrostData();
  const settings = useFrostSettings();
  const device = useDevice();
  const bomMap = useBomMap(data.bom);
  const navigate = useNavigate();
  const [live, setLive] = useState<TelemetryRow | undefined>();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void latestTelemetry().then(setLive);
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const week = useMemo(() => guidedPath(data.comps, data.steps, data.runs, bomMap, now), [data, bomMap, now]);
  const totals = useMemo(() => bomTotals(data.bom), [data.bom]);
  const lastRun = data.runs.find((r) => r.status === 'done') ?? data.runs.find((r) => r.status === 'running');
  const lastResults = lastRun && computeResults(lastRun);

  const nextMoment = useMemo(() => {
    const list = data.runs
      .filter((r) => r.status === 'planned' || r.status === 'running')
      .flatMap((r) => r.moments.filter((m) => !m.doneAt).map((m) => ({ r, m, at: momentTime(r, m) })))
      .filter((x) => x.at && x.at > now)
      .sort((a, b) => a.at!.getTime() - b.at!.getTime());
    return list[0];
  }, [data.runs, now]);

  const nextDeadline = useMemo(() => {
    const list = data.comps
      .filter((c) => c.status !== 'watching')
      .map((c) => ({ c, p: currentPhase(c, now) }))
      .filter((x) => x.p?.deadline)
      .sort((a, b) => daysLeft(a.p!.deadline!, now) - daysLeft(b.p!.deadline!, now));
    return list[0];
  }, [data.comps, now]);

  if (!data.loaded) return <SaltDotsLoader label="Opening FrostPure" />;

  const fresh = live && now.getTime() - Date.parse(live.ts) < 15 * 60_000;
  const temps = live?.payload.temps_c ?? {};
  const depth = live?.payload.ice_depth_cm ?? (live ? iceDepthCm(temps, device.probes, device.iceThresholdC) : undefined);
  const icePct = depth !== undefined && device.waterDepthCm ? iceFraction(depth, device.waterDepthCm) : undefined;
  const ec1 = live?.payload.ec_ms_cm?.EC1;
  const headline = fresh
    ? `${live!.phase ? live!.phase[0].toUpperCase() + live!.phase.slice(1) : 'Live'}${icePct !== undefined ? ` · ice ${Math.round(icePct * 100)}%` : ''}${ec1 != null ? ` · EC ${ec1.toFixed(1)} mS/cm` : ''}${temps.air != null ? ` · T_air ${temps.air.toFixed(1)} °C` : ''}`
    : lastRun && lastResults
      ? `Last run “${lastRun.name}”: R ${pct(lastResults.rejection)} · Y ${pct(lastResults.recovery)}`
      : 'No runs yet.';
  const allHave = totals.need === 0 && totals.ordered === 0;
  const prep = data.bom.length ? totals.have / data.bom.length : 0;
  const days = nextDeadline ? daysLeft(nextDeadline.p!.deadline!, now) : undefined;

  return (
    <>
      <FreezeFrontHeader title="FrostPure" eyebrow="Team Ayaz · freeze desalination" value={icePct ?? prep} valueLabel={icePct !== undefined ? 'Ice in the tank' : 'Parts on hand'} valueText={icePct !== undefined ? `${Math.round(icePct * 100)}% ice` : `${totals.have} of ${data.bom.length} parts on hand`}>
        <p className="m-0" aria-live="polite">
          {headline}
          {fresh && <span className="text-sm"> · {CLOCK.format(new Date(live!.ts))}</span>}
        </p>
      </FreezeFrontHeader>
      <FrostNav />

      <div className="grid gap-3 sm:grid-cols-2">
        {data.runs.length === 0 && totals.have <= 3 && (
          <GlassCard className="sm:col-span-2 flex items-center gap-4">
            <Mascot mood="sleepy" size={56} />
            <p className="m-0">
              <strong>Start by checking your parts list.</strong> The tank is empty until the first run.
            </p>
            <Link to="/frostpure/build" className="pill ml-auto">
              Open Build
            </Link>
          </GlassCard>
        )}

        <GlassCard aria-labelledby="week-h">
          <h2 id="week-h" className="card-title">
            This week
          </h2>
          {week.length === 0 ? (
            <p className="m-0">Nothing urgent. Good time for an extra run.</p>
          ) : (
            <ol className="fp-week">
              {week.map((t) => (
                <li key={t.id}>
                  <Link to={t.link}>{t.title}</Link>
                  <span className="text-sm">{t.reason}</span>
                </li>
              ))}
            </ol>
          )}
        </GlassCard>

        <GlassCard aria-labelledby="dl-h">
          <h2 id="dl-h" className="card-title">
            Next competition deadline
          </h2>
          {nextDeadline && days !== undefined ? (
            <>
              <p className={`fp-big ${days <= 7 ? 'fp-warm' : ''}`}>
                {days}
                <span className="fp-big-unit">{days === 1 ? 'day' : 'days'}</span>
              </p>
              <p className="m-0">
                <Link to={`/frostpure/compete/${encodeURIComponent(nextDeadline.c.id)}`}>
                  {nextDeadline.c.name} · {nextDeadline.p!.name}
                </Link>
              </p>
              <p className="m-0 text-sm">{describeDeadline(nextDeadline.p!.deadline!)}</p>
            </>
          ) : (
            <p className="m-0">No upcoming deadline.</p>
          )}
        </GlassCard>

        <GlassCard aria-labelledby="moment-h">
          <h2 id="moment-h" className="card-title">
            Next test moment
          </h2>
          {nextMoment ? (
            <p className="m-0">
              <Link to={`/frostpure/run/${nextMoment.r.id}`}>{nextMoment.m.title}</Link> · {CLOCK.format(nextMoment.at!)} · <span className="tnum">{countdown(nextMoment.at!.getTime() - now.getTime())}</span>
            </p>
          ) : (
            <p className="m-0">None planned. Add test moments when you define a run.</p>
          )}
        </GlassCard>

        <GlassCard aria-labelledby="bom-h">
          <h2 id="bom-h" className="card-title">
            <Link to="/frostpure/build">Parts</Link>
          </h2>
          <FreezeFrontBar value={prep} label="Parts on hand" valueText={`${totals.have} have, ${totals.ordered} ordered, ${totals.need} to buy`} salt={Math.min(totals.need, 12)} />
          <p className="m-0 mt-2">
            {totals.have} have · {totals.ordered} ordered · {totals.need} need
            {!allHave && (
              <>
                {' '}
                · still to buy {money(totals.stillToBuyKZT, settings.usdRate)} <span className="text-sm">approx.</span>
              </>
            )}
          </p>
        </GlassCard>

        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <PillButton
            onClick={async () => {
              const r = newRun({ name: `Run ${data.runs.length + 1}` });
              await saveRun(r);
              navigate(`/frostpure/run/${r.id}?edit=1`);
            }}
          >
            New run
          </PillButton>
          {data.runs.find((r) => r.status === 'running') && (
            <Link to={`/frostpure/run/${data.runs.find((r) => r.status === 'running')!.id}#samples`} className="pill pill--secondary">
              Log sample
            </Link>
          )}
          <Link to="/frostpure/media?add=photo" className="pill pill--secondary">
            Add photo
          </Link>
        </div>
      </div>
    </>
  );
}
