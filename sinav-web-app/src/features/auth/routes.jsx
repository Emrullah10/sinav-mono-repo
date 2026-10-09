import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Welcome = lazy(() => import('./pages/Welcome'));
const SignIn = lazy(() => import('./pages/SignIn'));
const SignUp = lazy(() => import('./pages/SignUp'));
const PasswordReset = lazy(() => import('./pages/PasswordReset'));
const Legal = lazy(() => import('./pages/Legal'));

export default [
  { path: Routes.welcome, element: <Welcome />, layout: 'bare', access: 'public' },
  { path: Routes.signIn, element: <SignIn />, layout: 'auth', access: 'public' },
  { path: Routes.signUp, element: <SignUp />, layout: 'auth', access: 'public' },
  { path: Routes.passwordReset, element: <PasswordReset />, layout: 'auth', access: 'public' },
  { path: Routes.legal, element: <Legal />, layout: 'bare', access: 'public' },
];
