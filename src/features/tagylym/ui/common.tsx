import { NavLink } from 'react-router';
import { Chip } from '../../../core/design/components';
import './tagylym.css';

// Pieces shared by the Kit Studio pages.

const SECTIONS = [
  ['/tagylym', 'Options'],
  ['/tagylym/decide', 'Decide'],
  ['/tagylym/pipeline', 'Pipeline'],
  ['/tagylym/economics', 'Economics'],
  ['/tagylym/studio', '3D Studio'],
  ['/tagylym/forge', 'Idea Forge'],
] as const;

export function TgNav() {
  return (
    <nav className="seg tg-nav" aria-label="Kit Studio sections">
      {SECTIONS.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/tagylym'} className="seg-btn">
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
export const kzt = (v: number) => `≈ ${fmt.format(Math.round(v))} ₸`;
export const usd = (v: number, fx: number) => `≈ $${(v / fx).toFixed(2)}`;
export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "approx. · checked 30 Oct" — every price carries it (SPEC acceptance). */
export function Approx({ checked }: { checked?: string }) {
  const d = checked ? new Date(`${checked}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : undefined;
  return <span className="tg-approx">approx.{d ? ` · checked ${d}` : ''}</span>;
}

export const ToConfirm = () => <Chip tone="warm">to confirm</Chip>;

/** Text with "[TO CONFIRM …]" shown as a tag. */
export function Tagged({ text }: { text: string }) {
  const parts = text.split(/(\[TO CONFIRM[^\]]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[TO CONFIRM/.test(p) ? (
          <span key={i} className="chip chip--dot chip--warm tg-inline-chip">
            to confirm{p.length > 12 ? `: ${p.slice(12, -1).trim()}` : ''}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export const STATUS_TONE = { exploring: 'plain', active: 'good', parked: 'violet' } as const;
