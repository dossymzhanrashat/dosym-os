import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from 'react';
import { clamp01 } from './FreezeFront';

/*
 * Deep Blue building blocks (brand/DESIGN.md › Components). Thin wrappers around the classes in
 * components.css, so plain elements with the same class names look identical.
 */

/** Page gradient with the blue (top-left) and cyan (bottom-right) corner glows. Render once. */
export function AppBackground() {
  return <div className="app-bg" aria-hidden="true" />;
}

type GlassCardProps = HTMLAttributes<HTMLElement> & {
  /** "lg" = 26 px corners (default), "md" = 18 px for smaller tiles. */
  size?: 'lg' | 'md';
  as?: ElementType;
};

export function GlassCard({ size = 'lg', as: Tag = 'section', className = '', ...rest }: GlassCardProps) {
  return <Tag className={`card ${size === 'md' ? 'card--md' : ''} ${className}`} {...rest} />;
}

/** Small uppercase label above a title, e.g. "FROSTPURE · HOW IT WORKS". */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/** Numbered step badge: 1 → "01". */
export function StepBadge({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`step-badge ${className}`} aria-hidden="true">
      {String(n).padStart(2, '0')}
    </span>
  );
}

/** Iridescent words for the wordmark and hero words. Only at 28 px and up, never for body text. */
export function GradientText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`gradient-text ${className}`}>{children}</span>;
}

/** Two-line hero: a white line, then a gradient line ("The cold does / the work."). */
export function HeroWords({ lead, accent, as: Tag = 'p' }: { lead: string; accent: string; as?: ElementType }) {
  return (
    <Tag className="hero-words">
      {lead}
      <br />
      <span className="gradient-text">{accent}</span>
    </Tag>
  );
}

/** "Dosym" in white + "OS" in the gradient, Archivo 800 extended. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      Dosym <span className="gradient-text">OS</span>
    </span>
  );
}

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' };

export function PillButton({ variant = 'primary', className = '', type = 'button', ...rest }: PillButtonProps) {
  return <button type={type} className={`pill ${variant === 'secondary' ? 'pill--secondary' : ''} ${className}`} {...rest} />;
}

export type ChipTone = 'plain' | 'ice' | 'violet' | 'warm' | 'good' | 'danger';

/** Tag or status. A tone adds a glowing dot and a tinted border; the text stays high-contrast. */
export function Chip({ tone = 'plain', children, className = '' }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return <span className={`chip ${tone === 'plain' ? '' : `chip--dot chip--${tone}`} ${className}`}>{children}</span>;
}

interface StatTileProps {
  value: ReactNode;
  unit?: string;
  label: string;
  eyebrow?: string;
  /** Compact row with a gradient number and this line icon in a box on the right ("60% salty"). */
  icon?: ReactNode;
  /** Small chart or meter under the number. */
  children?: ReactNode;
  className?: string;
}

/** Big Archivo number + label + a slot for a small chart; with `icon`, the compact row version. */
export function StatTile({ value, unit, label, eyebrow, icon, children, className = '' }: StatTileProps) {
  return (
    <GlassCard size="md" className={`stat ${icon ? 'stat--row' : ''} ${className}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <p className={`stat-value ${icon ? 'gradient-text' : ''}`}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </p>
      <p className="stat-label">{label}</p>
      {icon && (
        <span className="icon-btn stat-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {!icon && <div className="stat-chart">{children}</div>}
    </GlassCard>
  );
}

/** How many of `count` droplets are drinkable (cyan) for a share 0–1; the rest are salty (violet). */
export function cleanDroplets(share: number, count: number): number {
  return Math.round(clamp01(share) * Math.max(0, Math.floor(count)));
}

const DROP_PATH = 'M7 0.6C7 0.6 0.8 7.6 0.8 12.2a6.2 6.2 0 0 0 12.4 0C13.2 7.6 7 0.6 7 0.6z';

/** A row of small droplets: cyan = drinkable, violet = salty. Reuse for any clean/salty ratio. */
export function DropletMeter({ share, count = 10, label }: { share: number; count?: number; label: string }) {
  const clean = cleanDroplets(share, count);
  return (
    <ul className="droplet-meter" role="img" aria-label={`${label}: ${clean} of ${count} drinkable`}>
      {Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => (
        <li key={i}>
          <svg viewBox="0 0 14 19" aria-hidden="true">
            <path d={DROP_PATH} className={i < clean ? 'droplet--clean' : 'droplet--salty'} />
          </svg>
        </li>
      ))}
    </ul>
  );
}
