import type { ReactNode } from 'react';

export interface Section {
  path: string;
  label: string;
  icon: ReactNode;
}

// 24×24 line icons drawn in currentColor so they follow the selected-tab colour.
const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const SECTIONS: Section[] = [
  {
    path: '/',
    label: 'Today',
    icon: icon(
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
        <path d="M8 14.5h3" />
      </>,
    ),
  },
  {
    path: '/english',
    label: 'English',
    icon: icon(
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
        <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" />
        <path d="M9 13l2.5-6 2.5 6M9.8 11h3.4" />
      </>,
    ),
  },
  {
    path: '/frostpure',
    label: 'FrostPure',
    icon: icon(
      <>
        <path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z" />
        <path d="M6.4 12.5h11.2" />
        <circle cx="10" cy="16" r=".6" fill="currentColor" />
        <circle cx="13.5" cy="17.5" r=".6" fill="currentColor" />
      </>,
    ),
  },
  {
    path: '/tagylym',
    label: 'Tagylym',
    icon: icon(
      <>
        <rect x="5" y="7" width="14" height="10" rx="2.5" />
        <path d="M12 3v4M9 11.5h.01M15 11.5h.01M9.5 14.5h5" />
        <circle cx="8" cy="19.5" r="1.5" />
        <circle cx="16" cy="19.5" r="1.5" />
      </>,
    ),
  },
  {
    path: '/radar',
    label: 'Radar',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 12l5.5-5.5" />
        <circle cx="12" cy="12" r=".8" fill="currentColor" />
      </>,
    ),
  },
];
