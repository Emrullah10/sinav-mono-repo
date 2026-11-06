import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import { useAuthStore, isGuestUser } from '@store/authStore';
import { useBackgroundStore } from '@store/backgroundStore';

// Arka plan seçimi/kaydı. Seçim iyimser uygulanır (anında görünür); sunucu reddederse geri alınır.
export default function useBackground() {
  const guest = useAuthStore((s) => isGuestUser(s.user));
  const ent = useApiQuery(['pay', 'entitlements'], () => api.billingEntitlementsGet(), {
    enabled: !guest,
    meta: { suppressGlobalErrorNotification: true },
  });
  const premium = ent.data?.tier === 'premium';

  const save = useApiMutation((body) => api.identityPreferencesUpdate(body), {
    onMutate: (body) => {
      const s = useBackgroundStore.getState();
      const prev = { selection: s.selection, custom: s.custom };
      if (body.background) s.setSelection(body.background);
      return prev;
    },
    onSuccess: (d) => {
      useBackgroundStore.getState().apply(d);
      queryClient.setQueryData(['me', 'prefs'], d);
    },
    onError: (e, _body, prev) => {
      if (prev) useBackgroundStore.setState(prev);
      notify(getApiErrorMessage(e), 'error');
    },
  });

  return { premium, entLoading: ent.isLoading, save };
}
