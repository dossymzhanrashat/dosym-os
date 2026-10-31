import type { AssetKind } from '../model/types';

/*
 * Media helpers (SPEC Module 2 › 1): the kind of a pasted link, and the Conrad video checks —
 * the Innovation Video must be an MP4 of 3–5 minutes and under 800 MB.
 */

export function kindFromUrl(url: string): AssetKind {
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, '');
    path = u.pathname.toLowerCase();
  } catch {
    return 'link';
  }
  if (/(^|\.)canva\.com$|canva\.link$/.test(host)) return 'canva';
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host) || /\.(mp4|mov|m4v)$/.test(path)) return 'video';
  if (/\.(csv|xlsx?)$/.test(path)) return 'data';
  if (/\.(jpe?g|png|webp|heic)$/.test(path)) return 'photoSet';
  if (host === 'docs.google.com' || host === 'drive.google.com' || /\.(pdf|docx?|pptx?|md)$/.test(path)) return 'document';
  return 'link';
}

export const VIDEO_MIN_S = 180;
export const VIDEO_MAX_S = 300;
export const VIDEO_MAX_BYTES = 800 * 1024 * 1024;

export function videoWarnings(durationSec?: number, byteSize?: number): string[] {
  const out: string[] = [];
  if (durationSec !== undefined && (durationSec < VIDEO_MIN_S || durationSec > VIDEO_MAX_S)) out.push(`${fmtDuration(durationSec)} long: the Conrad Innovation Video must be 3–5 min.`);
  if (byteSize !== undefined && byteSize > VIDEO_MAX_BYTES) out.push(`${Math.round(byteSize / 1024 / 1024)} MB: the Conrad upload must be under 800 MB.`);
  return out;
}

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** "2:20" or "140" → seconds. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** YouTube embed link starting at a chapter, or undefined for other hosts. */
export function youtubeEmbed(url: string, start = 0): string | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const id = host === 'youtu.be' ? u.pathname.slice(1) : host.endsWith('youtube.com') ? (u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1]) : undefined;
    return id ? `https://www.youtube-nocookie.com/embed/${id}?start=${Math.floor(start)}&autoplay=${start ? 1 : 0}` : undefined;
  } catch {
    return undefined;
  }
}
