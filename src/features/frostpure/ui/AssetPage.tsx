import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { deletePhotoFiles, uploadPhoto, useSignedUrls } from '../data/storage';
import { addVersion, currentVersion, deleteVersion, removeRow, saveAsset, useFrostData } from '../data/store';
import { fmtDuration, parseDuration, videoWarnings, youtubeEmbed } from '../engine/media';
import { computeResults } from '../engine/results';
import type { MediaAsset, Run } from '../model/types';
import { FrostNav } from './common';
import { KIND_LABEL } from './MediaPage';

/*
 * Asset detail (SPEC Module 2 › 1): changes by kind — video (YouTube player with tappable chapters
 * and the Conrad 3–5 min / 800 MB checks), Canva (open in the Canva app or browser), brand board
 * (live tokens), document, photo set (pager with captions), data (CSV of runs). Version history:
 * new version = max + 1, "Set as current", delete moves current to the newest remaining.
 */

const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Almaty' });

const SWATCHES: [string, string][] = [
  ['--bg-deep', '#050a16'],
  ['--ice', '#8ff1ff'],
  ['--sky', '#5fb8ff'],
  ['--periwinkle', '#7f88ff'],
  ['--violet', '#c27bff'],
  ['--warm', '#ffb36b'],
  ['--good', '#7dffb0'],
  ['--danger', '#ff7a9a'],
];

/** CSV of every run's inputs and results (the "Data" kind). */
export function runsCsv(runs: Run[]): string {
  const v = (x: { ok: boolean; value?: number }) => (x.ok && 'value' in x && x.value !== undefined ? x.value.toFixed(4) : '');
  const head = ['name', 'rig', 'status', 'started', 'feed_g_per_l', 'feed_l', 'ambient_c', 'target_frozen_pct', 'R', 'Y', 'CF', 'mass_balance_error', 'wh_per_l', 'freeze_rate_cm_h'];
  const rows = runs.map((r) => {
    const res = computeResults(r);
    return [r.name, r.rig, r.status, r.startedAt ?? '', r.feedSalinityGL, r.feedVolumeL, r.plannedAmbientC, r.targetFrozenPct, v(res.rejection), v(res.recovery), v(res.concentrationFactor), v(res.massBalanceError), v(res.whPerL), v(res.freezeRateCmH)];
  });
  return [head, ...rows].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function Photos({ a }: { a: MediaAsset }) {
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const urls = useSignedUrls(a.photos.map((p) => p.path));
  const p = a.photos[Math.min(i, a.photos.length - 1)];
  return (
    <div className="grid gap-3">
      {p ? (
        <>
          <figure className="fp-photo m-0">
            {urls[p.path] ? <img src={urls[p.path]} alt={p.caption || a.title} /> : <SaltDotsLoader label="Loading photo" />}
            <figcaption>
              <input
                className="input"
                defaultValue={p.caption}
                key={p.id}
                placeholder="Caption"
                aria-label="Caption"
                onBlur={(e) => e.target.value !== p.caption && void saveAsset({ ...a, photos: a.photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)) })}
              />
            </figcaption>
          </figure>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous photo">
              ←
            </PillButton>
            <span className="tnum">
              {i + 1} / {a.photos.length}
            </span>
            <PillButton variant="secondary" disabled={i >= a.photos.length - 1} onClick={() => setI(i + 1)} aria-label="Next photo">
              →
            </PillButton>
            <PillButton
              variant="secondary"
              onClick={async () => {
                await deletePhotoFiles(p);
                await saveAsset({ ...a, photos: a.photos.filter((x) => x.id !== p.id) });
                setI(Math.max(0, i - 1));
              }}
            >
              Delete photo
            </PillButton>
          </div>
        </>
      ) : (
        <p className="m-0">No photos yet.</p>
      )}
      <PillButton className="justify-self-start" onClick={() => file.current?.click()}>
        Add photos
      </PillButton>
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = e.target.files;
          if (!files?.length) return;
          setMsg('Uploading…');
          try {
            const added = [];
            for (const f of files) added.push(await uploadPhoto(a.id, f));
            await saveAsset({ ...a, photos: [...a.photos, ...added] });
            setMsg(`${added.length} added.`);
          } catch (err) {
            setMsg(err instanceof Error ? err.message : String(err));
          }
          e.target.value = '';
        }}
      />
      {msg && (
        <p className="m-0 text-sm" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

export function AssetPage() {
  const { id } = useParams();
  const data = useFrostData();
  const navigate = useNavigate();
  const [start, setStart] = useState(0);
  const [ver, setVer] = useState({ url: '', note: '', duration: '', sizeMB: '' });
  const [copied, setCopied] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const a = data.assets.find((x) => x.id === id);

  if (!data.loaded) return <SaltDotsLoader label="Opening" />;
  if (!a)
    return (
      <GlassCard>
        <p className="m-0">
          Not found. <Link to="/frostpure/media">Back to Media</Link>
        </p>
      </GlassCard>
    );

  const v = currentVersion(a);
  const embed = v?.url ? youtubeEmbed(v.url, start) : undefined;
  const warnings = a.kind === 'video' && v ? videoWarnings(v.durationSec, v.byteSize) : [];

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · <Link to="/frostpure/media">Media</Link> · {KIND_LABEL[a.kind]}
        </p>
        <h1 className="ff-title">{a.title}</h1>
        <div className="flex flex-wrap gap-2">
          {v && <Chip tone="ice">v{v.number}</Chip>}
          {a.tags.map((t) => (
            <Chip key={t}>#{t}</Chip>
          ))}
          {warnings.map((w) => (
            <Chip key={w} tone="warm">
              {w}
            </Chip>
          ))}
        </div>
      </header>
      <FrostNav />

      <div className="grid gap-3">
        {a.kind === 'video' && (
          <GlassCard className="grid gap-3">
            {embed ? (
              <div className="fp-video">
                <iframe src={embed} title={a.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              </div>
            ) : v?.url ? (
              <a className="pill justify-self-start" href={v.url} target="_blank" rel="noopener noreferrer">
                Open the video
              </a>
            ) : (
              <p className="m-0">Add the video’s link as a version below (YouTube, Vimeo or Google Drive).</p>
            )}
            {v && (v.durationSec !== undefined || v.byteSize !== undefined) && (
              <p className="m-0 text-sm">
                {v.durationSec !== undefined && `Duration ${fmtDuration(v.durationSec)}`}
                {v.byteSize !== undefined && ` · ${Math.round(v.byteSize / 1024 / 1024)} MB`}
              </p>
            )}
            {a.chapters.length > 0 && (
              <ol className="fp-chapters">
                {a.chapters.map((c) => (
                  <li key={c.title}>
                    <button
                      type="button"
                      className="pipe-move"
                      onClick={() => (embed ? setStart(c.start) : v?.url && window.open(v.url.includes('youtu') ? `${v.url}${v.url.includes('?') ? '&' : '?'}t=${c.start}` : v.url, '_blank', 'noopener'))}
                    >
                      <span className="tnum">{fmtDuration(c.start)}</span> {c.title}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </GlassCard>
        )}

        {a.kind === 'canva' && (
          <GlassCard className="grid gap-2">
            {v?.url ? (
              <a className="pill justify-self-start" href={v.url} target="_blank" rel="noopener noreferrer">
                Open in Canva
              </a>
            ) : (
              <p className="m-0">Paste the Canva link as a version below.</p>
            )}
            <p className="m-0 text-sm">On the iPhone the link opens the Canva app if it is installed, otherwise Safari.</p>
          </GlassCard>
        )}

        {a.kind === 'brandBoard' && (
          <GlassCard className="grid gap-3">
            <ul className="fp-swatches">
              {SWATCHES.map(([name, hex]) => (
                <li key={name}>
                  <button
                    type="button"
                    className="fp-swatch"
                    style={{ background: `var(${name})` }}
                    onClick={async () => {
                      await navigator.clipboard?.writeText(hex);
                      setCopied(hex);
                    }}
                    aria-label={`Copy ${name} ${hex}`}
                  />
                  <span className="text-sm">
                    {name} {hex}
                  </span>
                </li>
              ))}
            </ul>
            {copied && (
              <p className="m-0 text-sm" role="status">
                Copied {copied}.
              </p>
            )}
            <p className="m-0">
              <span className="wordmark">
                Frost<span className="gradient-text">Pure</span>
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/design" className="pill pill--secondary">
                Full design system
              </Link>
              {v?.url && (
                <a className="pill pill--secondary" href={v.url} target="_blank" rel="noopener noreferrer">
                  Open the Brand Identity canvas
                </a>
              )}
            </div>
          </GlassCard>
        )}

        {(a.kind === 'document' || a.kind === 'link') && (
          <GlassCard>
            {v?.url ? (
              <a className="pill" href={v.url} target="_blank" rel="noopener noreferrer">
                Open
              </a>
            ) : (
              <p className="m-0">Paste the link as a version below.</p>
            )}
          </GlassCard>
        )}

        {a.kind === 'photoSet' && (
          <GlassCard>
            <Photos a={a} />
          </GlassCard>
        )}

        {a.kind === 'data' && (
          <GlassCard className="grid gap-2">
            <p className="m-0">All runs with their inputs and results, as CSV.</p>
            <pre className="fp-code fp-csv">{runsCsv(data.runs).split('\n').slice(0, 8).join('\n')}</pre>
            <PillButton className="justify-self-start" onClick={() => download('frostpure-runs.csv', runsCsv(data.runs))}>
              Download CSV
            </PillButton>
          </GlassCard>
        )}

        {a.kind !== 'photoSet' && a.kind !== 'data' && (
          <GlassCard className="grid gap-3" aria-labelledby="ver-h">
            <h2 id="ver-h" className="card-title m-0">
              Versions
            </h2>
            {a.versions.length > 0 && (
              <ol className="fp-versions">
                {[...a.versions]
                  .sort((x, y) => y.number - x.number)
                  .map((x) => (
                    <li key={x.id}>
                      <strong>v{x.number}</strong> · {WHEN.format(new Date(x.createdAt))} · {x.note || 'no note'}
                      {x.id === v?.id ? (
                        <Chip tone="good">current</Chip>
                      ) : (
                        <button type="button" className="pipe-move" onClick={() => void saveAsset({ ...a, currentVersionId: x.id })}>
                          Set as current
                        </button>
                      )}
                      <button type="button" className="pipe-move" onClick={() => void saveAsset(deleteVersion(a, x.id))}>
                        Delete
                      </button>
                    </li>
                  ))}
              </ol>
            )}
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const mb = Number(ver.sizeMB);
                void saveAsset(
                  addVersion(a, {
                    url: ver.url.trim(),
                    note: ver.note.trim(),
                    durationSec: parseDuration(ver.duration),
                    byteSize: ver.sizeMB && mb > 0 ? Math.round(mb * 1024 * 1024) : undefined,
                  }),
                );
                setVer({ url: '', note: '', duration: '', sizeMB: '' });
              }}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="field">
                  <span className="field-label">Link</span>
                  <input className="input" type="url" required value={ver.url} onChange={(e) => setVer({ ...ver, url: e.target.value })} autoCapitalize="off" />
                </label>
                <label className="field">
                  <span className="field-label">What changed</span>
                  <input className="input" value={ver.note} onChange={(e) => setVer({ ...ver, note: e.target.value })} placeholder="colour fix after coach feedback" />
                </label>
                {a.kind === 'video' && (
                  <>
                    <label className="field">
                      <span className="field-label">Duration (m:ss)</span>
                      <input className="input" value={ver.duration} onChange={(e) => setVer({ ...ver, duration: e.target.value })} placeholder="4:10" />
                    </label>
                    <label className="field">
                      <span className="field-label">File size, MB</span>
                      <input className="input" type="number" min={0} value={ver.sizeMB} onChange={(e) => setVer({ ...ver, sizeMB: e.target.value })} />
                    </label>
                  </>
                )}
              </div>
              <PillButton type="submit" variant="secondary" className="justify-self-start" disabled={!ver.url.trim()}>
                Add version {Math.max(0, ...a.versions.map((x) => x.number)) + 1}
              </PillButton>
            </form>
          </GlassCard>
        )}

        <GlassCard className="grid gap-3">
          <label className="field">
            <span className="field-label">Tags (comma-separated)</span>
            <input
              className="input"
              defaultValue={a.tags.join(', ')}
              key={`tags-${a.updatedAt}`}
              autoCapitalize="off"
              onBlur={(e) => void saveAsset({ ...a, tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })}
            />
          </label>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea className="input" rows={3} defaultValue={a.notes} key={`notes-${a.updatedAt}`} onBlur={(e) => e.target.value !== a.notes && void saveAsset({ ...a, notes: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <PillButton variant="secondary" onClick={() => void saveAsset({ ...a, pinned: !a.pinned })}>
              {a.pinned ? 'Unpin' : 'Pin to top'}
            </PillButton>
            <PillButton
              variant="secondary"
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                for (const p of a.photos) await deletePhotoFiles(p);
                await removeRow(saveAsset, a);
                navigate('/frostpure/media');
              }}
            >
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </PillButton>
          </div>
        </GlassCard>
      </div>
    </>
  );
}
