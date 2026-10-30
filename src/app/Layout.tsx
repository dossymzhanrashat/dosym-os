import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { AppBackground, Wordmark } from '../core/design/components';
import { Mascot } from '../core/design/Mascot';
import { QuickAddProvider } from '../features/planner/QuickAdd';
import { ReminderBanner } from '../features/planner/ReminderBanner';
import { SECTIONS } from './sections';
import './layout.css';

// Planner, item pages and Settings belong to the Today section.
const TODAY_PATHS = /^\/(planner|settings)(\/|$)/;

/** TabBar at the bottom on phones, SideNav on laptops (≥ 56rem). Same links, restyled by CSS. */
export function Layout() {
  const { pathname } = useLocation();
  return (
    <QuickAddProvider>
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
                <NavLink
                  to={s.path}
                  end={s.path === '/'}
                  className={({ isActive }) => `app-nav-link ${isActive || (s.path === '/' && TODAY_PATHS.test(pathname)) ? 'active' : ''}`}
                >
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
      <ReminderBanner />
    </QuickAddProvider>
  );
}
