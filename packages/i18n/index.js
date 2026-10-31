// ÜRETİLDİ: node packages/i18n/build-index.mjs
import apiErrorsBillingKeys from './keys/apiErrorsBillingKeys.js';
import apiErrorsCommonKeys from './keys/apiErrorsCommonKeys.js';
import apiErrorsContentKeys from './keys/apiErrorsContentKeys.js';
import apiErrorsIdentityKeys from './keys/apiErrorsIdentityKeys.js';
import apiErrorsLearningKeys from './keys/apiErrorsLearningKeys.js';
import apiErrorsTutorKeys from './keys/apiErrorsTutorKeys.js';
import enumsBillingKeys from './keys/enumsBillingKeys.js';
import enumsContentKeys from './keys/enumsContentKeys.js';
import enumsLearningKeys from './keys/enumsLearningKeys.js';
import enumsTutorKeys from './keys/enumsTutorKeys.js';
import feedbackKeys from './keys/feedbackKeys.js';
import lexiconKeys from './keys/lexiconKeys.js';

export const keys = { ...apiErrorsBillingKeys, ...apiErrorsCommonKeys, ...apiErrorsContentKeys, ...apiErrorsIdentityKeys, ...apiErrorsLearningKeys, ...apiErrorsTutorKeys, ...enumsBillingKeys, ...enumsContentKeys, ...enumsLearningKeys, ...enumsTutorKeys, ...feedbackKeys, ...lexiconKeys };
const pick = (lang) => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v[lang] ?? v.tr]));
export const resources = { tr: { translation: pick('tr') }, en: { translation: pick('en') } };
export default resources;
