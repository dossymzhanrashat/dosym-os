import { useState, type ReactNode } from 'react';
import { FreezeFrontBar, FreezeFrontHeader, IceWallGrid, SaltDotsLoader, type IceBrick } from '../../core/design/FreezeFront';
import { Chip, DropletMeter, Eyebrow, GlassCard, GradientText, HeroWords, PillButton, StatTile, StepBadge, Wordmark } from '../../core/design/components';
import { Mascot, type MascotMood } from '../../core/design/Mascot';
import { savedTheme, setTheme, type ThemeChoice } from '../../core/design/theme';

const SWATCHES = [
  ['--ice', '#8FF1FF', 'Clean water, primary accent, focus'],
  ['--sky', '#5FB8FF', 'Links, lines, second series'],
  ['--periwinkle', '#7F88FF', 'Mid-gradient, selected tab'],
  ['--violet', '#C27BFF', 'Brine, highlights'],
  ['--warm', '#FFB36B', 'Warnings, deadlines within 7 days'],
  ['--good', '#7DFFB0', 'Done, safe to drink'],
  ['--danger', '#FF7A9A', 'Errors (sparingly)'],
  ['--bg-deep', '#050A16', 'Darkest base'],
  ['--pure-gradient', 'cyan → violet', 'Wordmark, primary button, progress'],
  ['--card', 'glass', 'Card fill with 1 px border'],
] as const;

const SAMPLE_WALL: IceBrick[] = [
  { id: '1', label: 'amplify', state: 'frozen' },
  { id: '2', label: 'pose a threat to', state: 'frozen' },
  { id: '3', label: 'susceptible to', state: 'thawing' },
  { id: '4', label: 'mitigate', state: 'frozen' },
  { id: '5', label: 'accommodation', state: 'salt' },
  { id: '6', label: 'pitfall', state: 'salt' },
];

// Thin 24×24 line icons for the icon-button samples
const line = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const ICON = {
  drop: line(<path d="M12 3.5s-5.5 6-5.5 10a5.5 5.5 0 0 0 11 0c0-4-5.5-10-5.5-10z" />),
  snow: line(<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />),
  plus: line(<path d="M12 5v14M5 12h14" />),
};

export function DesignPage() {
  const [theme, setThemeState] = useState<ThemeChoice>(savedTheme);
  const [picked, setPicked] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);

  const choose = (t: ThemeChoice) => {
    setTheme(t);
    setThemeState(t);
  };

  return (
    <>
      <FreezeFrontHeader title="Design" eyebrow="Dosym OS · Deep Blue" value={0.62} valueLabel="Sample progress" salt={7}>
        <p className="m-0">Night sky over the steppe: dark, calm, glassy, with light glowing in from two corners.</p>
      </FreezeFrontHeader>

      <div className="grid gap-3">
        <GlassCard className="card--grid grid gap-5" aria-labelledby="brand">
          <h2 id="brand" className="sr-only">
            Brand
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <Mascot size={64} label="Droplet mascot" />
            <div>
              <Wordmark className="text-4xl" />
              <Eyebrow className="mt-2">Lean canvas · Conrad 2026–27</Eyebrow>
            </div>
          </div>
          <HeroWords lead="The cold does" accent="the work." />
          <p className="m-0">
            Near-zero energy, <strong>no membranes</strong>, no chemicals. Body text stays soft grey with <strong>bold white</strong> for the key words.
          </p>
        </GlassCard>

        <GlassCard aria-labelledby="theme">
          <h2 id="theme" className="card-title">
            Theme
          </h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {(['dark', 'light', 'auto'] as const).map((t) => (
              <PillButton key={t} role="radio" aria-checked={theme === t} variant={theme === t ? 'primary' : 'secondary'} onClick={() => choose(t)}>
                {t === 'dark' ? 'Dark (default)' : t === 'light' ? 'Light' : 'Auto (match phone)'}
              </PillButton>
            ))}
          </div>
        </GlassCard>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile value="60%" unit="salty" label="Aral-Syrdarya groundwater, 1–3 g/L" icon={ICON.drop} />
          <StatTile value="70–85%" label="Salt removed per freezing night" icon={ICON.snow} />
          <StatTile value="≈$300" label="Raspberry Pi, sensors, solar" icon={ICON.plus} />
        </div>

        <GlassCard aria-labelledby="type">
          <h2 id="type" className="card-title">
            <StepBadge n={1} /> Type
          </h2>
          <p className="display m-0 text-5xl tracking-tight">
            47 <GradientText>due</GradientText>
          </p>
          <Eyebrow className="mt-3">Archivo 700 · uppercase eyebrow</Eyebrow>
          <p className="m-0 mt-2">Manrope body text. Қазақ тілі: Әә ҒғҚқ Ңң Өө Ұұ Үү Һһ Іі. Русский: Ёё Жж Щщ.</p>
          <p className="tnum m-0 mt-2 text-ink">07:15 · R 0.93 · S 14.2 d · 1 234 567</p>
        </GlassCard>

        <GlassCard aria-labelledby="colours">
          <h2 id="colours" className="card-title">
            <StepBadge n={2} /> Colours
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {SWATCHES.map(([token, value, use]) => (
              <li key={token} className="flex items-center gap-3">
                <span className="h-10 w-10 flex-none rounded-[10px] border border-rule" style={{ background: `var(${token})` }} />
                <span className="min-w-0">
                  <span className="tnum block text-sm font-semibold text-ink [font-variant-ligatures:none]">
                    {token} <span className="font-normal text-ink-2">{value}</span>
                  </span>
                  <span className="block text-sm">{use}</span>
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <GlassCard className="grid gap-3" aria-labelledby="bars">
            <h2 id="bars" className="card-title">
              <StepBadge n={3} /> Freeze front
            </h2>
            <FreezeFrontBar value={0.35} label="Thin bar sample" />
            <FreezeFrontBar value={0.8} salt={3} size="band" label="Band bar sample" />
            <p className="m-0 flex items-center gap-3">
              <SaltDotsLoader /> <span>Loading…</span>
            </p>
          </GlassCard>

          <StatTile eyebrow="Groundwater" value="6" unit="of 10" label="wells drinkable after one night">
            <DropletMeter share={0.6} label="Wells" />
          </StatTile>
        </div>

        <section className="grid gap-2" aria-labelledby="wall">
          <h2 id="wall" className="card-title">
            <StepBadge n={4} /> Ice wall
          </h2>
          <IceWallGrid items={SAMPLE_WALL} label="Sample ice wall" onSelect={(id) => setPicked(SAMPLE_WALL.find((b) => b.id === id)?.label ?? null)} />
          <p className="m-0 text-sm text-ink-2" aria-live="polite">
            {picked ? `Tapped: ${picked}` : 'Tap a brick.'}
          </p>
        </section>

        <GlassCard aria-labelledby="controls">
          <h2 id="controls" className="card-title">
            <StepBadge n={5} /> Controls
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton>Start today</PillButton>
            <PillButton variant="secondary">Later</PillButton>
            <button type="button" className="icon-btn" aria-label="Add">
              {ICON.plus}
            </button>
            <button type="button" className="icon-btn" aria-label="Freeze">
              {ICON.snow}
            </button>
          </div>
          <hr className="divider" />
          <div className="flex flex-wrap gap-2">
            <Chip>Phase 1</Chip>
            <Chip tone="ice">Clean</Chip>
            <Chip tone="violet">Brine</Chip>
            <Chip tone="warm">Due in 5 days</Chip>
            <Chip tone="good">Done</Chip>
            <Chip tone="danger">Failed</Chip>
          </div>
        </GlassCard>

        <GlassCard size="md" aria-labelledby="mascot">
          <h2 id="mascot" className="card-title">
            <StepBadge n={6} /> Mascot
          </h2>
          <div className="flex flex-wrap items-end gap-6">
            {(['idle', 'happy', 'sleepy'] as MascotMood[]).map((m) => (
              <figure key={m} className="m-0 grid justify-items-center gap-2">
                <Mascot key={m === 'happy' ? celebrate : m} mood={m} size={72} bounce={m === 'happy' && celebrate > 0} label={`Mascot, ${m}`} />
                <figcaption className="text-sm">{m}</figcaption>
              </figure>
            ))}
            <PillButton variant="secondary" onClick={() => setCelebrate((c) => c + 1)}>
              Celebrate
            </PillButton>
          </div>
        </GlassCard>
      </div>
    </>
  );
}
