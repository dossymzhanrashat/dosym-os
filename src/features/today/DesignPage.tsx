import { useState } from 'react';
import { FreezeFrontBar, FreezeFrontHeader, IceWallGrid, SaltDotsLoader, type IceBrick } from '../../core/design/FreezeFront';
import { savedTheme, setTheme, type ThemeChoice } from '../../core/design/theme';

const SWATCHES = [
  ['--night-steppe', '#0F1E2C', 'Text on light, dark ground'],
  ['--freeze-front', '#0B6A94', 'Primary, links, selected tab'],
  ['--glacier', '#4FA7CF', 'Lines, icons, chart strokes'],
  ['--clear-ice', '#DFF1F9', 'Light card ground, ice'],
  ['--brine-amber', '#D98A2B', 'Key numbers, due today, weak words'],
  ['--snow', '#F4F9FB', 'Page background (light)'],
  ['--ink-2', '#4A6272', 'Secondary text'],
  ['--rule', '#C3D8E2', 'Borders, dividers'],
  ['--deep-card', '#16283A', 'Cards in dark mode'],
] as const;

const SAMPLE_WALL: IceBrick[] = [
  { id: '1', label: 'amplify', state: 'frozen' },
  { id: '2', label: 'pose a threat to', state: 'frozen' },
  { id: '3', label: 'susceptible to', state: 'thawing' },
  { id: '4', label: 'mitigate', state: 'frozen' },
  { id: '5', label: 'accommodation', state: 'salt' },
  { id: '6', label: 'pitfall', state: 'salt' },
];

export function DesignPage() {
  const [theme, setThemeState] = useState<ThemeChoice>(savedTheme);
  const [picked, setPicked] = useState<string | null>(null);

  const choose = (t: ThemeChoice) => {
    setTheme(t);
    setThemeState(t);
  };

  return (
    <>
      <FreezeFrontHeader title="Design" eyebrow="FrostPure brand" value={0.62} valueLabel="Sample progress" salt={7}>
        <p className="m-0">Ice on top, brine below. Never flipped.</p>
      </FreezeFrontHeader>

      <div className="grid gap-3">
        <section className="card" aria-labelledby="theme">
          <h2 id="theme" className="card-title">
            Theme
          </h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {(['auto', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                className={theme === t ? 'pill' : 'pill pill--ghost'}
                onClick={() => choose(t)}
              >
                {t === 'auto' ? 'Match phone' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="type">
          <h2 id="type" className="card-title">
            Type
          </h2>
          <p className="display m-0 text-5xl">47 due</p>
          <p className="m-0 mt-2">IBM Plex Sans — body text. Қазақ тілі: Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі. Русский: Ёё Жж Щщ.</p>
          <p className="mono m-0 mt-2">IBM Plex Mono — 07:15 · R 0.93 · S 14.2 d</p>
          <p className="m-0 mt-2">
            Key number: <span className="display num-key text-3xl">7 days</span>
          </p>
        </section>

        <section className="card" aria-labelledby="colours">
          <h2 id="colours" className="card-title">
            Colours
          </h2>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {SWATCHES.map(([token, hex, use]) => (
              <li key={token} className="flex items-center gap-3">
                <span className="h-10 w-10 flex-none rounded-lg border border-rule" style={{ background: `var(${token})` }} />
                <span>
                  <span className="mono block text-sm">
                    {token} {hex}
                  </span>
                  <span className="block text-sm text-ink-2">{use}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card grid gap-3" aria-labelledby="bars">
          <h2 id="bars" className="card-title">
            FreezeFrontBar · SaltDotsLoader
          </h2>
          <FreezeFrontBar value={0.35} label="Thin bar sample" />
          <FreezeFrontBar value={0.8} salt={3} size="band" label="Band bar sample" />
          <p className="m-0 flex items-center gap-3">
            <SaltDotsLoader /> <span className="text-ink-2">Loading…</span>
          </p>
        </section>

        <section className="grid gap-2" aria-labelledby="wall">
          <h2 id="wall" className="card-title">
            IceWallGrid
          </h2>
          <IceWallGrid items={SAMPLE_WALL} label="Sample ice wall" onSelect={(id) => setPicked(SAMPLE_WALL.find((b) => b.id === id)?.label ?? null)} />
          <p className="m-0 text-sm text-ink-2" aria-live="polite">
            {picked ? `Tapped: ${picked}` : 'Tap a brick.'}
          </p>
        </section>

        <section className="card" aria-labelledby="controls">
          <h2 id="controls" className="card-title">
            Controls
          </h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="pill">
              Start today
            </button>
            <button type="button" className="pill pill--ghost">
              Later
            </button>
            <span className="chip">TO CONFIRM</span>
          </div>
        </section>
      </div>
    </>
  );
}
