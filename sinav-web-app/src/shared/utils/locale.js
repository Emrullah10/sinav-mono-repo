import i18n from 'i18next';

// Sayı/para biçimi arayüz diline göre (İngilizcede ondalık nokta). Bileşenler useTranslation ile dil değişiminde yeniden çizilir.
export const numberLocale = () => (i18n.language?.startsWith('en') ? 'en-GB' : 'tr-TR');
export const formatNumber = (n, opts) => Number(n).toLocaleString(numberLocale(), opts);
