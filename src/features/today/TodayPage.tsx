import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FreezeFrontHeader, SaltDotsLoader } from '../../core/design/FreezeFront';
import { firstOpenedAt } from '../../core/db/db';

const almatyDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Almaty',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', year: 'numeric' });

const COMING = [
  { name: 'Planner: Day, Week, Month and Quick Add', phase: 1 },
  { name: 'Phone reminders (Web Push)', phase: 1 },
  { name: 'Due English reviews', phase: 2 },
  { name: 'Daily Radar card and next deadlines', phase: 4 },
];

export function TodayPage() {
  const [dbSince, setDbSince] = useState<string | null>(null);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    firstOpenedAt()
      .then(setDbSince)
      .catch(() => setDbError(true));
  }, []);

  return (
    <>
      <FreezeFrontHeader title="Today" gloss="Бүгін" eyebrow={almatyDate.format(new Date())} value={0} valueLabel="Today's plan done" valueText="Nothing planned yet">
        <p className="m-0">Ten-minute minimum day: today's reviews, one practice, one project step.</p>
      </FreezeFrontHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card" aria-labelledby="now-next">
          <h2 id="now-next" className="card-title">
            Now / Next
          </h2>
          <p className="m-0 text-ink-2">The Planner arrives in Phase 1. Your day will show up here.</p>
        </section>

        <section className="card" aria-labelledby="this-device">
          <h2 id="this-device" className="card-title">
            This device
          </h2>
          {dbError ? (
            <p className="m-0">Local storage is blocked in this browser (private mode?). Data will not be kept.</p>
          ) : dbSince ? (
            <p className="m-0">
              Offline storage ready <span className="mono text-ink-2">· since {shortDate.format(new Date(dbSince))}</span>
            </p>
          ) : (
            <SaltDotsLoader label="Opening local storage" />
          )}
        </section>

        <section className="card sm:col-span-2" aria-labelledby="coming">
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
        </section>
      </div>

      <p className="mt-6">
        <Link to="/design" className="pill pill--ghost">
          Design system and theme
        </Link>
      </p>
    </>
  );
}
