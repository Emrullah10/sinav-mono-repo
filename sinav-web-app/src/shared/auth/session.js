import api from '@api';
import { useAuthStore } from '@store/authStore';

// Gateway yanıtını (login/guest/register) store'a işler. Çerezleri gateway basar.
export const applySession = (response) => {
  const data = response?.data?.data;
  if (!data?.user) return null;
  useAuthStore.getState().login({ user: data.user, permissions: data.user.permissions });
  return data.user;
};

// Oturum yoksa misafir oturumu açar (onboarding "Başla"). Varsa dokunmaz.
export const ensureSession = async () => {
  const s = useAuthStore.getState();
  if (s.status === 'authenticated') return s.user;
  return applySession(await api.identityAuthGuest({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
};

export const signOut = async () => {
  try {
    await api.gatewayLogout();
  } catch {
    /* oturum zaten bitmiş olabilir */
  }
  useAuthStore.getState().logout();
};
