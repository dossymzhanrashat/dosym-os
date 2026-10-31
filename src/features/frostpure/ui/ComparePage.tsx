import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { GlassCard } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { useFrostData } from '../data/store';
import { computeResults, concentrationGL, pct } from '../engine/results';
import type { Run } from '../model/types';
import { FrostNav, Measured } from './common';

/*
 * Compare Runs (SPEC Module 2 › 3): EC of the clean and brine samples over hours since start, one
 * colour per run (2–4 runs); a table of inputs and results; and the key science plot for the
 * Brief — salt rejection vs freeze rate across every completed run.
 */

const COLORS = ['var(--ice)', 'var(--violet)', 'var(--sky)', 'var(--warm)'];
const axis = { stroke: 'var(--text-3)', tick: { fill: 'var(--text-3)', fontSize: 11 }, tickLine: false, axisLine: false };

function series(r: Run) {
  const t0 = Date.parse(r.startedAt ?? r.createdAt);
  return r.samples
    .filter((s) => s.point === 'clean' || s.point === 'brine')
    .map((s) => ({ h: Math.round(((Date.parse(s.at) - t0) / 3_600_000) * 10) / 10, [`${r.id}:${s.point}`]: concentrationGL(s, r.tdsK) }));
}

export function ComparePage() {
  const data = useFrostData();
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
  const runs = ids.map((id) => data.runs.find((r) => r.id === id)).filter((r): r is Run => !!r);

  const lines = useMemo(() => runs.flatMap(series).sort((a, b) => a.h - b.h), [runs]);
  const scatter = useMemo(
    () =>
      data.runs
        .filter((r) => r.status === 'done')
        .map((r) => ({ r, res: computeResults(r) }))
        .filter(({ res }) => res.rejection.ok && res.freezeRateCmH.ok)
        .map(({ r, res }) => ({ name: r.name, rate: (res.freezeRateCmH as { value: number }).value, R: Math.round((res.rejection as { value: number }).value * 100) })),
    [data.runs],
  );

  if (!data.loaded) return <SaltDotsLoader label="Opening" />;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · <Link to="/frostpure/lab">Lab</Link> · Compare
        </p>
        <h1 className="ff-title">Compare runs</h1>
      </header>
      <FrostNav />
      <div className="grid gap-3">
        {runs.length < 2 ? (
          <GlassCard size="md">
            <p className="m-0">
              Pick 2–4 runs in the <Link to="/frostpure/lab">lab</Link> with “Compare”.
            </p>
          </GlassCard>
        ) : (
          <>
            <GlassCard className="grid gap-2">
              <h2 className="card-title m-0">Salt in clean and brine samples, g/L</h2>
              <div className="fp-chart" aria-hidden="true">
                <ResponsiveContainer>
                  <LineChart data={lines} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--card-border-soft)" />
                    <XAxis dataKey="h" type="number" unit=" h" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--card-border)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {runs.flatMap((r, i) =>
                      (['clean', 'brine'] as const).map((p) => (
                        <Line key={`${r.id}:${p}`} dataKey={`${r.id}:${p}`} name={`${r.name} · ${p}`} stroke={COLORS[i]} strokeDasharray={p === 'brine' ? '5 4' : undefined} connectNulls dot isAnimationActive={false} />
                      )),
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="m-0 text-sm">Solid lines: clean water. Dashed: brine. Hours since each run started.</p>
            </GlassCard>

            <GlassCard className="fp-table-wrap">
              <table className="fp-table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Feed g/L</th>
                    <th>Feed L</th>
                    <th>°C</th>
                    <th>% frozen</th>
                    <th>R</th>
                    <th>Y</th>
                    <th>CF</th>
                    <th>cm/h</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => {
                    const res = computeResults(r);
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className="fp-dot" style={{ background: COLORS[i] }} aria-hidden="true" /> <Link to={`/frostpure/run/${r.id}`}>{r.name}</Link>
                        </td>
                        <td>{r.feedSalinityGL}</td>
                        <td>{r.feedVolumeL}</td>
                        <td>{r.plannedAmbientC}</td>
                        <td>{r.targetFrozenPct}</td>
                        <td>{pct(res.rejection)}</td>
                        <td>{pct(res.recovery)}</td>
                        <td>{res.concentrationFactor.ok ? res.concentrationFactor.value.toFixed(2) : '—'}</td>
                        <td>{res.freezeRateCmH.ok ? res.freezeRateCmH.value.toFixed(2) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GlassCard>
          </>
        )}

        <GlassCard className="grid gap-2">
          <h2 className="card-title m-0">
            Salt rejection vs freeze rate · all completed runs <Measured kind="measured" />
          </h2>
          {scatter.length === 0 ? (
            <p className="m-0">Needs completed runs with R and the ice thickness / freeze time entered.</p>
          ) : (
            <>
              <div className="fp-chart" aria-hidden="true">
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--card-border-soft)" />
                    <XAxis dataKey="rate" type="number" name="Freeze rate" unit=" cm/h" {...axis} />
                    <YAxis dataKey="R" type="number" name="R" unit="%" domain={[0, 100]} {...axis} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--card-border)' }} />
                    <Scatter data={scatter} fill="var(--ice)" isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <ul className="sr-only">
                {scatter.map((s) => (
                  <li key={s.name}>
                    {s.name}: freeze rate {s.rate.toFixed(2)} cm/h, R {s.R}%
                  </li>
                ))}
              </ul>
            </>
          )}
        </GlassCard>
      </div>
    </>
  );
}
