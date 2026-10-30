import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Home = lazy(() => import('./pages/Home'));
const Chat = lazy(() => import('./pages/Chat'));
const Translation = lazy(() => import('./pages/Translation'));

// Öğretmen yalnız kayıtlı öğrenciye açıktır (misafirde tutor:* izni yok).
export default [
  { path: Routes.tutor, element: <Home />, layout: 'app', access: 'learner' },
  { path: Routes.tutorChat, element: <Chat />, layout: 'app', access: 'learner' },
  { path: Routes.translation, element: <Translation />, layout: 'app', access: 'learner' },
];
