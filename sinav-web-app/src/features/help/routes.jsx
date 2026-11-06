import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const HelpArticle = lazy(() => import('./pages/HelpArticle'));

// Yardım merkezi herkese açık (giriş gerekmez); makaleler istek diline göre gelir.
export default [
  { path: Routes.help, element: <HelpCenter />, layout: 'bare', access: 'public' },
  { path: Routes.helpArticle, element: <HelpArticle />, layout: 'bare', access: 'public' },
];
