import { useMemo } from 'react';
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { DAY } from '../../../core/planner/time';
import type { ReviewLog, VocabCard } from '../model/types';
import { retrievability } from '../srs/fsrsMath';
import { cardR } from '../srs/scheduler';

/*
 * Forgetting curve of one card (SPEC § 5.5), in the Freeze Front style: recall R(t) as the cyan
 * front line, resetting to 1.0 at every review (a saw-tooth). Ice above the dashed 0.90 target,
 * violet brine below it; dark salt dots where the curve dipped into the brine; review ticks on the
 * axis (Again warm). "Now" marks today's R. Ice on top, brine below — never flipped.
 */

interface Point {
  x: number; // days since the first review
  r?: number;
  ice?: number;
}

const TARGET = 0.9;
const SAMPLES = 24;

export function curveData(card: VocabCard, logs: ReviewLog[], now: Date) {
  const reviews = logs.filter((l) => l.cardId === card.id && !l.deletedAt).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  if (!reviews.length || !card.lastReview) return null;
  const t0 = new Date(reviews[0].reviewedAt).getTime();
  const dx = (iso: string | number) => ((typeof iso === 'number' ? iso : new Date(iso).getTime()) - t0) / DAY;
  const end = Math.max(dx(card.due) + 30, dx(now.getTime()) + 1);

  const points: Point[] = [];
  const salt: { x: number; y: number }[] = [];
  reviews.forEach((log, i) => {
    const from = dx(log.reviewedAt);
    const to = i + 1 < reviews.length ? dx(reviews[i + 1].reviewedAt) : end;
    const s = Math.max(log.sAfter, 0.01);
    for (let k = 0; k <= SAMPLES; k++) {
      const x = from + ((to - from) * k) / SAMPLES;
      const r = retrievability(x - from, s);
      points.push({ x, r, ice: Math.max(r, TARGET) });
    }
    // Where the line ended below the target before the next review: a salt dot.
    if (i + 1 < reviews.length) {
      const rEnd = retrievability(to - from, s);
      if (rEnd < TARGET) salt.push({ x: to, y: Math.max(rEnd, 0.5) });
    }
  });
  const ticks = reviews.map((l) => ({ x: dx(l.reviewedAt), y: 0.5, grade: l.grade }));
  return { points, salt, ticks, nowX: dx(now.getTime()), dueX: dx(card.due), end };
}

const fmt = (n: number) => n.toFixed(2);

export function ForgettingCurve({ card, logs, now = new Date() }: { card: VocabCard; logs: ReviewLog[]; now?: Date }) {
  const data = useMemo(() => curveData(card, logs, now), [card, logs, now]);
  const r = cardR(card, now);
  const inDays = Math.max(0, Math.round((new Date(card.due).getTime() - now.getTime()) / DAY));
  const summary = `Recall today ${Math.round(r * 100)} percent. Next review ${inDays === 0 ? 'today' : `in ${inDays} day${inDays > 1 ? 's' : ''}`}.`;

  if (!data) return <p className="m-0 text-sm">No reviews yet — the curve starts after the first review.</p>;

  return (
    <figure className="m-0" aria-label={summary}>
      <div className="chart chart--tall" aria-hidden="true">
        <ResponsiveContainer>
          <ComposedChart data={data.points} margin={{ top: 12, right: 12, bottom: 4, left: -18 }}>
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, data.end]}
              tickFormatter={(v: number) => `${Math.round(v)}d`}
              stroke="var(--card-border)"
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis domain={[0.5, 1]} ticks={[0.5, 0.7, 0.9, 1]} stroke="var(--card-border)" tickLine={false} />
            {/* brine zone below the target */}
            <ReferenceArea y1={0.5} y2={TARGET} fill="var(--violet)" fillOpacity={0.12} stroke="none" ifOverflow="hidden" />
            {/* ice: between the target and the curve */}
            <Area dataKey="ice" baseValue={TARGET} type="linear" stroke="none" fill="var(--ice)" fillOpacity={0.12} isAnimationActive={false} />
            <ReferenceLine y={TARGET} stroke="var(--text-3)" strokeDasharray="4 4" />
            <Line dataKey="r" type="linear" stroke="var(--ice)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Scatter data={data.salt} dataKey="y" fill="var(--salt)" stroke="var(--violet)" strokeWidth={1} isAnimationActive={false} />
            <Scatter
              data={data.ticks}
              dataKey="y"
              isAnimationActive={false}
              shape={(p: { cx?: number; cy?: number; payload?: { grade: number } }) => (
                <rect x={(p.cx ?? 0) - 1.5} y={(p.cy ?? 0) - 8} width={3} height={8} rx={1.5} fill={p.payload?.grade === 1 ? 'var(--warm)' : 'var(--ice)'} />
              )}
            />
            <ReferenceLine x={data.nowX} stroke="var(--text-2)" strokeWidth={1} label={{ value: 'Now', position: 'insideTopRight', fill: 'var(--text-2)', fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: 'var(--card-border)' }}
              content={({ active, payload }) => {
                const p = payload?.find((x) => x.dataKey === 'r')?.payload as Point | undefined;
                if (!active || !p || p.r === undefined) return null;
                return (
                  <div className="chart-tip">
                    Day {p.x.toFixed(1)} <span>· recall</span> {Math.round(p.r * 100)}%
                  </div>
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="chart-caption">
        R today {fmt(r)} · S {card.stability.toFixed(1)} d · D {card.difficulty.toFixed(1)} · next review {inDays === 0 ? 'today' : `in ${inDays} d`}
        <br />
        <span className="swatch" style={{ background: 'var(--warm)' }} />
        Again <span className="swatch ml-3" style={{ background: 'var(--ice)' }} />
        Hard/Good/Easy · dashed line = 0.90 target
      </figcaption>
    </figure>
  );
}
