import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../core/design/components';
import { FreezeFrontHeader } from '../../core/design/FreezeFront';
import { Mascot } from '../../core/design/Mascot';
import { useSyncStatus } from '../../core/db/sync';
import { entriesInRange } from '../../core/planner/entries';
import { usePlannerItems } from '../../core/planner/store';
import { addDays, startOfDay } from '../../core/planner/time';
import { EntryRow, whenText } from '../planner/EntryRow';
import { useQuickAdd } from '../planner/QuickAdd';
import { todayPlan, useEnglishData, useEnglishSettings } from '../english/data/store';
import '../planner/planner.css';

const almatyDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Almaty',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const COMING = [
  { name: "Today's practice quota", phase: 2 },
  { name: 'Daily Radar card', phase: 4 },
  { name: 'FrostPure test moment', phase: 5 },
];

export function TodayPage() {
  const items = usePlannerItems();
  const sync = useSyncStatus();
  const openQuickAdd = useQuickAdd();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = startOfDay(now);
  const todays = useMemo(() => entriesInRange(items, today, addDays(today, 1)), [items, today.getTime()]);
  const deadlines = useMemo(
    () => entriesInRange(items, now, addDays(today, 120)).filter((e) => e.kind === 'deadline' && !e.done).slice(0, 3),
    [items, today.getTime()],
  );

  const english = useEnglishData();
  const englishSettings = useEnglishSettings();
  const englishPlan = useMemo(() => todayPlan(english, englishSettings, now), [english, englishSettings, now]);
  const englishLeft = englishPlan.queue.order.length;

  const done = todays.filter((e) => e.done).length;
  const timed = todays.filter((e) => e.start && !e.done);
  const current = timed.find((e) => new Date(e.start!) <= now && new Date(e.end ?? e.start!) > now);
  const next = timed.find((e) => new Date(e.start!) > now);

  return (
    <>
      <FreezeFrontHeader
        title="Today"
        gloss="Бүгін"
        eyebrow={almatyDate.format(now)}
        value={todays.length ? done / todays.length : 0}
        valueLabel="Today's plan done"
        valueText={todays.length ? `${done} of ${todays.length} done` : 'Nothing planned yet'}
      >
        <p className="m-0">Ten-minute minimum day: today's reviews, one practice, one project step.</p>
      </FreezeFrontHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <GlassCard aria-labelledby="now-next">
          <h2 id="now-next" className="card-title">
            Now / Next
          </h2>
          {current || next ? (
            <div className="grid gap-2">
              {current && (
                <p className="m-0">
                  <Chip tone="good">Now</Chip> <strong>{current.title}</strong> <span className="tnum text-ink-3">{whenText(current)}</span>
                </p>
              )}
              {next && (
                <p className="m-0">
                  <Chip tone="ice">Next</Chip> <strong>{next.title}</strong> <span className="tnum text-ink-3">{whenText(next)}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Mascot mood={todays.length && done === todays.length ? 'happy' : 'sleepy'} size={56} />
              <p className="m-0">{todays.length && done === todays.length ? 'Everything for today is done.' : 'No timed plans left today.'}</p>
            </div>
          )}
        </GlassCard>

        <GlassCard aria-labelledby="due-reviews">
          <h2 id="due-reviews" className="card-title">
            Due reviews · English
          </h2>
          {!english.notes.length ? (
            <p className="m-0">
              No words yet. <Link to="/english/packs">Add a seed pack</Link> to start.
            </p>
          ) : englishLeft ? (
            <Link to="/english/review" className="pill">
              Start · {englishLeft} due · ~{englishPlan.minutes} min
            </Link>
          ) : (
            <p className="m-0">All of today's cards are done.</p>
          )}
        </GlassCard>

        <GlassCard aria-labelledby="deadlines">
          <h2 id="deadlines" className="card-title">
            Next deadlines
          </h2>
          {deadlines.length ? (
            <ul className="entry-list">
              {deadlines.map((e) => (
                <EntryRow key={e.id} entry={e} withDate />
              ))}
            </ul>
          ) : (
            <p className="m-0">No deadlines yet. Type “Conrad report deadline 12 Nov !!” in Quick Add.</p>
          )}
        </GlassCard>

        <GlassCard className="sm:col-span-2" aria-labelledby="plan">
          <h2 id="plan" className="card-title">
            Today's plan
          </h2>
          {todays.length ? (
            <ul className="entry-list">
              {todays.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          ) : (
            <p className="m-0">Nothing planned for today.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <PillButton variant="secondary" onClick={() => openQuickAdd()}>
              Add a plan
            </PillButton>
            <Link to="/planner" className="pill pill--secondary">
              Open Planner
            </Link>
          </div>
        </GlassCard>

        {!sync.email && (
          <GlassCard className="sm:col-span-2" aria-labelledby="sync-h">
            <h2 id="sync-h" className="card-title">
              Sync and reminders
            </h2>
            <p className="m-0">Plans are saved on this device. Sign in to see them on your phone and laptop and to get reminders.</p>
            <Link to="/settings" className="pill mt-3">
              Sign in
            </Link>
          </GlassCard>
        )}

        <GlassCard className="sm:col-span-2" aria-labelledby="coming">
          <h2 id="coming" className="card-title">
            Coming to Today
          </h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {COMING.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3">
                <span>{c.name}</span>
                <span className="chip">Phase {c.phase}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <p className="mt-6 flex flex-wrap gap-2">
        <Link to="/settings" className="pill pill--secondary">
          Settings
        </Link>
        <Link to="/design" className="pill pill--secondary">
          Design system and theme
        </Link>
      </p>
    </>
  );
}
