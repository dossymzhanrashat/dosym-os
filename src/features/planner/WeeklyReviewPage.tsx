import { useMemo, useState } from 'react';
import { GlassCard, PillButton, StatTile } from '../../core/design/components';
import { FreezeFrontHeader } from '../../core/design/FreezeFront';
import { Mascot } from '../../core/design/Mascot';
import { anchorOf, entriesInRange } from '../../core/planner/entries';
import { pushToTomorrow, saveSetting, usePlannerItems, useSetting } from '../../core/planner/store';
import { addDays, dayKey, startOfWeek } from '../../core/planner/time';
import { EntryRow } from './EntryRow';
import './planner.css';

/*
 * Weekly review (Sunday 19:00): done vs slipped this week, move the unfinished ones into next
 * week in one gesture (same weekday, same time), and set three focus goals for next week.
 */

const shortDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function FocusGoals({ weekKey }: { weekKey: string }) {
  const saved = useSetting<string[]>(`focus:${weekKey}`, ['', '', '']);
  const [draft, setDraft] = useState<string[] | null>(null);
  const goals = draft ?? saved;
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void saveSetting(`focus:${weekKey}`, goals.map((g) => g.trim()));
        setDraft(null);
      }}
    >
      {[0, 1, 2].map((i) => (
        <label key={i} className="field">
          <span className="field-label">Focus {i + 1}</span>
          <input className="input" value={goals[i] ?? ''} onChange={(e) => setDraft(goals.map((g, j) => (j === i ? e.target.value : g)))} />
        </label>
      ))}
      <div>
        <PillButton type="submit" disabled={draft === null}>
          Save goals
        </PillButton>
      </div>
    </form>
  );
}

export function WeeklyReviewPage() {
  const items = usePlannerItems();
  const monday = startOfWeek(new Date());
  const nextMonday = addDays(monday, 7);
  const now = new Date();

  const week = useMemo(() => entriesInRange(items, monday, nextMonday), [items, monday.getTime()]);
  const done = week.filter((e) => e.done);
  const slipped = week.filter((e) => !e.done && new Date(anchorOf(e)!) < now);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<number | null>(null);
  const toMove = slipped.filter((e) => !skip.has(e.id));
  const thisWeekGoals = useSetting<string[]>(`focus:${dayKey(monday)}`, []);

  const moveAll = async () => {
    for (const e of toMove) {
      // Same weekday next week; anything slipped from before today lands at least tomorrow.
      await pushToTomorrow(e, 7);
    }
    setMoved(toMove.length);
    setSkip(new Set());
  };

  const share = done.length + slipped.length ? done.length / (done.length + slipped.length) : 0;

  return (
    <>
      <FreezeFrontHeader
        title="Weekly review"
        eyebrow={`Week of ${shortDay.format(monday)} – ${shortDay.format(addDays(monday, 6))}`}
        value={share}
        valueLabel="Done this week"
        valueText={`${done.length} done, ${slipped.length} slipped`}
        salt={slipped.length}
      >
        <p className="m-0">Ice on top is what you finished. Salt in the brine is what slipped.</p>
      </FreezeFrontHeader>

      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <StatTile value={done.length} label="Done this week" />
          <StatTile value={slipped.length} label="Slipped" />
        </div>

        <GlassCard aria-labelledby="slipped-h" className="grid gap-3">
          <h2 id="slipped-h" className="card-title m-0">
            Slipped
          </h2>
          {slipped.length === 0 ? (
            <div className="flex items-center gap-3">
              <Mascot mood="happy" size={48} bounce={moved !== null} />
              <p className="m-0">{moved ? `Moved ${moved} to next week.` : 'Nothing slipped. Clean ice this week.'}</p>
            </div>
          ) : (
            <>
              <p className="m-0 text-sm">Untick anything you want to leave where it is.</p>
              <ul className="entry-list">
                {slipped.map((e) => (
                  <li key={e.id} className={`entry-row mod-${e.source}`}>
                    <input
                      type="checkbox"
                      className="check"
                      checked={!skip.has(e.id)}
                      aria-label={`Move ${e.title}`}
                      onChange={(ev) => {
                        const next = new Set(skip);
                        if (ev.target.checked) next.delete(e.id);
                        else next.add(e.id);
                        setSkip(next);
                      }}
                    />
                    <span className="flex-1">
                      {e.title}
                      <span className="entry-meta">{shortDay.format(new Date(anchorOf(e)!))}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <PillButton onClick={() => void moveAll()} disabled={toMove.length === 0}>
                  Move {toMove.length} to next week
                </PillButton>
              </div>
            </>
          )}
        </GlassCard>

        {done.length > 0 && (
          <GlassCard size="md" aria-labelledby="done-h">
            <h2 id="done-h" className="card-title">
              Done
            </h2>
            <ul className="entry-list">
              {done.map((e) => (
                <EntryRow key={e.id} entry={e} withDate />
              ))}
            </ul>
          </GlassCard>
        )}

        {thisWeekGoals.some(Boolean) && (
          <GlassCard size="md" aria-labelledby="goals-now">
            <h2 id="goals-now" className="card-title">
              This week's focus
            </h2>
            <ol className="m-0 pl-5">
              {thisWeekGoals.filter(Boolean).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ol>
          </GlassCard>
        )}

        <GlassCard aria-labelledby="goals-next">
          <h2 id="goals-next" className="card-title">
            Three focus goals for next week
          </h2>
          <FocusGoals weekKey={dayKey(nextMonday)} />
        </GlassCard>
      </div>
    </>
  );
}
