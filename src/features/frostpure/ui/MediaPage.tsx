import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Chip, GlassCard, PillButton } from '../../../core/design/components';
import { SaltDotsLoader } from '../../../core/design/FreezeFront';
import { Sheet } from '../../../core/design/Sheet';
import { uploadPhoto, useSignedUrls } from '../data/storage';
import { addVersion, currentVersion, newAsset, saveAsset, useFrostData } from '../data/store';
import { kindFromUrl } from '../engine/media';
import type { AssetKind, MediaAsset } from '../model/types';
import { FrostNav } from './common';

/*
 * Media Library (SPEC Module 2 › 1): cards with kind, title, version badge and tags; filter by kind
 * and tag, search title / tags / notes, sort by recent, name or kind. Videos and Canva designs are
 * links; photos go to the private Supabase Storage bucket.
 */

export const KIND_LABEL: Record<AssetKind, string> = {
  video: 'Video',
  canva: 'Canva',
  brandBoard: 'Brand',
  document: 'Docs',
  photoSet: 'Photos',
  data: 'Data',
  link: 'Link',
};
const KINDS = Object.keys(KIND_LABEL) as AssetKind[];
type Sort = 'recent' | 'name' | 'kind';

function Thumb({ a }: { a: MediaAsset }) {
  const first = a.photos[0];
  const urls = useSignedUrls(first ? [first.thumbPath] : []);
  if (first && urls[first.thumbPath]) return <img src={urls[first.thumbPath]} alt="" className="fp-thumb" loading="lazy" />;
  return (
    <span className="fp-thumb fp-thumb--kind" aria-hidden="true">
      {KIND_LABEL[a.kind]}
    </span>
  );
}

function AddSheet({ open, onClose, photo }: { open: boolean; onClose: () => void; photo: boolean }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const kind = url ? kindFromUrl(url) : photo ? 'photoSet' : 'link';
  const tagList = () => tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

  const saveLink = async () => {
    const a = addVersion(newAsset(kind, title.trim() || url, { tags: tagList() }), { note: 'First version', url: url.trim() });
    await saveAsset(a);
    onClose();
    navigate(`/frostpure/media/${a.id}`);
  };

  const savePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg('Uploading…');
    try {
      const a = newAsset('photoSet', title.trim() || 'Photos', { tags: tagList() });
      const photos = [];
      for (const f of files) photos.push(await uploadPhoto(a.id, f));
      await saveAsset({ ...a, photos });
      onClose();
      navigate(`/frostpure/media/${a.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add to Media">
      <div className="grid gap-3">
        <label className="field">
          <span className="field-label">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Tags (comma-separated)</span>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="conrad, video, build" autoCapitalize="off" />
        </label>
        <label className="field">
          <span className="field-label">Paste a link (YouTube, Canva, Google Drive, artifact …)</span>
          <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} autoCapitalize="off" />
          {url && <span className="text-sm">Kind: {KIND_LABEL[kind]}</span>}
        </label>
        <div className="flex flex-wrap gap-2">
          <PillButton disabled={!url.trim() || busy} onClick={() => void saveLink()}>
            Save link
          </PillButton>
          <PillButton variant="secondary" disabled={busy} onClick={() => file.current?.click()}>
            Or add photos
          </PillButton>
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => void savePhotos(e.target.files)} />
          <PillButton
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const a = newAsset('data', title.trim() || 'Run data (CSV)', { tags: tagList() });
              await saveAsset(a);
              onClose();
              navigate(`/frostpure/media/${a.id}`);
            }}
          >
            Or run data (CSV)
          </PillButton>
        </div>
        <p className="m-0 text-sm">Videos stay as YouTube or Drive links (the free storage is 1 GB). Photos are shrunk to about 1600 px and stored privately.</p>
        {msg && (
          <p className="m-0 text-sm" role="status">
            {msg}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function MediaPage() {
  const data = useFrostData();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<AssetKind | 'all'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (params.get('add')) setAdding(true);
  }, [params]);

  const topTags = useMemo(() => {
    const n = new Map<string, number>();
    for (const a of data.assets) for (const t of a.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
  }, [data.assets]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.assets
      .filter((a) => (kind === 'all' || a.kind === kind) && (!tag || a.tags.includes(tag)) && (!term || `${a.title} ${a.tags.join(' ')} ${a.notes}`.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === 'name' ? a.title.localeCompare(b.title) : sort === 'kind' ? a.kind.localeCompare(b.kind) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [data.assets, kind, tag, q, sort]);

  if (!data.loaded) return <SaltDotsLoader label="Opening Media" />;

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/frostpure">FrostPure</Link> · Media
        </p>
        <h1 className="ff-title">Media</h1>
      </header>
      <FrostNav />
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <PillButton onClick={() => setAdding(true)}>Add</PillButton>
          <input className="input fp-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, tags, notes" aria-label="Search media" />
        </div>
        <div className="seg" role="radiogroup" aria-label="Kind">
          {(['all', ...KINDS] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className="seg-btn" onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {topTags.length > 0 && (
          <div className="seg" role="group" aria-label="Tags">
            {topTags.map((t) => (
              <button key={t} type="button" className="seg-btn" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
        <div className="seg" role="radiogroup" aria-label="Sort">
          {(['recent', 'name', 'kind'] as Sort[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sort === s} className="seg-btn" onClick={() => setSort(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <GlassCard size="md">
            <p className="m-0">Nothing here yet.</p>
          </GlassCard>
        ) : (
          <ul className="fp-media">
            {list.map((a) => {
              const v = currentVersion(a);
              return (
                <li key={a.id}>
                  <Link to={`/frostpure/media/${a.id}`} className="card card--md fp-media-card">
                    <Thumb a={a} />
                    <span className="fp-media-title">
                      {a.pinned && <span aria-label="Pinned">★ </span>}
                      {a.title}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Chip>{KIND_LABEL[a.kind]}</Chip>
                      {v && <Chip tone="ice">v{v.number}</Chip>}
                      {a.kind === 'photoSet' && <Chip>{a.photos.length} photos</Chip>}
                      {!v && a.kind !== 'photoSet' && a.kind !== 'brandBoard' && <Chip tone="warm">add link</Chip>}
                    </span>
                    {a.tags.length > 0 && <span className="text-sm">{a.tags.map((t) => `#${t}`).join(' ')}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <AddSheet
        open={adding}
        photo={params.get('add') === 'photo'}
        onClose={() => {
          setAdding(false);
          if (params.get('add')) setParams({}, { replace: true });
        }}
      />
    </>
  );
}
