import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Maintenance = lazy(() => import('./pages/Maintenance'));
export default [{ path: Routes.maintenance, element: <Maintenance />, layout: 'bare', access: 'public' }];
