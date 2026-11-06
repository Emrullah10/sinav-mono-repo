import { useEffect } from 'react';
import api from '@api';
import { useAuthStore } from '@store/authStore';
import { useThemeStore } from '@store/themeStore';
import { useBackgroundStore } from '@store/backgroundStore';
import { queryClient } from '@shared/providers/QueryProvider';

const HYDRATION_TIMEOUT_MS = 8000;
const THEMES = ['system', 'light', 'dark'];

// Önce hydration, sonra /api/gateway/me ile doğrulama. Zaman aşımında 'unauthenticated'.
export default function AuthBootstrap({ children }) {
  const status = useAuthStore((s) => s.status);

  // Tema tercihi sunucuda (ME-09): başka cihazda seçilen tema girişte bu cihaza da uygulanır.
  // Aynı sorgu anahtarı Ayarlar ve okuyucu tarafından da kullanılır; hata sessizdir.
  useEffect(() => {
    if (status !== 'authenticated') return;
    queryClient
      .fetchQuery({
        queryKey: ['me', 'prefs'],
        queryFn: async () => (await api.identityPreferencesGet())?.data?.data,
        meta: { suppressGlobalErrorNotification: true },
      })
      .then((p) => {
        if (THEMES.includes(p?.theme)) useThemeStore.getState().setMode(p.theme);
        useBackgroundStore.getState().apply(p);
      })
      .catch(() => {});
  }, [status]);

  useEffect(() => {
    let done = false;
    const store = useAuthStore;
    const timer = setTimeout(() => {
      if (!done && store.getState().status === 'unknown') store.getState().setStatus('unauthenticated');
    }, HYDRATION_TIMEOUT_MS);

    const run = async () => {
      if (!store.persist.hasHydrated()) await new Promise((r) => store.persist.onFinishHydration(r));
      try {
        const res = await api.gatewayMe({ _skipRefresh: false });
        const d = res.data?.data;
        if (d?.user) {
          // me yanıtı rol/izin; ayrıntı için hesap bilgisi sonra yüklenir
          const prev = store.getState().user;
          store.getState().login({ user: { ...(prev || {}), ...d.user, userAccountId: Number(d.user.userAccountId) }, permissions: d.permissions });
        } else store.getState().logout({ clearQueryCache: false });
      } catch (e) {
        const st = e?.response?.status;
        if (st === 401 || st === 403) store.getState().logout({ clearQueryCache: false });
        else store.getState().setStatus(store.getState().user ? 'authenticated' : 'unauthenticated');
      } finally {
        done = true;
        clearTimeout(timer);
      }
    };
    run();
    return () => clearTimeout(timer);
  }, []);
  return children;
}
