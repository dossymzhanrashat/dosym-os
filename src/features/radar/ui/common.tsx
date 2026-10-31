import { Chip, type ChipTone } from '../../../core/design/components';
import { effectiveStatus } from '../engine/time';
import type { OppCategory, Opportunity, PipelineStatus, RadarDeadline, ResultOutcome } from '../model/types';

// Small pieces shared by the Radar pages.

export const STATUS: Record<Exclude<PipelineStatus, 'hidden'>, { label: string; kk: string; ru: string }> = {
  watching: { label: 'Watching', kk: 'Бақылау', ru: 'Наблюдаю' },
  preparing: { label: 'Preparing', kk: 'Дайындық', ru: 'Подготовка' },
  submitted: { label: 'Submitted', kk: 'Жіберілді', ru: 'Отправлено' },
  result: { label: 'Result', kk: 'Нәтиже', ru: 'Результат' },
};

export const RESULT_LABEL: Record<ResultOutcome, string> = {
  accepted: 'Accepted',
  award: 'Award',
  finalist: 'Finalist',
  waitlisted: 'Waitlisted',
  notSelected: 'Not selected',
  withdrawn: 'Withdrawn',
};

export const CATEGORY_LABEL: Record<OppCategory, string> = {
  olympiad: 'Olympiad',
  mathModeling: 'Math modelling',
  research: 'Research',
  summerProgram: 'Summer program',
  innovation: 'Innovation',
  entrepreneurship: 'Entrepreneurship',
  sustainability: 'Sustainability',
  scholarship: 'Scholarship',
  applicationSupport: 'Application support',
  artWriting: 'Art & writing',
  csCyber: 'CS & cyber',
  physics: 'Physics',
  other: 'Other',
};

const DATE_CHIP: Record<RadarDeadline['status'], { tone: ChipTone; label: string }> = {
  confirmed: { tone: 'good', label: 'Confirmed' },
  estimated: { tone: 'plain', label: 'Estimated' },
  stale: { tone: 'warm', label: 'Stale' },
};

export function DateStatusChip({ d, now }: { d: RadarDeadline; now: Date }) {
  const s = DATE_CHIP[effectiveStatus(d, now)];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function costLabel(o: Pick<Opportunity, 'cost' | 'aid'>): string {
  if (o.cost && /^free\b/i.test(o.cost.trim())) return 'Free';
  if (!o.cost) return o.aid ? 'Aid' : 'Cost unknown';
  return o.aid ? 'Fee + aid' : 'Fee';
}

/** Fit 0–100 as a small ring. */
export function FitRing({ value, size = 40 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <svg className="rd-fit" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Fit ${value} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="rd-fit-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="rd-fit-fill" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="rd-fit-text">
        {value}
      </text>
    </svg>
  );
}

/** "in 4 days", "today", "2 days ago". */
export function daysText(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`;
  return `in ${days} days`;
}

export const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return url ?? '';
  }
};
