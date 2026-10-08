import axios from 'axios';
import { SESSION_ENDED_CODES } from '@sinav/client-sdk';
import { useAuthStore } from '@store/authStore';

// Web: imzalı httpOnly çerezler + CSRF çifti (sinav_xsrf → X-XSRF-TOKEN). Mobil bearer kullanır (gateway ikisini de bilir).
const instance = axios.create({
  withCredentials: true,
  xsrfCookieName: 'sinav_xsrf',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json', 'X-Client': 'sinav-web' },
});

// Tek uçuşlu yenileme: aynı anda düşen isteklerin hepsi tek refresh'i bekler.
let refreshInFlight = null;
const callRefresh = () => {
  if (!refreshInFlight) {
    refreshInFlight = instance
      .post('/api/gateway/refresh', {}, { _skipRefresh: true, timeout: 15000 })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

const endSession = () => {
  const { status, logout } = useAuthStore.getState();
  // Anonim 401 login'e yönlendirilmez (remount → /me → 401 döngüsü).
  if (status !== 'authenticated') return logout({ clearQueryCache: false });
  logout();
  window.dispatchEvent(new CustomEvent('sinav:session-ended'));
};

instance.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error;
    const code = response?.data?.error?.code;
    if (!config || !response) throw error;

    const retryable = !config._retry && !config._skipRefresh;
    if (retryable && ((response.status === 403 && code === 'EBADCSRFTOKEN') || (response.status === 401 && (code === 'TOKEN_EXPIRED' || code === 'TOKEN_MISSING')))) {
      config._retry = true;
      try {
        await callRefresh();
        return instance(config);
      } catch (refreshError) {
        if (response.status === 401) endSession();
        throw refreshError;
      }
    }
    if (response.status === 401 && (SESSION_ENDED_CODES.includes(code) || config._retry || config._skipRefresh)) endSession();
    throw error;
  }
);

export default instance;
