import { lazy } from 'react';
import { SYS } from './paths';

const Status = lazy(() => import('./pages/Status'));
const Plans = lazy(() => import('./pages/Plans'));
const Sessions = lazy(() => import('./pages/Sessions'));
const Account = lazy(() => import('./pages/Account'));

const sys = (path, element, permission) => ({ path, element, layout: 'bare', access: 'permission', permission });

export default [
  sys(SYS.status, <Status />, 'platform:metric:read'),
  sys(SYS.plans, <Plans />, 'billing:manage'),
  sys(SYS.sessions, <Sessions />, 'platform:session:revoke'),
  sys(SYS.account, <Account />, 'session:switch'),
];
