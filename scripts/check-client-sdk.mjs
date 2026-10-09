// İstemci SDK sözleşme denetimi: packages/client-sdk/src/<servis>.js içindeki her (yöntem, yol) çiftinin
// ilgili servisin OpenAPI tanımında bulunduğunu doğrular. Sapma varsa çıkış 1. (npm run check:contract)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'packages/client-sdk/src');
let bad = 0;
const defs = {};
const loadDef = async (svc) => {
  if (defs[svc]) return defs[svc];
  const file = path.join(ROOT, `services/sinav-service-${svc}/definitions/rest-api-definition.js`);
  if (!fs.existsSync(file)) return (defs[svc] = null);
  defs[svc] = (await import(pathToFileURL(file).href)).default.paths || {};
  return defs[svc];
};
const toRegex = (p) => new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$');

for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.js') && !['queryKeys.js', 'deepLinks.js', 'errors.js', 'gateway.js'].includes(x))) {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  const m = /const B = `\$\{api\}\/sinav-service-([a-z]+)\/v1`/.exec(text);
  if (!m) { console.log(`- ${f}: B tanımı yok, atlandı`); continue; }
  const svc = m[1];
  const paths = await loadDef(svc);
  if (!paths) { console.log(`✗ ${f}: servis tanımı yok (${svc})`); bad += 1; continue; }
  const entries = Object.entries(paths).map(([p, ops]) => ({ p, re: toRegex(`/v1${p.replace(/^\/v1/, '')}`), methods: Object.keys(ops) }));
  let n = 0;
  for (const c of text.matchAll(/http\.(get|post|put|patch|delete)\(\s*`\$\{B\}([^`]*)`/g)) {
    const method = c[1];
    const p = '/v1' + c[2].replace(/\$\{[^}]+\}/g, 'X').split('?')[0];
    const hit = entries.find((e) => e.re.test(p.replace(/X/g, 'x')) && e.methods.includes(method));
    n += 1;
    if (!hit) { console.log(`✗ ${f}: ${method.toUpperCase()} ${p} servis tanımında yok`); bad += 1; }
  }
  console.log(`✓ ${f}: ${n} uç denetlendi`);
}
process.exit(bad ? 1 : 0);
