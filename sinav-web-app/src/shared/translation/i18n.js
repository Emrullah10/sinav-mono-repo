import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import 'dayjs/locale/en';
import shared from '@sinav/i18n';
import { appResources } from './locales';

const merge = (lang) => ({ translation: { ...shared[lang].translation, ...appResources[lang].translation } });

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { tr: merge('tr'), en: merge('en') },
    fallbackLng: 'tr',
    supportedLngs: ['tr', 'en'],
    nsSeparator: false, // ':' serbest metinde geçebilir
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  });

const sync = (lng) => {
  const l = (lng || 'tr').slice(0, 2);
  document.documentElement.lang = l;
  dayjs.locale(l);
};
i18n.on('languageChanged', sync);
sync(i18n.language);

export default i18n;
