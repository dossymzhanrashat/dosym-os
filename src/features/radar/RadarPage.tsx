import { useEffect, useState } from 'react';
import { SectionPlaceholder } from '../../app/SectionPlaceholder';
import { SaltDotsLoader } from '../../core/design/FreezeFront';

type FeedState = { status: 'loading' } | { status: 'ok'; checkedAt: string; items: number } | { status: 'error' };

const FEED_URL = `${import.meta.env.BASE_URL}data/opportunities.json`;
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', dateStyle: 'medium', timeStyle: 'short' });

export function RadarPage() {
  const [feed, setFeed] = useState<FeedState>({ status: 'loading' });

  useEffect(() => {
    fetch(FEED_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { checkedAt?: string; items?: unknown[] }) =>
        setFeed({ status: 'ok', checkedAt: j.checkedAt ?? '', items: j.items?.length ?? 0 }),
      )
      .catch(() => setFeed({ status: 'error' }));
  }, []);

  return (
    <SectionPlaceholder
      title="Radar"
      gloss="Радар"
      intro="Contests, programmes and scholarships with fresh deadlines from a daily check."
      pages={[
        { name: 'Feed', phase: 4 },
        { name: 'Changes', phase: 4 },
        { name: 'Pipeline', phase: 4 },
        { name: 'Detail', phase: 4 },
      ]}
    >
      <section className="card" aria-labelledby="feed-file">
        <h2 id="feed-file" className="card-title">
          Daily feed file
        </h2>
        {feed.status === 'loading' && <SaltDotsLoader label="Checking the feed" />}
        {feed.status === 'ok' && (
          <p className="m-0">
            Reachable · <span className="mono">{feed.items} changes</span>
            {feed.checkedAt && <span className="mono text-ink-2"> · checked {fmt.format(new Date(feed.checkedAt))}</span>}
          </p>
        )}
        {feed.status === 'error' && <p className="m-0">Feed not reachable right now. Radar will work from local data.</p>}
      </section>
    </SectionPlaceholder>
  );
}
