import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { GlassCard, PillButton } from '../../../core/design/components';
import { refreshFeed, saveProfile, uploadFeed, useLastFeed, useProfile } from '../data/store';
import './radar.css';

/*
 * Radar profile and feed: the eligibility profile (birth date, grade, results-by date — all
 * [TO CONFIRM] by the user, so the app asks here), the daily feed's status, and the fallback of
 * choosing a feed file by hand.
 */

const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });
const GRADES = [8, 9, 10, 11, 12];

export function RadarSettingsPage() {
  const profile = useProfile();
  const last = useLastFeed();
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/radar">Radar</Link> · Profile & feed
        </p>
        <h1 className="ff-title">Profile & feed</h1>
      </header>
      <div className="grid gap-3">
        <GlassCard className="grid gap-4" aria-labelledby="prof-h">
          <h2 id="prof-h" className="card-title m-0">
            Eligibility profile
          </h2>
          <p className="m-0 text-sm">Used only on this account to check age and grade rules (“Eligible / Check / Not eligible”) and for the fit score. Without it, rules show “Check”.</p>
          <label className="field">
            <span className="field-label">Date of birth</span>
            <input className="input" type="date" value={profile.birthDate ?? ''} onChange={(e) => void saveProfile({ ...profile, birthDate: e.target.value || undefined })} />
          </label>
          <div className="field">
            <span className="field-label">Grade now (US equivalent)</span>
            <div className="seg" role="radiogroup" aria-label="Grade now (US equivalent)">
              {GRADES.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={profile.usGrade === g} className="seg-btn" onClick={() => void saveProfile({ ...profile, usGrade: profile.usGrade === g ? undefined : g })}>
                  {g}
                </button>
              ))}
            </div>
            <span className="text-sm">Programs count US grades (9–12). If unsure which one yours equals, ask the school counsellor.</span>
          </div>
          <label className="field">
            <span className="field-label">I need results by (for the fit score)</span>
            <input className="input" type="date" value={profile.resultsBy ?? ''} onChange={(e) => void saveProfile({ ...profile, resultsBy: e.target.value || undefined })} />
          </label>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="feed-h">
          <h2 id="feed-h" className="card-title m-0">
            Daily feed
          </h2>
          <p className="m-0">
            Your Claude scheduled task checks the list every morning (06:00 Almaty) and commits <code>public/data/opportunities.json</code>. This site reads it when you open it.
          </p>
          <p className="m-0 tnum">
            Last checked: {last.generatedAt ? WHEN.format(new Date(last.generatedAt)) : 'never'}
            {last.fetchedAt && ` · read ${WHEN.format(new Date(last.fetchedAt))}`}
          </p>
          {last.error && <p className="notice notice--warm m-0">Last attempt failed: {last.error}. Radar keeps working from saved data.</p>}
          <div className="flex flex-wrap gap-2">
            <PillButton
              variant="secondary"
              onClick={async () => {
                await refreshFeed(true);
                setMsg('Checked the feed.');
              }}
            >
              Check now
            </PillButton>
            <PillButton variant="secondary" onClick={() => file.current?.click()}>
              Choose a feed file
            </PillButton>
            <input
              ref={file}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const n = await uploadFeed(await f.text());
                  setMsg(`Feed read: ${n} new change card${n === 1 ? '' : 's'}.`);
                } catch (err) {
                  setMsg(`That file was not used: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
            />
          </div>
          {msg && (
            <p className="notice m-0" role="status">
              {msg}
            </p>
          )}
        </GlassCard>
      </div>
    </>
  );
}
