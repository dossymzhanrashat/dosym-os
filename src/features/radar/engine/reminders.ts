import type { ReminderDraft } from '../../../core/planner/reminderEngine';
import { almatyAt, DAY, HOUR } from '../../../core/planner/time';
import type { Opportunity, RadarDeadline } from '../model/types';
import { progress } from './plan';
import { deadlineAt, describeDeadline, effectiveStatus, safeDayKey } from './time';

/*
 * Radar reminder ladder (SPEC § 4.6, § 4.9), as Web Push rows:
 *   Preparing   T-30, T-14, T-7, T-3, T-1 and day-of at 08:00 Almaty, plus 3 h before the exact time
 *   Watching    T-14 and T-3 only
 *   Submitted   only event and decision deadlines; decision day says "Results expected today"
 * Estimated dates add "(est.)"; confirmed dates not rechecked for 14 days add "(check date)".
 * Radar holds at most 24 rows at a time, earliest first, Preparing ahead of Watching on the same minute.
 */

export const RADAR_CAP = 24;
const PREPARING = [30, 14, 7, 3, 1];
const WATCHING = [14, 3];
const SUBMITTED_EVENT = [7, 1];
const RANK = { preparing: 0, submitted: 1, watching: 2, result: 3, hidden: 4 } as const;

const typeLabel = (d: RadarDeadline) => (d.type === 'submission' ? 'submission' : d.type);
const est = (d: RadarDeadline, now: Date) => ({ confirmed: '', estimated: ' (est.)', stale: ' (check date)' })[effectiveStatus(d, now)];

function at0800(key: string, minusDays: number): Date {
  const [y, m, d] = key.split('-').map(Number);
  return almatyAt(y, m - 1, d - minusDays, 8 * 60);
}

export function radarReminders(opps: Opportunity[], now: Date, days: number, base: string): ReminderDraft[] {
  const end = now.getTime() + days * DAY;
  const out: (ReminderDraft & { rank: number })[] = [];

  for (const o of opps) {
    if (o.deletedAt || o.cancelled || !(o.status in RANK) || o.status === 'result' || o.status === 'hidden') continue;
    const prog = progress(o.requirements);
    const progText = prog.total ? ` ${prog.done} of ${prog.total} items done.` : '';
    const url = `${base}radar/o/${encodeURIComponent(o.id)}`;
    for (const d of o.deadlines) {
      const exact = deadlineAt(d);
      if (exact.getTime() <= now.getTime()) continue;
      if (o.status === 'submitted' && d.type !== 'event' && d.type !== 'decision') continue;
      const key = safeDayKey(d);
      const when = describeDeadline(d);
      const add = (tag: string, fire: Date, title: string, body: string, alarm = false) => {
        if (fire.getTime() <= now.getTime() || fire.getTime() > end) return;
        out.push({ id: `radar:${o.id}:${d.id}:${tag}`, plannerItemId: null, fireAt: fire.toISOString(), title, body, url, alarm, rank: RANK[o.status] });
      };
      const name = `${o.name} · ${typeLabel(d)}`;

      if (o.status === 'submitted' && d.type === 'decision') {
        add('d0', at0800(key, 0), 'Results expected today', `${o.name}${est(d, now)}`);
        continue;
      }
      const ladder = o.status === 'preparing' ? PREPARING : o.status === 'submitted' ? SUBMITTED_EVENT : WATCHING;
      for (const n of ladder) add(`t${n}`, at0800(key, n), name, `Due in ${n} day${n > 1 ? 's' : ''}${est(d, now)} (${when}).${o.status === 'preparing' ? progText : ''}`);
      if (o.status !== 'watching') {
        add('d0', at0800(key, 0), name, `Due today${est(d, now)} (${when}).${o.status === 'preparing' ? progText : ''}`, true);
        add('h3', new Date(exact.getTime() - 3 * HOUR), name, `Due in 3 hours${est(d, now)} (${when}).`, true);
      }
    }
  }

  return out
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.rank - b.rank)
    .slice(0, RADAR_CAP)
    .map(({ rank: _r, ...d }) => d);
}
