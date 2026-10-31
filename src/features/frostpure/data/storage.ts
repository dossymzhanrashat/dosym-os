import { useEffect, useState } from 'react';
import { sb } from '../../../core/db/supabase';
import type { Photo } from '../model/types';

/*
 * Photos live in the private Supabase Storage bucket "frostpure-media", under a folder named after
 * the user's id (Row Level Security lets each user reach only their own folder). Photos are shrunk
 * in the browser first (longest side 1600 px, JPEG) to respect the free 1 GB, with a 400 px thumbnail.
 * Pictures are shown through short-lived signed links.
 */

const BUCKET = 'frostpure-media';

async function shrink(file: Blob, max: number, quality: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this photo.'))), 'image/jpeg', quality));
}

export async function uploadPhoto(assetId: string, file: File, caption = ''): Promise<Photo> {
  const { data } = await (await sb()).auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sign in (Settings) to upload photos — they are stored in your private Supabase space.');
  const id = crypto.randomUUID();
  const [full, thumb] = await Promise.all([shrink(file, 1600, 0.82), shrink(file, 400, 0.75)]);
  const path = `${uid}/${assetId}/${id}.jpg`;
  const thumbPath = `${uid}/${assetId}/${id}_t.jpg`;
  for (const [p, blob] of [
    [path, full],
    [thumbPath, thumb],
  ] as const) {
    const { error } = await (await sb()).storage.from(BUCKET).upload(p, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }
  return { id, path, thumbPath, caption, byteSize: full.size, createdAt: new Date().toISOString() };
}

export async function deletePhotoFiles(p: Photo): Promise<void> {
  await (await sb()).storage.from(BUCKET).remove([p.path, p.thumbPath]);
}

const cache = new Map<string, { url: string; until: number }>();

/** Signed links (1 h) for storage paths; cached for 50 min. */
export function useSignedUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    let alive = true;
    const now = Date.now();
    const known: Record<string, string> = {};
    const missing: string[] = [];
    for (const p of paths) {
      const c = cache.get(p);
      if (c && c.until > now) known[p] = c.url;
      else missing.push(p);
    }
    setUrls(known);
    if (!missing.length) return;
    void sb()
      .then((c) => c.storage.from(BUCKET).createSignedUrls(missing, 3600))
      .then(({ data }) => {
        if (!alive || !data) return;
        const next = { ...known };
        for (const d of data) {
          if (!d.signedUrl || !d.path) continue;
          cache.set(d.path, { url: d.signedUrl, until: now + 50 * 60_000 });
          next[d.path] = d.signedUrl;
        }
        setUrls(next);
      });
    return () => {
      alive = false;
    };
  }, [key]);
  return urls;
}
