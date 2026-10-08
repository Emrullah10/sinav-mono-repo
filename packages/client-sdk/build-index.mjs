// src/<servis>.js dosyalarını tarayıp index.js üretir: createApi(http) tüm servisleri tek düz nesnede birleştirir
// (fonksiyon adları servis önekli ve benzersiz; çakışma açılışta hata verir).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(path.join(HERE, 'src')).filter((f) => f.endsWith('.js') && !['queryKeys.js', 'deepLinks.js', 'errors.js'].includes(f)).sort();
const fac = files.map((f) => ({ f, name: `create${f[0].toUpperCase()}${f.slice(1, -3)}Api` }));
const out = `// ÜRETİLDİ: node packages/client-sdk/build-index.mjs
${fac.map((x) => `import { ${x.name} } from './src/${x.f}';`).join('\n')}
export * from './src/queryKeys.js';
export * from './src/deepLinks.js';
export * from './src/errors.js';

export const createApi = (http, opts = {}) => {
  const parts = [${fac.map((x) => `${x.name}(http, opts)`).join(', ')}];
  const api = {};
  for (const part of parts) {
    for (const [k, fn] of Object.entries(part)) {
      if (api[k]) throw new Error(\`client-sdk: yinelenen fonksiyon adı \${k}\`);
      api[k] = fn;
    }
  }
  return api;
};
export default createApi;
`;
fs.writeFileSync(path.join(HERE, 'index.js'), out);
console.log('client-sdk index:', files.length, 'modül');
