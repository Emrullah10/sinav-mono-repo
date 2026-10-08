// keys/*.js dosyalarını tarayıp index.js üretir (bundler'lar için açık import).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(path.join(HERE, 'keys')).filter((f) => f.endsWith('Keys.js')).sort();
const names = files.map((f) => f.replace('.js', ''));
const out = `// ÜRETİLDİ: node packages/i18n/build-index.mjs
${files.map((f, i) => `import ${names[i]} from './keys/${f}';`).join('\n')}

export const keys = { ${names.map((n) => `...${n}`).join(', ')} };
const pick = (lang) => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v[lang] ?? v.tr]));
export const resources = { tr: { translation: pick('tr') }, en: { translation: pick('en') } };
export default resources;
`;
fs.writeFileSync(path.join(HERE, 'index.js'), out);
console.log('i18n index:', files.length, 'dosya');
