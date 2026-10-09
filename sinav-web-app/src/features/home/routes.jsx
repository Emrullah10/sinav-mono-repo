import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Today = lazy(() => import('./pages/Today'));
const DayDone = lazy(() => import('./pages/DayDone'));

export default [
  { path: Routes.today, element: <Today />, layout: 'app', access: 'learner' },
  { path: Routes.dayDone, element: <DayDone />, layout: 'app', access: 'learner' },
];
