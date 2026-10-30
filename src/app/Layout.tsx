import { NavLink, Outlet, ScrollRestoration } from 'react-router';
import { SECTIONS } from './sections';
import './layout.css';

/** Bottom tab bar on phones, side navigation on laptops (≥ 56rem). */
export function Layout() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="app-nav" aria-label="Sections">
        <p className="app-brand display" aria-hidden="true">
          Dosym OS
        </p>
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.path}>
              <NavLink to={s.path} end={s.path === '/'} className="app-nav-link">
                {s.icon}
                <span>{s.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
