import { NavLink, Outlet, ScrollRestoration } from 'react-router';
import { AppBackground, Wordmark } from '../core/design/components';
import { Mascot } from '../core/design/Mascot';
import { SECTIONS } from './sections';
import './layout.css';

/** TabBar at the bottom on phones, SideNav on laptops (≥ 56rem). Same links, restyled by CSS. */
export function Layout() {
  return (
    <>
      <AppBackground />
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <nav className="app-nav" aria-label="Sections">
          <p className="app-brand" aria-hidden="true">
            <Mascot size={30} />
            <Wordmark />
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
    </>
  );
}
