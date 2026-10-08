// keys/<alan>Keys.js dosyalarını birleştirir: { anahtar: { tr, en } } → i18next kaynakları. Yeni alan = yeni dosya.
const files = import.meta.glob('./keys/*Keys.js', { eager: true });
export const appKeys = Object.assign({}, ...Object.values(files).map((m) => m.default));
const pick = (lang) => Object.fromEntries(Object.entries(appKeys).map(([k, v]) => [k, v[lang] ?? v.tr]));
export const appResources = { tr: { translation: pick('tr') }, en: { translation: pick('en') } };
