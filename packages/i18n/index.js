// ÜRETİLDİ: node packages/i18n/build-index.mjs
import apiErrorsBillingKeys from './keys/apiErrorsBillingKeys.js';
import apiErrorsCommonKeys from './keys/apiErrorsCommonKeys.js';
import apiErrorsIdentityKeys from './keys/apiErrorsIdentityKeys.js';
import apiErrorsTutorKeys from './keys/apiErrorsTutorKeys.js';
import enumsBillingKeys from './keys/enumsBillingKeys.js';
import enumsTutorKeys from './keys/enumsTutorKeys.js';

export const keys = { ...apiErrorsBillingKeys, ...apiErrorsCommonKeys, ...apiErrorsIdentityKeys, ...apiErrorsTutorKeys, ...enumsBillingKeys, ...enumsTutorKeys };
const pick = (lang) => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v[lang] ?? v.tr]));
export const resources = { tr: { translation: pick('tr') }, en: { translation: pick('en') } };
export default resources;
