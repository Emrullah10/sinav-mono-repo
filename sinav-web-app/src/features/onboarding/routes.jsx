import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const ExamSelect = lazy(() => import('./pages/ExamSelect'));
const GoalSelect = lazy(() => import('./pages/GoalSelect'));
const DateSelect = lazy(() => import('./pages/DateSelect'));
const Availability = lazy(() => import('./pages/Availability'));
const DiagnosticIntro = lazy(() => import('./pages/DiagnosticIntro'));

export default [
  { path: Routes.onbExam, element: <ExamSelect />, layout: 'bare', access: 'session' },
  { path: Routes.onbGoal, element: <GoalSelect />, layout: 'bare', access: 'session' },
  { path: Routes.onbDate, element: <DateSelect />, layout: 'bare', access: 'session' },
  { path: Routes.onbAvailability, element: <Availability />, layout: 'bare', access: 'session' },
  { path: Routes.onbDiagnostic, element: <DiagnosticIntro />, layout: 'bare', access: 'session' },
];
