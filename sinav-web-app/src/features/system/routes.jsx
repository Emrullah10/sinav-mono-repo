import { lazy } from 'react';

const Maintenance = lazy(() => import('./pages/Maintenance'));
export default [{ path: '/bakim', element: <Maintenance />, layout: 'bare', access: 'public' }];
