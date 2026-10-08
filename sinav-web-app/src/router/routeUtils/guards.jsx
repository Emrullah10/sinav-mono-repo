import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, isGuestUser } from '@store/authStore';
import Routes from '@shared/constant/route-paths';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';

// Oturum (misafir dahil) şart.
export function RequireSession() {
  const status = useAuthStore((s) => s.status);
  const loc = useLocation();
  if (status === 'unknown') return <BubbleLoader fullscreen />;
  if (status === 'unauthenticated') return <Navigate to={Routes.welcome} replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

// Kayıtlı öğrenci şart; misafir kayda yönlendirilir.
export function RequireLearner() {
  const user = useAuthStore((s) => s.user);
  const loc = useLocation();
  if (isGuestUser(user)) return <Navigate to={Routes.signUp} replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

// İzin şart (CMS vb.).
export function RequirePermission({ permission }) {
  const perms = useAuthStore((s) => s.permissions);
  if (!perms.includes(permission)) return <Navigate to={Routes.today} replace />;
  return <Outlet />;
}
