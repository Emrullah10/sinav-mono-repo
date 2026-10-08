import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineEndpoints } from 'app-shared';

// endpoints/*.js: her dosya `export default [ { method, path, handler, permission, … } ]` verir.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'endpoints');
const list = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
  list.push(...(await import(`./endpoints/${f}`)).default);
}
export default defineEndpoints(list, { tag: 'learning' });
