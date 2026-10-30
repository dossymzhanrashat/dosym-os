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
        { path: 'frostpure', element: <FrostPurePage /> },
        { path: 'tagylym', element: <TagylymPage /> },
        { path: 'radar', element: <RadarPage /> },
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
