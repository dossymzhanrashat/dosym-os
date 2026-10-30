import { durationMinutes, type PlannerEntry } from './entries';
import { MINUTE, startOfDay } from './time';

// Placing timed entries on a day timeline, and the daily load guard.

export const DAY_START = 6 * 60; // the Day timeline runs 06:00–24:00
export const DAY_END = 24 * 60;
export const LOAD_LIMIT_MIN = 8 * 60; // more than 8 planned hours → amber warning

export interface Placed {
  entry: PlannerEntry;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

/** Minutes since the start of `day` (can be negative or past 1440 for items crossing midnight). */
export function minutesFrom(day: Date, iso: string): number {
  return Math.round((new Date(iso).getTime() - startOfDay(day).getTime()) / MINUTE);
}

/** Timed entries of a day, clamped to the visible hours and spread into side-by-side lanes when they overlap. */
export function layoutDay(entries: PlannerEntry[], day: Date, from = DAY_START, to = DAY_END): Placed[] {
  const timed = entries
    .filter((e) => e.start)
    .map((e) => {
      const s = Math.min(Math.max(minutesFrom(day, e.start!), from), to - 15);
      const raw = e.end ? minutesFrom(day, e.end) : s + 30;
      return { entry: e, startMin: s, endMin: Math.min(Math.max(raw, s + 15), to), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Clusters of mutually overlapping entries share a lane count.
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => (p.lanes = lanes));
    cluster = [];
  };
  for (const p of timed) {
    if (p.startMin >= clusterEnd) {
      close();
      clusterEnd = -1;
    }
    const laneEnds = new Map<number, number>();
    cluster.forEach((q) => laneEnds.set(q.lane, Math.max(laneEnds.get(q.lane) ?? -1, q.endMin)));
    let lane = 0;
    while ((laneEnds.get(lane) ?? -1) > p.startMin) lane++;
    p.lane = lane;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.endMin);
  }
  close();
  return timed;
}

/** Planned minutes on a day: the length of every timed entry that is not done. */
export function plannedMinutes(entries: PlannerEntry[]): number {
  return entries.filter((e) => !e.done).reduce((sum, e) => sum + durationMinutes(e), 0);
}
