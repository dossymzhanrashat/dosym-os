import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { GlassCard, PillButton } from '../../core/design/components';
import { db } from '../../core/db/db';
import { anchorOf, entriesInRange, entryFor } from '../../core/planner/entries';
import { computeReminders } from '../../core/planner/reminderEngine';
import { setDone, snooze, usePlannerItems } from '../../core/planner/store';
import { addDays, startOfDay } from '../../core/planner/time';

/*
 * When the site is open, reminders show as an in-app banner (SPEC.md › Notification rules):
 * computed locally every 30 s, and also raised by pushes arriving while the page is open.
 * Also: opens the page a tapped notification points to, and keeps the Home Screen badge count.
 */

interface Banner {
  key: string;
  title: string;
  body: string;
  url: string;
  itemId: string | null;
}

/** "/dosym-os/planner/item/x?on=…" → "/planner/item/x?on=…" for the router. */
function routerPath(url: string): string {
  const base = import.meta.env.BASE_URL;
  const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;
  return path.startsWith(base) ? `/${path.slice(base.length)}` : path;
}

export function ReminderBanner() {
  const navigate = useNavigate();
  const items = usePlannerItems();
  const [banner, setBanner] = useState<Banner | null>(null);
  const shown = useRef(new Set<string>());
  const lastCheck = useRef(new Date());

  // Local reminders falling due while the page is open.
  useEffect(() => {
    const tick = async () => {
      const now = new Date();
      const all = await db.plannerItems.toArray();
      const due = computeReminders(all, { now: lastCheck.current, base: import.meta.env.BASE_URL, days: 1 }).filter((d) => new Date(d.fireAt) <= now);
      lastCheck.current = now;
      const next = due.find((d) => !shown.current.has(d.id));
      if (next && document.visibilityState === 'visible') {
        shown.current.add(next.id);
        setBanner({ key: next.id, title: next.title, body: next.body, url: next.url, itemId: next.plannerItemId });
      }
    };
    const t = setInterval(() => void tick(), 30_000);
    return () => clearInterval(t);
  }, []);

  // Messages from the service worker: a push arrived, or a notification was tapped.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; url?: string; payload?: { title: string; body: string; url: string; tag: string } };
      if (msg?.type === 'dosym-open' && msg.url) navigate(routerPath(msg.url));
      if (msg?.type === 'dosym-push' && msg.payload && !shown.current.has(msg.payload.tag)) {
        const p = msg.payload;
        shown.current.add(p.tag);
        const itemId = routerPath(p.url).match(/^\/planner\/item\/([^?]+)/)?.[1] ?? null;
        setBanner({ key: p.tag, title: p.title, body: p.body, url: p.url, itemId });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  // Home Screen badge: open items due today or overdue.
  const dueCount = useMemo(() => {
    const today = startOfDay(new Date());
    return entriesInRange(items, addDays(today, -30), addDays(today, 1)).filter((e) => !e.done && anchorOf(e)).length;
  }, [items]);
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (dueCount > 0) nav.setAppBadge?.(dueCount).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [dueCount]);

  if (!banner) return null;

  const act = async (what: 'done' | 'snooze') => {
    const path = routerPath(banner.url);
    const occurrence = new URLSearchParams(path.split('?')[1] ?? '').get('on') ?? undefined;
    const item = banner.itemId ? await db.plannerItems.get(banner.itemId) : undefined;
    const entry = item && entryFor(item, occurrence);
    if (entry) await (what === 'done' ? setDone(entry, true) : snooze(entry));
    setBanner(null);
  };

  return (
    <div className="banner" role="alert">
      <GlassCard size="md" className="grid gap-2">
        <strong className="text-ink">{banner.title}</strong>
        {banner.body && <span className="text-sm">{banner.body}</span>}
        <div className="flex flex-wrap gap-2">
          <PillButton
            onClick={() => {
              navigate(routerPath(banner.url));
              setBanner(null);
            }}
          >
            Open
          </PillButton>
          {banner.itemId && (
            <>
              <PillButton variant="secondary" onClick={() => void act('done')}>
                Done
              </PillButton>
              <PillButton variant="secondary" onClick={() => void act('snooze')}>
                Snooze 1 h
              </PillButton>
            </>
          )}
          <PillButton variant="secondary" onClick={() => setBanner(null)}>
            Dismiss
          </PillButton>
        </div>
      </GlassCard>
    </div>
  );
}
