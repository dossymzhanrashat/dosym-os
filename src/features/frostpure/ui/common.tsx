import { NavLink } from 'react-router';
import './frostpure.css';

// Pieces shared by the FrostPure pages.

const SECTIONS = [
  ['/frostpure', 'Hub'],
  ['/frostpure/lab', 'Lab'],
  ['/frostpure/build', 'Build'],
  ['/frostpure/media', 'Media'],
  ['/frostpure/compete', 'Compete'],
] as const;

/** Section bar (the 3D Model arrives in Phase 7; Market comes later). */
export function FrostNav() {
  return (
    <nav className="seg fp-nav" aria-label="FrostPure sections">
      {SECTIONS.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/frostpure'} className="seg-btn">
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

const kzt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
/** "≈ 61,000 ₸ (≈ $136) approx." — every price is approximate. */
export function money(kztValue: number, usdRate: number): string {
  return `≈ ${kzt.format(kztValue)} ₸ (≈ $${kzt.format(Math.round(kztValue / usdRate))})`;
}

export function Measured({ kind }: { kind: 'measured' | 'target' }) {
  return <span className={`fp-tag fp-tag--${kind}`}>{kind}</span>;
}

export const PHASE_LABEL: Record<string, string> = { prepare: 'Prepare', fill: 'Fill', freeze: 'Freeze', drain: 'Drain', sweat: 'Sweat', harvest: 'Harvest', measure: 'Measure' };
export const POINT_LABEL: Record<string, string> = { feed: 'Feed', brine: 'Brine', sweat: 'Sweat', clean: 'Clean', iceCore: 'Ice core' };
