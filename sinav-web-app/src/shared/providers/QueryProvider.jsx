import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import i18n from 'i18next';
import { getApiErrorMessage } from '@shared/utils/apiError';
import { notify } from '@shared/utils/notify';

// retry kapalı; global hata toast'ı (meta.suppressGlobalErrorNotification ile kapatılır).
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.suppressGlobalErrorNotification) return;
      notify(getApiErrorMessage(error), 'error');
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _v, _c, mutation) => {
      if (mutation.meta?.suppressGlobalErrorNotification || mutation.options.onError) return;
      notify(getApiErrorMessage(error), 'error');
    },
  }),
});

// Veri adları sunucuda dile göre çevrilir: dil değişince önbellekteki yanıtlar eskir.
i18n.on('languageChanged', () => queryClient.invalidateQueries());

export default function QueryProvider({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
