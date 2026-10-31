import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { Chip, GlassCard } from '../../core/design/components';
import { FreezeFrontBar, FreezeFrontHeader, IceWallGrid, SaltDotsLoader, type IceBrick } from '../../core/design/FreezeFront';
import { Mascot } from '../../core/design/Mascot';
import { almatyParts } from '../../core/planner/time';
import { inboxOrder } from './data/capture';
import { MIN_DAY_SECONDS, todayPlan, useEnglishData, useEnglishSettings } from './data/store';
import { ensureUseItCards, waitingAnswers } from './data/useIt';
import { useCandidates, useUseItAnswers } from './ui/captureHooks';
import { nextMock, phaseFor, phaseWeek, WEEKLY_PATTERN } from './srs/phase';
import { wordState } from './srs/status';
import { studyDay } from './srs/studyDay';
import './ui/english.css';

/*
 * English Home (SPEC § 3.1): Freeze Front header filling as today's session completes (salt dots
 * = weak words), the Start pill with due count and minutes, the phase strip, today's skill block
 * and the Ice Wall (flat grid; the 3D wall comes in Phase 7).
 */

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' });
const keyDate = (k: string) => new Date(`${k}T12:00:00+05:00`);

export function EnglishPage() {
  const data = useEnglishData();
  const settings = useEnglishSettings();
  const now = useMemo(() => new Date(), [data]);
  const plan = useMemo(() => todayPlan(data, settings, now), [data, settings, now]);
  const candidates = useCandidates();
  const inbox = useMemo(() => inboxOrder(candidates).length, [candidates]);
  const waiting = waitingAnswers(useUseItAnswers()).length;

  // Words that already hold for 7+ days get their Use-it card (new ones are added after each grade).
  useEffect(() => {
    if (data.loaded) void ensureUseItCards();
  }, [data.loaded]);
  const day = studyDay(now);
  const phase = phaseFor(day);
  const week = phaseWeek(phase, day);
  const mock = nextMock(day);

  const states = useMemo(() => data.notes.map((n) => ({ note: n, state: wordState(n, data.cardsByNote.get(n.id) ?? [], now) })), [data, now]);
  const count = (s: string) => states.filter((x) => x.state === s).length;
  const salt = count('salt');
  const bricks: IceBrick[] = states
    .filter((x) => x.state === 'frozen' || x.state === 'thawing' || x.state === 'salt')
    .map((x) => ({ id: x.note.id, label: x.note.headword, state: x.state === 'frozen' ? 'frozen' : x.state === 'thawing' ? 'thawing' : 'salt' }));

  if (!data.loaded) return <SaltDotsLoader label="Opening English" />;

  const left = plan.queue.order.length;
  const doneToday = plan.stats.reviewsDone + plan.stats.newIntroduced;
  const progress = doneToday + left ? doneToday / (doneToday + left) : doneToday ? 1 : 0;

  return (
    <>
      <FreezeFrontHeader
        title="English"
        gloss="Ағылшын"
        eyebrow={`Phase ${phase.index} · ${phase.name} · week ${week.week} of ${week.of}${mock ? ` · next mock ${shortDate.format(keyDate(mock.date))}` : ''}`}
        value={progress}
        valueLabel="Today's session"
        valueText={`${doneToday} done, ${left} left`}
        salt={salt}
      >
        <p className="m-0">IELTS 8.0 by June. Fifteen minutes of words a day; ten is the floor.</p>
      </FreezeFrontHeader>

      <div className="grid gap-3">
        {plan.throttled !== 'none' && (
          <p className="notice notice--warm m-0" role="status">
            {plan.throttled === 'stop'
              ? `Tomorrow already has ${plan.tomorrow} reviews, so no new words today. Reviews keep the ice solid.`
              : `Tomorrow has ${plan.tomorrow} reviews, so today's new words are halved to ${plan.cap}.`}
          </p>
        )}

        {(inbox > 0 || waiting > 0) && (
          <div className="flex flex-wrap gap-2">
            {inbox > 0 && (
              <Link to="/english/inbox" className="pill pill--secondary">
                {inbox} {inbox === 1 ? 'word' : 'words'} to triage
              </Link>
            )}
            {waiting > 0 && (
              <Link to="/english/use-it" className="pill pill--secondary">
                {waiting} Use-it {waiting === 1 ? 'sentence' : 'sentences'} for Claude
              </Link>
            )}
          </div>
        )}

        {data.notes.length === 0 ? (
          <GlassCard className="grid gap-4">
            <div className="flex items-center gap-4">
              <Mascot mood="sleepy" size={64} />
              <p className="m-0">
                <strong>Nothing frozen yet.</strong> Add your first words and the wall starts to grow.
              </p>
            </div>
            <div className="en-links">
              <Link to="/english/packs" className="pill">
                Add a seed pack
              </Link>
              <Link to="/english/add" className="pill pill--secondary">
                Add a word
              </Link>
              <Link to="/english/import" className="pill pill--secondary">
                Import Claude chats
              </Link>
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="grid gap-3">
            {left > 0 ? (
              <Link to="/english/review" className="pill text-lg">
                Start today · {left} due · ~{plan.minutes} min
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <Mascot mood="happy" size={48} />
                <p className="m-0">All of today's cards are done.</p>
              </div>
            )}
            <div className="grid gap-1">
              <FreezeFrontBar
                value={plan.stats.activeSeconds / MIN_DAY_SECONDS}
                label="Minimum day"
                valueText={`${Math.floor(plan.stats.activeSeconds / 60)} of 10 minutes`}
              />
              <p className="m-0 text-sm">
                Minimum day: {Math.min(10, Math.floor(plan.stats.activeSeconds / 60))} of 10 min · {plan.queue.reviews} reviews, {plan.queue.news} new (cap {plan.cap})
              </p>
            </div>
          </GlassCard>
        )}

        <GlassCard size="md">
          <p className="m-0">
            Today's skill block: <strong>{WEEKLY_PATTERN[almatyParts(now).weekday]}</strong>{' '}
            <span className="text-sm">· practice timers and band estimates come with the Practice log</span>
          </p>
        </GlassCard>

        {data.notes.length > 0 && (
          <GlassCard aria-labelledby="wall-h" className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="wall-h" className="card-title m-0">
                Ice wall
              </h2>
              <div className="flex flex-wrap gap-2">
                <Chip tone="good">{count('frozen') + count('thawing')} frozen</Chip>
                <Chip tone="ice">{count('learning')} learning</Chip>
                <Chip>{count('new')} new</Chip>
                <Chip tone="violet">{salt} salt</Chip>
              </div>
            </div>
            <IceWallGrid items={bricks.slice(0, 60)} label="Ice wall" emptyText="Nothing frozen yet. Words freeze when every card holds for 30+ days." />
          </GlassCard>
        )}

        <nav className="en-links" aria-label="English pages">
          <Link to="/english/words" className="pill pill--secondary">
            Words ({data.notes.length})
          </Link>
          <Link to="/english/inbox" className="pill pill--secondary">
            Inbox{inbox ? ` (${inbox})` : ''}
          </Link>
          <Link to="/english/import" className="pill pill--secondary">
            Import
          </Link>
          <Link to="/english/add" className="pill pill--secondary">
            Add a word
          </Link>
          <Link to="/english/use-it" className="pill pill--secondary">
            Use it
          </Link>
          <Link to="/english/packs" className="pill pill--secondary">
            Seed packs
          </Link>
          <Link to="/english/stats" className="pill pill--secondary">
            Stats
          </Link>
          <Link to="/english/settings" className="pill pill--secondary">
            Settings
          </Link>
        </nav>
      </div>
    </>
  );
}
