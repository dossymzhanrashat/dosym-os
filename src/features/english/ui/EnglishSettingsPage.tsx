import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GlassCard, PillButton } from '../../../core/design/components';
import { saveEnglishSettings, useEnglishSettings } from '../data/store';
import type { CardType, EnglishSettings } from '../model/types';
import { phaseFor } from '../srs/phase';
import { studyDay } from '../srs/studyDay';
import { TYPE_LABEL } from './CardFace';
import { englishVoices, hasBritishVoice, speak, warmUpVoices } from './speech';
import './english.css';

/** English settings (SPEC § 3.10). Synced to every device. */

const TYPES: CardType[] = ['recognition', 'production', 'cloze', 'listening', 'spelling', 'collocation', 'synonymLadder'];

export function EnglishSettingsPage() {
  const saved = useEnglishSettings();
  const [s, setS] = useState<EnglishSettings>(saved);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [voices, setVoices] = useState(englishVoices);

  useEffect(() => {
    if (!dirty) setS(saved);
  }, [saved, dirty]);
  useEffect(() => warmUpVoices(() => setVoices(englishVoices())), []);

  const set = (patch: Partial<EnglishSettings>) => {
    setS({ ...s, ...patch });
    setDirty(true);
  };
  const phaseCap = phaseFor(studyDay(new Date())).newCardsPerDay;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · Settings
        </p>
        <h1 className="ff-title">English settings</h1>
      </header>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void saveEnglishSettings(s).then(() => {
            setDirty(false);
            setMessage('Saved.');
          });
        }}
      >
        <GlassCard className="grid gap-4" aria-labelledby="sched-h">
          <h2 id="sched-h" className="card-title m-0">
            Scheduling
          </h2>
          <div className="field">
            <span className="field-label">Scheduler</span>
            <div className="seg" role="radiogroup" aria-label="Scheduler">
              {(['fsrs5', 'ladder'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={s.scheduler === k} className="seg-btn" onClick={() => set({ scheduler: k })}>
                  {k === 'fsrs5' ? 'FSRS (recommended)' : 'Simple ladder 1 → 3 → 6 → 14 → 24 → 60 d'}
                </button>
              ))}
            </div>
            <span className="text-sm">Switching keeps every card's due date; only how the next interval is chosen changes.</span>
          </div>
          <label className="field">
            <span className="field-label">Target retention: {Math.round(s.retention * 100)}%</span>
            <input type="range" min={0.8} max={0.95} step={0.01} value={s.retention} onChange={(e) => set({ retention: Number(e.target.value) })} />
            <span className="text-sm">Higher means more reviews and fewer forgotten words. 90% is the usual balance.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">
              <span className="field-label">New cards per day</span>
              <input
                className="input"
                type="number"
                min={0}
                max={50}
                value={s.newPerDay ?? ''}
                placeholder={`Phase: ${phaseCap}`}
                onChange={(e) => set({ newPerDay: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="field">
              <span className="field-label">Max reviews per day</span>
              <input className="input" type="number" min={20} max={1000} value={s.maxReviewsPerDay} onChange={(e) => set({ maxReviewsPerDay: Math.max(1, Number(e.target.value) || 250) })} />
            </label>
            <label className="field">
              <span className="field-label">Max interval (days)</span>
              <input className="input" type="number" min={7} max={365} value={s.maxIntervalDays} onChange={(e) => set({ maxIntervalDays: Math.max(7, Number(e.target.value) || 180) })} />
            </label>
          </div>
          <p className="m-0 text-sm">Leave “New cards per day” empty to follow the plan: 15 now, 5 from March, 0 in May. The day starts at 04:00 Almaty.</p>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="types-h">
          <h2 id="types-h" className="card-title m-0">
            Card types
          </h2>
          <div className="seg" role="group" aria-label="Card types">
            {TYPES.map((t) => (
              <button key={t} type="button" className="seg-btn" aria-pressed={s.cardTypes[t] !== false} onClick={() => set({ cardTypes: { ...s.cardTypes, [t]: s.cardTypes[t] === false } })}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="m-0 text-sm">Switched-off types are skipped in reviews; their progress is kept. Use it, word family and palace cards come with the Claude Bridge.</p>
        </GlassCard>

        <GlassCard className="grid gap-3" aria-labelledby="voice-h">
          <h2 id="voice-h" className="card-title m-0">
            Voice
          </h2>
          {!hasBritishVoice() && (
            <p className="notice notice--warm m-0">
              No British English voice found on this device. On iPhone: Settings → Accessibility → Spoken Content → Voices → English → choose a UK voice (Enhanced is best).
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="field min-w-0 flex-1">
              <span className="field-label">English voice</span>
              <select className="input" value={s.voiceURI ?? ''} onChange={(e) => set({ voiceURI: e.target.value || undefined })}>
                <option value="">Best British voice (automatic)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
            <PillButton variant="secondary" onClick={() => speak('Susceptible to the opinions of their peers.', { voiceURI: s.voiceURI })}>
              Test
            </PillButton>
          </div>
        </GlassCard>

        <GlassCard className="grid gap-4" aria-labelledby="dates-h">
          <h2 id="dates-h" className="card-title m-0">
            Test date and reminders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">IELTS test date</span>
              <input className="input" type="date" value={s.testDate} onChange={(e) => e.target.value && set({ testDate: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Morning review reminder (only when cards are due)</span>
              <input className="input" type="time" value={s.morningReview} onChange={(e) => e.target.value && set({ morningReview: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">School starts (no English reminders Mon–Fri)</span>
              <input className="input" type="time" value={s.schoolQuiet.start} onChange={(e) => e.target.value && set({ schoolQuiet: { ...s.schoolQuiet, start: e.target.value } })} />
            </label>
            <label className="field">
              <span className="field-label">School ends</span>
              <input className="input" type="time" value={s.schoolQuiet.end} onChange={(e) => e.target.value && set({ schoolQuiet: { ...s.schoolQuiet, end: e.target.value } })} />
            </label>
          </div>
          <p className="m-0 text-sm">From 1 April the scheduler keeps every word fresh for 3 days before the test. Quiet hours 22:30–07:00 always apply.</p>
        </GlassCard>

        <div className="flex flex-wrap items-center gap-3">
          <PillButton type="submit" disabled={!dirty}>
            Save settings
          </PillButton>
          {message && !dirty && (
            <span role="status" className="text-sm">
              {message}
            </span>
          )}
        </div>
      </form>
    </>
  );
}
