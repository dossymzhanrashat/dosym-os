import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { saveSetting, useSetting } from '../planner/store';
import { PillButton } from './components';
import { Mascot } from './Mascot';

/*
 * Mascot moments (brand/DESIGN.md: the droplet appears only for milestones — streaks, a submitted
 * application, a successful experiment). Each milestone shows once: seen ones are kept in a
 * synced setting, so the phone and the laptop do not both celebrate the same thing. The bounce
 * is switched off by prefers-reduced-motion.
 */

const SEEN = 'mascot:milestones';
const NONE: Record<string, string> = {};

export async function isMilestoneSeen(key: string): Promise<boolean> {
  return !!(((await db.settings.get(SEEN))?.value ?? {}) as Record<string, string>)[key];
}

export async function markMilestone(key: string): Promise<void> {
  const seen = ((await db.settings.get(SEEN))?.value ?? {}) as Record<string, string>;
  if (!seen[key]) await saveSetting(SEEN, { ...seen, [key]: new Date().toISOString() });
}

/** The first of `keys` that is reached (its condition is true) and not yet celebrated. */
export function useMilestone(candidates: { key: string; reached: boolean }[]): { key: string; dismiss: () => void } | null {
  const seen = useSetting(SEEN, NONE);
  const [shown, setShown] = useState<string | null>(null);
  const next = candidates.find((c) => c.reached && !seen[c.key])?.key ?? null;
  useEffect(() => {
    if (next && !shown) setShown(next);
  }, [next, shown]);
  if (!shown) return null;
  return {
    key: shown,
    dismiss: () => {
      void markMilestone(shown);
      setShown(null);
    },
  };
}

export function Celebration({ title, children, onClose }: { title: string; children?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="notice notice--good celebration" role="status">
      <Mascot mood="happy" size={64} bounce label="Celebrating droplet" />
      <div className="grid gap-1">
        <strong>{title}</strong>
        {children && <span>{children}</span>}
      </div>
      <PillButton variant="secondary" className="ml-auto" onClick={onClose}>
        Thanks
      </PillButton>
    </div>
  );
}
