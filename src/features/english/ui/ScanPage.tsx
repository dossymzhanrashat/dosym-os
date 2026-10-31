import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { GlassCard, PillButton } from '../../../core/design/components';
import { FreezeFrontBar } from '../../../core/design/FreezeFront';
import { CaptureText } from './CaptureText';
import './english.css';

/*
 * Photo scan (SPEC § 6.3 with the WEB EDITION swap: Tesseract.js instead of VisionKit).
 * Take or pick a photo of a page; the text is read in this browser (the image never leaves the
 * device; only the reading model is downloaded the first time), then tap words as on the share page.
 */

type Lang = 'eng' | 'rus' | 'kaz';
const LANGS: { id: Lang; label: string }[] = [
  { id: 'eng', label: 'English' },
  { id: 'rus', label: 'Russian' },
  { id: 'kaz', label: 'Kazakh' },
];

export function ScanPage() {
  const [langs, setLangs] = useState<Lang[]>(['eng']);
  const [image, setImage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ status: string; value: number } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (image && URL.revokeObjectURL(image)), [image]);

  const scan = async (file?: File) => {
    if (!file) return;
    setError('');
    setText(null);
    setImage(URL.createObjectURL(file));
    setProgress({ status: 'Starting…', value: 0 });
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(langs, 1, {
        logger: (m: { status: string; progress: number }) => setProgress({ status: m.status, value: m.progress }),
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setText(data.text);
    } catch (e) {
      setError(`Could not read the photo: ${e instanceof Error ? e.message : String(e)}. The first scan needs internet to download the reading model.`);
    }
    setProgress(null);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    void scan(e.target.files?.[0]);
    e.target.value = '';
  };

  return (
    <>
      <header className="ff-header">
        <p className="eyebrow">
          <Link to="/english">English</Link> · <Link to="/english/import">Import</Link> · Photo scan
        </p>
        <h1 className="ff-title">Photo scan</h1>
        <p className="m-0">Photograph a page of a book or a worksheet, then tap the words to keep.</p>
      </header>

      <div className="grid gap-3">
        <GlassCard className="grid gap-3">
          <div className="field">
            <span className="field-label">Languages on the page</span>
            <div className="seg" role="group" aria-label="Languages on the page">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="seg-btn"
                  aria-pressed={langs.includes(l.id)}
                  disabled={l.id === 'eng'}
                  onClick={() => setLangs((ls) => (ls.includes(l.id) ? ls.filter((x) => x !== l.id) : [...ls, l.id]))}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <span className="text-sm">Add Russian or Kazakh only for mixed pages: each adds a download and makes reading slower. Only English sentences are offered as words.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <PillButton disabled={!!progress} onClick={() => camera.current?.click()}>
              Take a photo
            </PillButton>
            <PillButton variant="secondary" disabled={!!progress} onClick={() => library.current?.click()}>
              Choose a photo
            </PillButton>
          </div>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <input ref={library} type="file" accept="image/*" hidden onChange={onFile} />
          {progress && <FreezeFrontBar value={progress.value} label="Reading the photo" valueText={`${progress.status} ${Math.round(progress.value * 100)}%`} />}
          {progress && <p className="m-0 text-sm">{progress.status}…</p>}
          {error && (
            <p className="notice notice--danger m-0" role="alert">
              {error}
            </p>
          )}
        </GlassCard>

        {image && <img src={image} alt="The photo being scanned" className="scan-preview" />}
        {text !== null && <CaptureText text={text} kind="ocr" />}
      </div>
    </>
  );
}
