import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Chip, GlassCard, PillButton, StepBadge } from '../../core/design/components';
import { FreezeFrontHeader, SaltDotsLoader } from '../../core/design/FreezeFront';
import { db } from '../../core/db/db';
import { sb } from '../../core/db/supabase';
import { syncNow, useSyncStatus } from '../../core/db/sync';
import { useLive } from '../../core/db/useLive';
import {
  enablePush,
  guessDeviceLabel,
  isIOS,
  listDevices,
  permission,
  pushSupport,
  removeDevice,
  sendTestNotification,
  thisEndpoint,
  type PushDevice,
} from '../../core/planner/push';
import { FIXED_BLOCKS, saveSetting, useFixedBlocks } from '../../core/planner/store';
import type { FixedBlock } from '../../core/planner/types';

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- Account and sync ----------

function Account() {
  const status = useSyncStatus();
  const pending = useLive(() => db.outbox.count(), [], 0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const signIn = async () => {
    setBusy(true);
    setMessage('');
    const { error } = await (await sb()).auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    else setPassword('');
  };

  if (status.email) {
    return (
      <GlassCard aria-labelledby="account-h" className="grid gap-3">
        <h2 id="account-h" className="card-title m-0">
          Account and sync
        </h2>
        <p className="m-0">
          Signed in as <strong>{status.email}</strong>
        </p>
        <div className="flex flex-wrap items-center gap-2" role="status">
          {status.state === 'syncing' && <Chip tone="ice">Syncing…</Chip>}
          {status.state === 'idle' && <Chip tone="good">Synced{status.lastSyncAt ? ` at ${timeFmt.format(new Date(status.lastSyncAt))}` : ''}</Chip>}
          {status.state === 'offline' && <Chip tone="warm">Offline — changes wait on this device</Chip>}
          {status.state === 'error' && <Chip tone="danger">Sync problem</Chip>}
          {pending > 0 && <Chip>{pending} change{pending > 1 ? 's' : ''} to upload</Chip>}
        </div>
        {status.error && <p className="notice notice--danger m-0 text-sm">{status.error}</p>}
        <div className="flex flex-wrap gap-2">
          <PillButton variant="secondary" onClick={() => void syncNow()}>
            Sync now
          </PillButton>
          <PillButton variant="secondary" onClick={() => void sb().then((c) => c.auth.signOut({ scope: 'local' }))}>
            Sign out
          </PillButton>
        </div>
        <p className="m-0 text-sm">This device stays signed in until you tap Sign out (other devices are not affected). Signing out keeps the data on this device; it just stops syncing.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard aria-labelledby="account-h" className="grid gap-3">
      <h2 id="account-h" className="card-title m-0">
        Sign in to sync
      </h2>
      <p className="m-0">Your plans already work on this device. Sign in to keep phone and laptop the same and to get reminders.</p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
      >
        <label className="field">
          <span className="field-label">Email</span>
          <input className="input" type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div>
          <PillButton type="submit" disabled={busy || !email.includes('@') || !password}>
            Sign in
          </PillButton>
        </div>
      </form>
      {message && <p className="notice notice--danger m-0 text-sm">{message}</p>}
    </GlassCard>
  );
}

// ---------- Notifications ----------

function InstallGuide() {
  return (
    <div className="notice grid gap-2">
      <strong>On iPhone, reminders need the Home Screen app (iOS 16.4 or newer):</strong>
      <ol className="m-0 grid list-none gap-2 p-0">
        {[
          'Open this site in Safari.',
          'Tap the Share button (the square with an arrow up).',
          'Scroll down and tap “Add to Home Screen”, then “Add”.',
          'Open Dosym OS from the new Home Screen icon, sign in, and come back here.',
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <StepBadge n={i + 1} />
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Notifications({ signedIn }: { signedIn: boolean }) {
  const support = pushSupport();
  const [perm, setPerm] = useState(permission);
  const [label, setLabel] = useState(guessDeviceLabel);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      setDevices(await listDevices());
      setMine(await thisEndpoint());
    } catch (e) {
      setMessage(errorText(e));
    }
  }, [signedIn]);
  useEffect(() => void refresh(), [refresh]);

  const subscribed = !!mine && !!devices?.some((d) => d.endpoint === mine);

  const enable = () => {
    setBusy(true);
    setMessage('');
    // Called straight from the tap: iPhone only shows the permission prompt for a user gesture.
    enablePush(label)
      .then(() => setMessage('Notifications are on for this device.'))
      .catch((e) => setMessage(errorText(e)))
      .finally(() => {
        setPerm(permission());
        setBusy(false);
        void refresh();
      });
  };

  const test = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { sent } = await sendTestNotification();
      setMessage(sent ? `Sent to ${sent} device${sent > 1 ? 's' : ''}. It should appear in a few seconds.` : 'Nothing was sent — no device has notifications on yet.');
    } catch (e) {
      setMessage(errorText(e));
    }
    setBusy(false);
  };

  return (
    <GlassCard aria-labelledby="notif-h" className="grid gap-3">
      <h2 id="notif-h" className="card-title m-0">
        Notifications
      </h2>
      <p className="m-0 text-sm">
        Morning plan at 07:00 on school days (09:00 otherwise), important plans 30 min before, critical deadlines 7/3/1 days before. Quiet 22:30–06:30 except alarms; at most
        6 a day. Expect up to 5 minutes' delay.
      </p>
      {!signedIn ? (
        <p className="notice m-0">Sign in first: reminders are sent from your account.</p>
      ) : support === 'install-first' ? (
        <InstallGuide />
      ) : support === 'unsupported' ? (
        <p className="notice m-0">This browser cannot receive push notifications.</p>
      ) : (
        <>
          {perm === 'denied' && (
            <p className="notice notice--warm m-0">
              Notifications are blocked for this site. {isIOS() ? 'Allow them in Settings → Notifications → Dosym OS.' : 'Allow them in the browser’s site settings, then reload.'}
            </p>
          )}
          {!subscribed && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="field">
                <span className="field-label">Name for this device</span>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
              </label>
              <PillButton onClick={enable} disabled={busy || perm === 'denied'}>
                Turn on notifications
              </PillButton>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <PillButton variant="secondary" onClick={() => void test()} disabled={busy || !devices?.length}>
              Send test notification
            </PillButton>
          </div>
        </>
      )}
      {message && (
        <p className="m-0 text-sm" role="status">
          {message}
        </p>
      )}
      {signedIn && devices && devices.length > 0 && (
        <>
          <h3 className="m-0 text-base">Devices with notifications</h3>
          <ul className="entry-list">
            {devices.map((d) => (
              <li key={d.id} className="entry-row mod-user">
                <span className="flex-1">
                  {d.device_label || 'Device'} {d.endpoint === mine && <Chip tone="ice">This device</Chip>}
                </span>
                <button type="button" className="seg-btn" onClick={() => void removeDevice(d).then(refresh)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </GlassCard>
  );
}

// ---------- Fixed weekly blocks ----------

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function FixedBlocks() {
  const blocks = useFixedBlocks();
  const [draft, setDraft] = useState<FixedBlock>(() => ({ id: '', label: '', days: [1, 2, 3, 4, 5], start: '08:00', end: '14:30' }));
  const save = (next: FixedBlock[]) => void saveSetting(FIXED_BLOCKS, next);

  return (
    <GlassCard aria-labelledby="blocks-h" className="grid gap-3">
      <h2 id="blocks-h" className="card-title m-0">
        Fixed weekly blocks
      </h2>
      <p className="m-0 text-sm">School, training, sleep: shown shaded in the Planner, and nothing auto-schedules inside them. A block named “School” sets which days get the 07:00 morning plan.</p>
      {blocks.length > 0 && (
        <ul className="entry-list">
          {blocks.map((b) => (
            <li key={b.id} className="entry-row mod-user">
              <span className="flex-1">
                <strong>{b.label}</strong>
                <span className="entry-meta tnum">
                  {DAYS.filter((d) => b.days.includes(d))
                    .map((d) => DAY_NAMES[d])
                    .join(', ')}{' '}
                  · {b.start}–{b.end}
                </span>
              </span>
              <button type="button" className="seg-btn" onClick={() => save(blocks.filter((x) => x.id !== b.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.label.trim() || !draft.days.length) return;
          save([...blocks, { ...draft, id: crypto.randomUUID(), label: draft.label.trim() }]);
          setDraft({ ...draft, label: '' });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="School" />
          </label>
          <label className="field">
            <span className="field-label">From</span>
            <input className="input" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">To</span>
            <input className="input" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </label>
        </div>
        <div className="seg" role="group" aria-label="Days">
          {DAYS.map((d) => {
            const on = draft.days.includes(d);
            return (
              <button key={d} type="button" className="seg-btn" aria-pressed={on} onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })}>
                {DAY_NAMES[d]}
              </button>
            );
          })}
        </div>
        <div>
          <PillButton type="submit" variant="secondary" disabled={!draft.label.trim() || !draft.days.length}>
            Add block
          </PillButton>
        </div>
      </form>
    </GlassCard>
  );
}

// ---------- Data ----------

/** Every local table (all modules) plus the Pi readings from Supabase; photos stay in Storage (paths are listed). */
async function exportJson() {
  const tables: Record<string, unknown[]> = {};
  for (const t of db.tables) if (t.name !== 'outbox' && t.name !== 'meta') tables[t.name] = await t.toArray();
  let telemetry: unknown[] | string = 'not signed in';
  if ((await (await sb()).auth.getSession()).data.session) {
    const { data, error } = await (await sb()).from('telemetry').select('device_id, run_id, seq, ts, phase, payload, flags').order('ts').limit(20000);
    telemetry = error ? `not exported: ${error.message}` : (data ?? []);
  }
  const data = { app: 'dosym-os', version: 2, exportedAt: new Date().toISOString(), tables, telemetry };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `dosym-os-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const status = useSyncStatus();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void sb()
      .then((c) => c.auth.getSession())
      .then(() => setReady(true));
  }, []);

  return (
    <>
      <FreezeFrontHeader title="Settings" eyebrow="Today · Settings" value={status.email ? 1 : 0.2} valueLabel="Setup" valueText={status.email ? 'Signed in' : 'Not signed in'} />
      <div className="grid gap-3">
        {ready ? <Account /> : <SaltDotsLoader label="Checking sign-in" />}
        <Notifications signedIn={!!status.email} />
        <FixedBlocks />
        <GlassCard aria-labelledby="data-h" className="grid gap-3">
          <h2 id="data-h" className="card-title m-0">
            Your data
          </h2>
          <p className="m-0 text-sm">The free Supabase plan has no automatic backups. Download a copy now and then: every module’s data, plus the Pi’s readings when you are signed in (photos stay in your private storage; their paths are in the file).</p>
          <div className="flex flex-wrap gap-2">
            <PillButton variant="secondary" onClick={() => void exportJson()}>
              Export all data (JSON)
            </PillButton>
            <Link to="/design" className="pill pill--secondary">
              Theme and design
            </Link>
          </div>
        </GlassCard>
      </div>
    </>
  );
}
