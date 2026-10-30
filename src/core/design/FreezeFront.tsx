import type { CSSProperties, ReactNode } from 'react';

/*
 * The Freeze Front motif: ice on top, a front line, salt sinking into amber brine below.
 * Never flipped. Used for progress, memory and deadlines across every module.
 */

const ICE_COLUMNS = 20;
const MAX_VISIBLE_SALT = 36;

export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** How full each ice column is (0–1). Columns freeze left to right, each from the top down. */
export function columnFills(value: number, columns = ICE_COLUMNS): number[] {
  const frozen = clamp01(value) * columns;
  return Array.from({ length: columns }, (_, i) => clamp01(frozen - i));
}

/** Stable pseudo-random spot for salt dot i (golden-ratio spacing, so dots never jump between renders). */
function saltSpot(i: number): { x: number; depth: number; delay: number } {
  const x = ((i * 0.618034 + 0.13) % 1) * 92 + 4;
  const depth = ((i * 0.381966 + 0.41) % 1) * 45 + 40;
  return { x, depth, delay: (i % 7) * 0.18 };
}

interface FreezeFrontBarProps {
  /** Progress, 0–1. */
  value: number;
  /** Accessible name, e.g. "Today's reviews". */
  label: string;
  /** Weak or overdue items shown as salt dots in the brine. Only drawn in the "band" size. */
  salt?: number;
  /** "thin": ice track + front line (top bars, cards). "band": adds the brine layer. */
  size?: 'thin' | 'band';
  /** Optional text for screen readers instead of "NN%", e.g. "12 of 47 reviews". */
  valueText?: string;
  className?: string;
}

export function FreezeFrontBar({ value, label, salt = 0, size = 'thin', valueText, className = '' }: FreezeFrontBarProps) {
  const pct = Math.round(clamp01(value) * 100);
  const dots = Math.min(Math.max(0, Math.floor(salt)), MAX_VISIBLE_SALT);
  return (
    <div
      className={`ff-bar ff-bar--${size} ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={valueText ?? `${pct}%${salt > 0 ? `, ${salt} salt` : ''}`}
    >
      <div className="ff-ice" aria-hidden="true">
        {columnFills(value).map((fill, i) => (
          <span key={i} className="ff-col">
            <span className="ff-col-fill" style={{ height: `${fill * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="ff-front" aria-hidden="true" />
      {size === 'band' && (
        <div className="ff-brine" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => {
            const s = saltSpot(i);
            return (
              <span
                key={i}
                className="ff-salt"
                style={{ left: `${s.x}%`, '--depth': `${s.depth}%`, animationDelay: `${s.delay}s` } as CSSProperties}
              />
            );
          })}
          {salt > MAX_VISIBLE_SALT && <span className="ff-salt-more">+{salt - MAX_VISIBLE_SALT}</span>}
        </div>
      )}
    </div>
  );
}

interface FreezeFrontHeaderProps {
  title: string;
  /** Small mono line above the title, e.g. the date or the section name. */
  eyebrow?: string;
  /** Kazakh / Russian gloss shown beside the title. */
  gloss?: string;
  value: number;
  valueLabel: string;
  valueText?: string;
  salt?: number;
  children?: ReactNode;
}

export function FreezeFrontHeader({ title, eyebrow, gloss, value, valueLabel, valueText, salt, children }: FreezeFrontHeaderProps) {
  return (
    <header className="ff-header">
      {eyebrow && <p className="ff-eyebrow">{eyebrow}</p>}
      <h1 className="ff-title">
        {title}
        {gloss && <span className="ff-gloss" lang="kk">{gloss}</span>}
      </h1>
      {children && <div className="ff-header-body">{children}</div>}
      <FreezeFrontBar value={value} label={valueLabel} valueText={valueText} salt={salt} size="band" />
    </header>
  );
}

export function SaltDotsLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="ff-loader" role="status">
      <span className="ff-loader-ice" aria-hidden="true" />
      <span className="ff-loader-front" aria-hidden="true" />
      <span className="ff-loader-brine" aria-hidden="true">
        <span className="ff-loader-dot" />
        <span className="ff-loader-dot" />
        <span className="ff-loader-dot" />
      </span>
      <span className="sr-only">{label}…</span>
    </span>
  );
}

export type IceBrickState = 'frozen' | 'thawing' | 'salt';
export interface IceBrick {
  id: string;
  label: string;
  state: IceBrickState;
}

const BRICK_STATE_TEXT: Record<IceBrickState, string> = {
  frozen: 'frozen',
  thawing: 'thawing, review soon',
  salt: 'weak word in the brine',
};

/**
 * Flat Ice Wall: frozen and thawing bricks stack in the ice, weak words sit as salt in the
 * brine pool below. This is also the accessible fallback for the 3D Ice Wall (Phase 7).
 */
export function IceWallGrid({
  items,
  label = 'Ice wall',
  onSelect,
  emptyText = 'Nothing frozen yet.',
}: {
  items: IceBrick[];
  label?: string;
  onSelect?: (id: string) => void;
  emptyText?: string;
}) {
  const ice = items.filter((b) => b.state !== 'salt');
  const salt = items.filter((b) => b.state === 'salt');
  const brick = (b: IceBrick) => {
    const name = `${b.label}, ${BRICK_STATE_TEXT[b.state]}`;
    const cls = `ff-brick ff-brick--${b.state}`;
    return (
      <li key={b.id}>
        {onSelect ? (
          <button type="button" className={cls} aria-label={name} onClick={() => onSelect(b.id)}>
            {b.label}
          </button>
        ) : (
          <span className={cls} aria-label={name}>
            {b.label}
          </span>
        )}
      </li>
    );
  };
  return (
    <section className="ff-wall" aria-label={label}>
      {ice.length === 0 ? (
        <p className="ff-wall-empty">{emptyText}</p>
      ) : (
        <ul className="ff-wall-ice">{ice.map(brick)}</ul>
      )}
      <div className="ff-front" aria-hidden="true" />
      <ul className="ff-wall-brine" aria-label={`Brine pool, ${salt.length} weak`}>
        {salt.map(brick)}
      </ul>
    </section>
  );
}
