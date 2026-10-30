import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassCard, StatTile } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { DAY } from '../../../core/planner/time';
import { medianSeconds, useEnglishData, useEnglishSettings } from '../data/store';
import { newCap } from '../srs/phase';
import { forecast } from '../srs/queue';
import { wordState } from '../srs/status';
import { studyDay } from '../srs/studyDay';
import './english.css';

/*
 * Stats (SPEC § 11): retention against the 0.90 target, words mastered over time, the next 14 days
 * of load, and scheduler health. Band progress, practice heatmap and error tags arrive with the
 * Practice log. One series per chart (no legend needed); every chart has a table view.
 */

const dayLabel = (k: string) => {
  const [, m, d] = k.split('-').map(Number);
  return `${d}/${m}`;
};

function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm">Show as a table</summary>
      <div className="table-wrap mt-2">
        <table className="data-table">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Tip({ active, label, value }: { active?: boolean; label?: ReactNode; value?: string }) {
  if (!active || value === undefined) return null;
  return (
    <div className="chart-tip">
      {label} <span>·</span> {value}
    </div>
  );
}

const axis = { stroke: 'var(--card-border)', tickLine: false } as const;

export function StatsPage() {
  const data = useEnglishData();
  const settings = useEnglishSettings();
  const now = useMemo(() => new Date(), [data]);

  const days = useMemo(() => Array.from({ length: 60 }, (_, i) => studyDay(new Date(now.getTime() - (59 - i) * DAY))), [now]);

  // 1. True retention: share of review-state cards graded ≥ Hard, 30-day rolling.
  const retention = useMemo(() => {
    const perDay = new Map<string, { ok: number; n: number }>();
    for (const l of data.logs) {
      if (l.stateBefore !== 'review') continue;
      const d = studyDay(new Date(l.reviewedAt));
      const v = perDay.get(d) ?? { ok: 0, n: 0 };
      v.n++;
      if (l.grade >= 2) v.ok++;
      perDay.set(d, v);
    }
    return days.map((d, i) => {
      let ok = 0;
      let n = 0;
      for (const w of days.slice(Math.max(0, i - 29), i + 1)) {
        ok += perDay.get(w)?.ok ?? 0;
        n += perDay.get(w)?.n ?? 0;
      }
      return { day: d, value: n ? ok / n : undefined, n };
    });
  }, [data.logs, days]);
  const lowStreak = (() => {
    let s = 0;
    for (const r of [...retention].reverse()) {
      if (r.value !== undefined && r.value < 0.85) s++;
      else break;
    }
    return s;
  })();

  // 2. Words mastered over time (frozen dates), plus today's counts.
  const mastered = useMemo(
    () => days.map((d) => ({ day: d, value: data.notes.filter((n) => n.frozenAt && studyDay(new Date(n.frozenAt)) <= d).length })),
    [data.notes, days],
  );
  const counts = useMemo(() => {
    const c = { frozen: 0, learning: 0, new: 0, salt: 0 };
    for (const n of data.notes) {
      const s = wordState(n, data.cardsByNote.get(n.id) ?? [], now);
      if (s === 'frozen' || s === 'thawing') c.frozen++;
      else if (s === 'learning') c.learning++;
      else if (s === 'new') c.new++;
      else if (s === 'salt') c.salt++;
    }
    return c;
  }, [data, now]);

  // 3. Load forecast: reviews due per day for 14 days, plus expected new cards (phase cap).
  const secs = medianSeconds(data.logs);
  const load = useMemo(
    () => forecast(data.cards, now, 14).map((f, i) => ({ day: f.day, reviews: f.count, newCards: i === 0 ? 0 : newCap(f.day, 0, settings.newPerDay).cap })),
    [data.cards, now, settings.newPerDay],
  );
  const hasNew = data.cards.some((c) => c.state === 'new');

  // 7. Scheduler health.
  const reviewCards = data.cards.filter((c) => c.state === 'review' && !c.suspended);
  const avgD = reviewCards.length ? reviewCards.reduce((s, c) => s + c.difficulty, 0) / reviewCards.length : undefined;
  const sortedS = reviewCards.map((c) => c.stability).sort((a, b) => a - b);
  const medianS = sortedS.length ? sortedS[Math.floor(sortedS.length / 2)] : undefined;
  const reviewLogs = data.logs.filter((l) => l.stateBefore === 'review');
  const lapsesPer100 = reviewLogs.length ? (100 * reviewLogs.filter((l) => l.grade === 1).length) / reviewLogs.length : undefined;

  if (!data.loaded) return <SaltDotsLoader label="Loading stats" />;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Stats
        </p>
        <h1 className="ff-title">Stats</h1>
      </header>

      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={counts.frozen} label="Frozen (mastered)" />
          <StatTile value={counts.learning} label="Learning" />
          <StatTile value={counts.new} label="New, waiting" />
          <StatTile value={counts.salt} label="Salt (weak)" />
        </div>

        <GlassCard aria-labelledby="ret-h">
          <h2 id="ret-h" className="card-title">
            Retention, 30-day rolling
          </h2>
          {lowStreak >= 14 && (
            <p className="notice notice--warm mb-3">Retention has been below 85% for {lowStreak} days. Try fewer new words for a while (English settings → New cards per day).</p>
          )}
          {retention.some((r) => r.value !== undefined) ? (
            <>
              <div className="chart" aria-hidden="true">
                <ResponsiveContainer>
                  <LineChart data={retention} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <XAxis dataKey="day" tickFormatter={dayLabel} {...axis} minTickGap={24} />
                    <YAxis domain={[0.5, 1]} ticks={[0.5, 0.7, 0.9, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} {...axis} />
                    <ReferenceLine y={0.9} stroke="var(--text-3)" strokeDasharray="4 4" />
                    <Line dataKey="value" stroke="var(--ice)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                    <Tooltip
                      cursor={{ stroke: 'var(--card-border)' }}
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload as (typeof retention)[number] | undefined;
                        return <Tip active={active} label={p && dayLabel(p.day)} value={p?.value === undefined ? undefined : `${Math.round(p.value * 100)}% of ${p.n}`} />;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="chart-caption">Dashed line: the 90% target.</p>
              <TableView head={['Day', 'Retention', 'Reviews (30 d)']} rows={retention.filter((r) => r.value !== undefined).map((r) => [r.day, `${Math.round(r.value! * 100)}%`, r.n])} />
            </>
          ) : (
            <p className="m-0">Appears after your first reviews of graduated cards.</p>
          )}
        </GlassCard>

        <GlassCard aria-labelledby="mast-h">
          <h2 id="mast-h" className="card-title">
            Words mastered
          </h2>
          <div className="chart" aria-hidden="true">
            <ResponsiveContainer>
              <AreaChart data={mastered} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <XAxis dataKey="day" tickFormatter={dayLabel} {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} {...axis} />
                <Area dataKey="value" type="monotone" stroke="var(--ice)" strokeWidth={2} fill="var(--ice)" fillOpacity={0.12} isAnimationActive={false} />
                <Tooltip
                  cursor={{ stroke: 'var(--card-border)' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof mastered)[number] | undefined;
                    return <Tip active={active} label={p && dayLabel(p.day)} value={p ? `${p.value} frozen` : undefined} />;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-caption">A word freezes when every card holds for 30+ days and was last graded Good or Easy.</p>
          <TableView head={['Day', 'Frozen']} rows={mastered.filter((_, i) => i % 7 === 6 || i === mastered.length - 1).map((m) => [m.day, m.value])} />
        </GlassCard>

        <GlassCard aria-labelledby="load-h">
          <h2 id="load-h" className="card-title">
            Next 14 days
          </h2>
          <div className="chart" aria-hidden="true">
            <ResponsiveContainer>
              <BarChart data={load} margin={{ top: 8, right: 12, bottom: 0, left: -18 }} barCategoryGap="30%">
                <XAxis dataKey="day" tickFormatter={dayLabel} {...axis} minTickGap={8} />
                <YAxis allowDecimals={false} {...axis} />
                <Bar dataKey="reviews" stackId="a" fill="var(--ice)" maxBarSize={24} radius={hasNew ? [0, 0, 0, 0] : [4, 4, 0, 0]} isAnimationActive={false} />
                {hasNew && <Bar dataKey="newCards" stackId="a" fill="var(--violet)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
                <Tooltip
                  cursor={{ fill: 'var(--chip)' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof load)[number] | undefined;
                    return <Tip active={active} label={p && dayLabel(p.day)} value={p ? `${p.reviews} reviews${hasNew ? ` + ${p.newCards} new` : ''}` : undefined} />;
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-caption">
            <span className="swatch" style={{ background: 'var(--ice)' }} />
            Reviews due
            {hasNew && (
              <>
                <span className="swatch ml-3" style={{ background: 'var(--violet)' }} />
                Expected new cards
              </>
            )}{' '}
            · Tomorrow: {load[1].reviews} reviews ≈ {Math.max(1, Math.round(((load[1].reviews + load[1].newCards) * secs) / 60))} min
          </p>
          <TableView head={['Day', 'Reviews due', 'New (expected)']} rows={load.map((l) => [l.day, l.reviews, l.newCards])} />
        </GlassCard>

        <GlassCard aria-labelledby="health-h">
          <h2 id="health-h" className="card-title">
            Scheduler health
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile value={avgD === undefined ? '—' : avgD.toFixed(1)} label="Average difficulty (1–10)" />
            <StatTile value={medianS === undefined ? '—' : medianS.toFixed(1)} unit="d" label="Median stability" />
            <StatTile value={lapsesPer100 === undefined ? '—' : lapsesPer100.toFixed(1)} label="Lapses per 100 reviews" />
          </div>
          <p className="chart-caption">
            {settings.scheduler === 'fsrs5' ? 'FSRS-5' : 'Simple ladder'} · target retention {Math.round(settings.retention * 100)}% · {data.logs.length} reviews logged. Personal FSRS
            weights are a later step (after about 1,000 reviews).
          </p>
        </GlassCard>

        <GlassCard size="md">
          <p className="m-0 text-sm">Band progress, the practice heatmap and error tags appear once Practice logging (timers, raw scores, mocks) is built.</p>
        </GlassCard>
      </div>
    </>
  );
}
