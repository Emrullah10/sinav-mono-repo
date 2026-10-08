// Derleme anında public GET'ler. Son başarılı çekim src/data/<ad>.cache.json olarak commit'lenir;
// API kapalıysa derleme bu dosyayla çıkar (şablon §17).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data');
const BASE = process.env.PUBLIC_API_BASE_URL || 'http://127.0.0.1:2000';

export const publicGet = async (name, urlPath) => {
  const file = path.join(DATA, `${name}.cache.json`);
  try {
    const res = await fetch(`${BASE}/api/${urlPath}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.code || 'api error');
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json.data));
    return json.data;
  } catch (e) {
    if (fs.existsSync(file)) {
      console.warn(`[landing] ${name}: API yok (${e.message}), önbellek kullanılıyor`);
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    throw new Error(`[landing] ${name}: API yok ve önbellek de yok (${e.message})`);
  }
};
export const API_BASE = BASE;
export const APP_URL = process.env.PUBLIC_APP_URL || 'http://127.0.0.1:3000';
