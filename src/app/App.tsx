import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './Layout';
import { NotFound } from './NotFound';
import { TodayPage } from '../features/today/TodayPage';
import { DesignPage } from '../features/today/DesignPage';
import { EnglishPage } from '../features/english/EnglishPage';
import { FrostPurePage } from '../features/frostpure/FrostPurePage';
import { TagylymPage } from '../features/tagylym/TagylymPage';
import { RadarPage } from '../features/radar/RadarPage';
import { PlannerPage } from '../features/planner/PlannerPage';
import { ItemPage } from '../features/planner/ItemPage';
import { WeeklyReviewPage } from '../features/planner/WeeklyReviewPage';
import { SettingsPage } from '../features/settings/SettingsPage';

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      errorElement: <NotFound />,
      children: [
        { index: true, element: <TodayPage /> },
        { path: 'planner', element: <PlannerPage /> },
        { path: 'planner/item/:id', element: <ItemPage /> },
        { path: 'planner/review', element: <WeeklyReviewPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'english', element: <EnglishPage /> },
        // English sub-pages load on first visit (charts are heavy).
        { path: 'english/review', lazy: async () => ({ Component: (await import('../features/english/ui/ReviewPage')).ReviewPage }) },
        { path: 'english/add', lazy: async () => ({ Component: (await import('../features/english/ui/AddWordPage')).AddWordPage }) },
        { path: 'english/packs', lazy: async () => ({ Component: (await import('../features/english/ui/PacksPage')).PacksPage }) },
        { path: 'english/words', lazy: async () => ({ Component: (await import('../features/english/ui/WordsPage')).WordsPage }) },
        { path: 'english/word/:id', lazy: async () => ({ Component: (await import('../features/english/ui/WordsPage')).WordPage }) },
        { path: 'english/stats', lazy: async () => ({ Component: (await import('../features/english/ui/StatsPage')).StatsPage }) },
        { path: 'english/inbox', lazy: async () => ({ Component: (await import('../features/english/ui/InboxPage')).InboxPage }) },
        { path: 'english/import', lazy: async () => ({ Component: (await import('../features/english/ui/ImportPage')).ImportPage }) },
        { path: 'english/scan', lazy: async () => ({ Component: (await import('../features/english/ui/ScanPage')).ScanPage }) },
        { path: 'english/share-setup', lazy: async () => ({ Component: (await import('../features/english/ui/ShareSetupPage')).ShareSetupPage }) },
        { path: 'english/use-it', lazy: async () => ({ Component: (await import('../features/english/ui/UseItPage')).UseItPage }) },
        // Share target: iOS Shortcut "Add to Dosym", the Mac bookmarklet and the manifest share_target.
        { path: 'inbox/add', lazy: async () => ({ Component: (await import('../features/english/ui/ShareAddPage')).ShareAddPage }) },
        { path: 'english/settings', lazy: async () => ({ Component: (await import('../features/english/ui/EnglishSettingsPage')).EnglishSettingsPage }) },
        { path: 'frostpure', element: <FrostPurePage /> },
        { path: 'tagylym', element: <TagylymPage /> },
        { path: 'radar', element: <RadarPage /> },
        { path: 'radar/o/:id', lazy: async () => ({ Component: (await import('../features/radar/ui/OpportunityPage')).OpportunityPage }) },
        { path: 'radar/changes', lazy: async () => ({ Component: (await import('../features/radar/ui/ChangesPage')).ChangesPage }) },
        { path: 'radar/settings', lazy: async () => ({ Component: (await import('../features/radar/ui/RadarSettingsPage')).RadarSettingsPage }) },
        { path: 'design', element: <DesignPage /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

export function App() {
  return <RouterProvider router={router} />;
}
