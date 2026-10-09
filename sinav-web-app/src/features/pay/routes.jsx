import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Premium = lazy(() => import('./pages/Premium'));
const Plans = lazy(() => import('./pages/Plans'));
const Checkout = lazy(() => import('./pages/Checkout'));
const CheckoutResult = lazy(() => import('./pages/CheckoutResult'));
const Cancel = lazy(() => import('./pages/Cancel'));

// Plan seçimi misafire de açıktır; satın alma ve abonelik yönetimi kayıtlı öğrenci ister (billing:purchase/manage).
export default [
  { path: Routes.premium, element: <Premium />, layout: 'app', access: 'session' },
  { path: Routes.plans, element: <Plans />, layout: 'app', access: 'session' },
  { path: Routes.checkoutResult, element: <CheckoutResult />, layout: 'app', access: 'learner' },
  { path: Routes.checkout, element: <Checkout />, layout: 'app', access: 'learner' },
  { path: Routes.cancel, element: <Cancel />, layout: 'app', access: 'learner' },
];
