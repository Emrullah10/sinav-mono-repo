import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawQuery, wrapWithHttpTranslation } from 'app-shared';

// application/*.js dosyalarının her biri `export default (deps) => Object.freeze({ ...useCases })` verir;
// dosya adı (kebab → camel) use-case grubunun adıdır. Yeni grup = yeni dosya (container'a dokunmak gerekmez).
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, 'application');
const camel = (s) => s.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
const makers = {};
for (const f of fs.readdirSync(appDir).filter((x) => x.endsWith('.js')).sort()) {
  makers[camel(f.slice(0, -3))] = (await import(`./application/${f}`)).default;
}

export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn = () => new Date() } = {}) => {
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const deps = { rawQuery: rawQueryFn, nowFn };
  const useCases = {};
  const raw = {};
  deps.uc = raw; // gruplar birbirini deps.uc.<grup>.<fn> ile çağırabilir (tembel; çağrı anında çözülür)
  for (const [name, make] of Object.entries(makers)) {
    raw[name] = make(deps);
    useCases[name] = Object.freeze(Object.fromEntries(Object.entries(raw[name]).map(([k, fn]) => [k, wrap(fn)])));
  }
  return Object.freeze({ deps, useCases: Object.freeze(useCases), raw: Object.freeze(raw) });
};

const container = buildContainer();
export default container;
