import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Entry = lazy(() => import('./pages/Entry'));
const Test = lazy(() => import('./pages/Test'));
const Break = lazy(() => import('./pages/Break'));
const Result = lazy(() => import('./pages/Result'));
const Plan = lazy(() => import('./pages/Plan'));

export default [
  { path: Routes.diagnosticStart, element: <Entry />, layout: 'bare', access: 'public' },
  { path: Routes.diagnosticTest, element: <Test />, layout: 'focus', access: 'session' },
  { path: Routes.diagnosticBreak, element: <Break />, layout: 'focus', access: 'session' },
  { path: Routes.diagnosticResult, element: <Result />, layout: 'bare', access: 'session' },
  { path: Routes.diagnosticPlan, element: <Plan />, layout: 'bare', access: 'session' },
];
