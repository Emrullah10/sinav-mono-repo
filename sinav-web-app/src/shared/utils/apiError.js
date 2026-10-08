import i18n from '@shared/translation/i18n';
import { apiErrorCode, apiErrorDetails } from '@sinav/client-sdk';

// Sıra: apiErrors.<KOD> çevirisi → backend mesajı → varsayılan.
export const getApiErrorKey = (error, fallback = 'apiErrors.defaultErrorMessage') => {
  const code = apiErrorCode(error);
  if (code && i18n.exists(`apiErrors.${code}`)) return `apiErrors.${code}`;
  return fallback;
};
export const getApiErrorMessage = (error, fallback) => {
  const key = getApiErrorKey(error, fallback);
  if (!error?.response && error?.message === 'Network Error') return i18n.t('errors.network');
  return i18n.t(key, apiErrorDetails(error) || {});
};
export { apiErrorCode, apiErrorDetails };
