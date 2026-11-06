import EN from './data-en.js';

// Veriden gelen ad/başlık/açıklama alanlarını istenen dile çevirir (yalnız sözlükte BİREBİR eşleşen metin).
// Soru kökü, metin, kullanıcı girdisi gibi alanlar eşleşmediği için olduğu gibi kalır. Girdi değiştirilmez
// (servis içi önbelleklerdeki nesneler Türkçe kalmalı); düz nesne ve diziler kopyalanır.
const DICTS = { en: EN };
const FIELD = /(name|title|label|description|notice|body|text|license)$/i;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPlain = (v) => v !== null && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

const walk = (v, dict) => {
  if (Array.isArray(v)) return v.map((x) => walk(x, dict));
  if (!isPlain(v)) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = typeof x === 'string' ? (FIELD.test(k) && has(dict, x) ? dict[x] : x) : walk(x, dict);
  return out;
};

/** Tek metni çevirir (sözlükte yoksa aynen döner). */
export const translateDataText = (text, locale) => {
  const dict = DICTS[locale];
  return dict && typeof text === 'string' && has(dict, text) ? dict[text] : text;
};

/** Yanıt verisini çevirir; 'tr' ya da bilinmeyen dilde girdiyi aynen döndürür. */
export const localizeData = (data, locale) => {
  const dict = DICTS[locale];
  return dict ? walk(data, dict) : data;
};
