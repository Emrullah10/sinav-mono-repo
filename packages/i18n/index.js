// ÜRETİLDİ: node packages/i18n/build-index.mjs
import apiErrorsCommonKeys from './keys/apiErrorsCommonKeys.js';
import apiErrorsIdentityKeys from './keys/apiErrorsIdentityKeys.js';

export const keys = { ...apiErrorsCommonKeys, ...apiErrorsIdentityKeys };
const pick = (lang) => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v[lang] ?? v.tr]));
export const resources = { tr: { translation: pick('tr') }, en: { translation: pick('en') } };
export default resources;
