import { createElement, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { PillButton } from '../design/components';
import { exportForAr, type ArFiles } from './exportModel';

/*
 * "View in AR": the first tap exports the current scene to GLB + USDZ and loads <model-viewer>;
 * "Open in AR" (a fresh tap, which iPhone Safari requires) opens AR Quick Look — Scene Viewer on
 * Android. On a laptop the model-viewer preview stays on the page.
 */

type ModelViewerEl = HTMLElement & { canActivateAR?: boolean; activateAR?: () => Promise<void> };

export function ArButton({ getRoot, metres, title }: { getRoot: () => THREE.Object3D | null; metres: number; title: string }) {
  const [files, setFiles] = useState<ArFiles | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'ready' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const viewer = useRef<ModelViewerEl | null>(null);

  useEffect(() => () => files?.revoke(), [files]);

  const prepare = async () => {
    const root = getRoot();
    if (!root) return;
    setState('busy');
    setMsg('Preparing the 3D file…');
    try {
      await import('@google/model-viewer');
      files?.revoke();
      setFiles(await exportForAr(root, metres));
      setState('ready');
      setMsg('');
    } catch (e) {
      setState('error');
      setMsg(`Could not make the AR file: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <PillButton variant="secondary" disabled={state === 'busy'} onClick={() => void prepare()}>
          {state === 'busy' ? 'Preparing AR…' : state === 'ready' ? 'Refresh AR model' : 'View in AR'}
        </PillButton>
        {state === 'ready' && (
          <PillButton
            onClick={() => {
              // Straight from the tap, so iPhone Safari allows AR Quick Look to open.
              const v = viewer.current;
              if (v?.canActivateAR) void v.activateAR?.();
              else setMsg('AR opens on a phone (iPhone Safari or Android Chrome). Here you can turn the 3D preview below.');
            }}
          >
            Open in AR
          </PillButton>
        )}
      </div>
      {msg && (
        <p className="m-0 text-sm" role="status">
          {msg}
        </p>
      )}
      {files &&
        createElement('model-viewer', {
          ref: viewer,
          src: files.glb,
          'ios-src': files.usdz,
          ar: true,
          'ar-modes': 'quick-look scene-viewer webxr',
          'camera-controls': true,
          'touch-action': 'pan-y',
          alt: title,
          style: { width: '100%', height: '16rem', background: 'transparent' },
        })}
    </div>
  );
}
