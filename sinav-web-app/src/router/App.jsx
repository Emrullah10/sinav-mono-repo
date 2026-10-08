import { Suspense, lazy, useMemo } from 'react';
import { Navigate, Route, Routes as RRoutes } from 'react-router-dom';
import { RequireSession, RequireLearner, RequirePermission } from './routeUtils/guards';
import Routes from '@shared/constant/route-paths';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import AppShell from '@layouts/AppShell/AppShell';
import FocusLayout from '@layouts/FocusLayout/FocusLayout';
import AuthLayout from '@layouts/AuthLayout/AuthLayout';
import CmsLayout from '@layouts/CmsLayout/CmsLayout';
import BareLayout from '@layouts/BareLayout/BareLayout';
import { useAuthStore } from '@store/authStore';
import { isGuestUser } from '@store/authStore';

// Özellikler rotalarını kendi dosyasında bildirir: features/<alan>/routes.jsx → export default [ { path, element, layout, access, permission } ]
//   layout: 'app' (kenar çubuğu/alt sekme) | 'focus' (odak modu) | 'auth' | 'cms' | 'bare'
//   access: 'public' | 'session' (misafir dahil) | 'learner' | 'permission' (permission alanı gerekir)
// element: lazy bileşen ya da JSX.
const modules = import.meta.glob('../features/*/routes.jsx', { eager: true });
const defs = Object.values(modules).flatMap((m) => m.default || []);

const LAYOUTS = { app: AppShell, focus: FocusLayout, auth: AuthLayout, cms: CmsLayout, bare: BareLayout };

const Home = () => {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  if (status === 'unknown') return <BubbleLoader fullscreen />;
  if (status === 'authenticated') return <Navigate to={isGuestUser(user) ? Routes.onbExam : Routes.today} replace />;
  return <Navigate to={Routes.welcome} replace />;
};

const NotFound = lazy(() => import('../pages/NotFound'));

export default function App() {
  const groups = useMemo(() => {
    const byKey = new Map();
    for (const d of defs) {
      const key = `${d.layout || 'app'}|${d.access || 'session'}|${d.permission || ''}`;
      if (!byKey.has(key)) byKey.set(key, { layout: d.layout || 'app', access: d.access || 'session', permission: d.permission, routes: [] });
      byKey.get(key).routes.push(d);
    }
    return [...byKey.values()];
  }, []);

  return (
    <Suspense fallback={<BubbleLoader fullscreen />}>
      <RRoutes>
        <Route path="/" element={<Home />} />
        {groups.map((g, gi) => {
          const Layout = LAYOUTS[g.layout] || AppShell;
          const guard =
            g.access === 'public' ? null : g.access === 'learner' ? [RequireSession, RequireLearner] : g.access === 'permission' ? [RequireSession, () => <RequirePermission permission={g.permission} />] : [RequireSession];
          const inner = (
            <Route element={<Layout />}>
              {g.routes.map((r) => (
                <Route key={r.path} path={r.path} element={r.element} />
              ))}
            </Route>
          );
          if (!guard) return <Route key={gi}>{inner}</Route>;
          return guard.reduceRight((acc, G, i) => <Route key={`${gi}-${i}`} element={<G />}>{acc}</Route>, inner);
        })}
        <Route path="*" element={<NotFound />} />
      </RRoutes>
    </Suspense>
  );
}
