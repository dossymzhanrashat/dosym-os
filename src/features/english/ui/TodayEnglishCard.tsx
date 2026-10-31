import { useMemo } from 'react';
import { Link } from 'react-router';
import { GlassCard } from '../../../core/design/components';
import { todayPlan, useEnglishData, useEnglishSettings } from '../data/store';

/** "Due reviews · English" on Today (loaded just after the page shell). */
export function TodayEnglishCard() {
  const english = useEnglishData();
  const settings = useEnglishSettings();
  const plan = useMemo(() => todayPlan(english, settings, new Date()), [english, settings]);
  const left = plan.queue.order.length;
  return (
    <GlassCard aria-labelledby="due-reviews" className="today-module">
      <h2 id="due-reviews" className="card-title">
        Due reviews · English
      </h2>
      {!english.loaded ? (
        <p className="m-0">…</p>
      ) : !english.notes.length ? (
        <p className="m-0">
          No words yet. <Link to="/english/packs">Add a seed pack</Link> to start.
        </p>
      ) : left ? (
        <Link to="/english/review" className="pill">
          Start · {left} due · ~{plan.minutes} min
        </Link>
      ) : (
        <p className="m-0">All of today's cards are done.</p>
      )}
    </GlassCard>
  );
}
