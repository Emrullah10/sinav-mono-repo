import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Me = lazy(() => import('./pages/Me'));
const Goal = lazy(() => import('./pages/Goal'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Payment = lazy(() => import('./pages/Payment'));
const Settings = lazy(() => import('./pages/Settings'));
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'));

// Profil ve hesap ekranları kayıtlı öğrenciye açıktır (misafirde account:manage / billing izinleri yok).
export default [
  { path: Routes.me, element: <Me />, layout: 'app', access: 'learner' },
  { path: Routes.meGoal, element: <Goal />, layout: 'app', access: 'learner' },
  { path: Routes.meSubscription, element: <Subscription />, layout: 'app', access: 'learner' },
  { path: Routes.mePayment, element: <Payment />, layout: 'app', access: 'learner' },
  { path: Routes.meSettings, element: <Settings />, layout: 'app', access: 'learner' },
  { path: Routes.meDelete, element: <DeleteAccount />, layout: 'app', access: 'learner' },
];
