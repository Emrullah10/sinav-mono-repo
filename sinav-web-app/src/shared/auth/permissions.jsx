import { useAuthStore } from '@store/authStore';

export const useHasPermission = (...codes) => {
  const perms = useAuthStore((s) => s.permissions);
  return codes.some((c) => perms.includes(c));
};
export const HasPermission = ({ code, children, fallback = null }) => (useHasPermission(code) ? children : fallback);
