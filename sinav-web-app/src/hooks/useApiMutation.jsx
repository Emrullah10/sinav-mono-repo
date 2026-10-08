import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';

// mutationFn bir axios yanıtı döndürür; data.data açılır. successMessage i18n anahtarıdır.
export default function useApiMutation(fn, { successMessage, onSuccess, onError, ...options } = {}) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (vars) => (await fn(vars))?.data?.data,
    ...options,
    onSuccess: (data, vars, ctx) => {
      if (successMessage) notify(t(successMessage), 'success');
      onSuccess?.(data, vars, ctx);
    },
    onError: onError || ((error) => notify(getApiErrorMessage(error), 'error')),
  });
}
