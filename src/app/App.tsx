import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './Layout';
import { NotFound } from './NotFound';
import { TodayPage } from '../features/today/TodayPage';

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      errorElement: <NotFound />,
      children: [
        { index: true, element: <TodayPage /> },
        { path: 'planner', lazy: async () => ({ Component: (await import('../features/planner/PlannerPage')).PlannerPage }) },
        { path: 'planner/item/:id', lazy: async () => ({ Component: (await import('../features/planner/ItemPage')).ItemPage }) },
        { path: 'planner/review', lazy: async () => ({ Component: (await import('../features/planner/WeeklyReviewPage')).WeeklyReviewPage }) },
        { path: 'settings', lazy: async () => ({ Component: (await import('../features/settings/SettingsPage')).SettingsPage }) },
        { path: 'english', lazy: async () => ({ Component: (await import('../features/english/EnglishPage')).EnglishPage }) },
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
        { path: 'frostpure', lazy: async () => ({ Component: (await import('../features/frostpure/FrostPurePage')).FrostPurePage }) },
        { path: 'frostpure/lab', lazy: async () => ({ Component: (await import('../features/frostpure/ui/LabPage')).LabPage }) },
        { path: 'frostpure/run/:id', lazy: async () => ({ Component: (await import('../features/frostpure/ui/RunPage')).RunPage }) },
        { path: 'frostpure/compare', lazy: async () => ({ Component: (await import('../features/frostpure/ui/ComparePage')).ComparePage }) },
        { path: 'frostpure/model', lazy: async () => ({ Component: (await import('../features/frostpure/ui/ModelPage')).ModelPage }) },
        { path: 'frostpure/build', lazy: async () => ({ Component: (await import('../features/frostpure/ui/BuildPage')).BuildPage }) },
        { path: 'frostpure/pi', lazy: async () => ({ Component: (await import('../features/frostpure/ui/PiSetupPage')).PiSetupPage }) },
        { path: 'frostpure/media', lazy: async () => ({ Component: (await import('../features/frostpure/ui/MediaPage')).MediaPage }) },
        { path: 'frostpure/media/:id', lazy: async () => ({ Component: (await import('../features/frostpure/ui/AssetPage')).AssetPage }) },
        { path: 'frostpure/compete', lazy: async () => ({ Component: (await import('../features/frostpure/ui/CompetePage')).CompetePage }) },
        { path: 'frostpure/compete/:id', lazy: async () => ({ Component: (await import('../features/frostpure/ui/CompetePage')).CompetitionPage }) },
        { path: 'tagylym', lazy: async () => ({ Component: (await import('../features/tagylym/TagylymPage')).TagylymPage }) },
        { path: 'tagylym/option/:id', lazy: async () => ({ Component: (await import('../features/tagylym/ui/OptionPage')).OptionPage }) },
        { path: 'tagylym/decide', lazy: async () => ({ Component: (await import('../features/tagylym/ui/DecidePage')).DecidePage }) },
        { path: 'tagylym/pipeline', lazy: async () => ({ Component: (await import('../features/tagylym/ui/PipelinePage')).PipelinePage }) },
        { path: 'tagylym/economics', lazy: async () => ({ Component: (await import('../features/tagylym/ui/EconomicsPage')).EconomicsPage }) },
        { path: 'tagylym/studio', lazy: async () => ({ Component: (await import('../features/tagylym/ui/StudioPage')).StudioPage }) },
        { path: 'tagylym/forge', lazy: async () => ({ Component: (await import('../features/tagylym/ui/ForgePage')).ForgePage }) },
        { path: 'radar', lazy: async () => ({ Component: (await import('../features/radar/RadarPage')).RadarPage }) },
        { path: 'radar/o/:id', lazy: async () => ({ Component: (await import('../features/radar/ui/OpportunityPage')).OpportunityPage }) },
        { path: 'radar/changes', lazy: async () => ({ Component: (await import('../features/radar/ui/ChangesPage')).ChangesPage }) },
        { path: 'radar/settings', lazy: async () => ({ Component: (await import('../features/radar/ui/RadarSettingsPage')).RadarSettingsPage }) },
        { path: 'design', lazy: async () => ({ Component: (await import('../features/today/DesignPage')).DesignPage }) },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

export function App() {
  return <RouterProvider router={router} />;
}
