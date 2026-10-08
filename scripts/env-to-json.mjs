#!/usr/bin/env node
/**
 * `../env/.env` (shell biçimi) → ecosystem'in beklediği ENV_FILE JSON'u.
 * oregon-mono-repo `scripts/env-to-json.mjs` ile aynı sözleşme (2026-09-04:
 * kullanıcı "staging'i infra profiliyle değil ../env/.env ile güncelle,
 * oregon gibi olsun" dedi).
 *
 * ── ANAHTAR KÜMESİ ENV DOSYASINDAN GELİR, `.env.example`TEN DEĞİL ───────────
 * Anahtarları `.env.example`ten süzmek SESSİZ VERİ KAYBI olurdu: kodda
 * kullanılan ama örnek dosyada olmayan anahtarlar (`OTP_BACKDOOR_EXCLUDE`,
 * `SMS_CREDIT_ALERT_EMAILS`, `SMTP_*` …) pm2'ye hiç ulaşmaz; servis ayağa
 * kalkar, hata vermez, yanlış davranır.
 *
 * Doğrusu: operatörün env dosyasına YAZDIĞI her anahtar geçer. Anahtar adları
 * dosyanın KENDİSİNDEN okunur (source edilen shell'den değil), böylece PATH/HOME
 * gibi kabuk değişkenleri JSON'a sızmaz.
 *
 * `.env.example` yalnız EKSİK ANAHTAR UYARISI için kullanılır.
 *
 * Kullanım: <env sourced> node scripts/env-to-json.mjs <cikti.json> <env-dosyasi> [.env.example]
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const [outPath, envPath, examplePath = '.env.example'] = process.argv.slice(2);
if (!outPath || !envPath) {
  console.error('kullanım: env-to-json.mjs <cikti.json> <env-dosyasi> [.env.example]');
  process.exit(2);
}

/** Bir env dosyasındaki anahtar adları (yorum ve boş satırlar atlanır). */
const keysOf = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => (l.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/) || [])[1])
    .filter(Boolean);

const declared = [...new Set(keysOf(envPath))];

const out = {};
const empty = [];
for (const k of declared) {
  const v = process.env[k];
  // Boş değer ATLANIR: pm2'ye "" vermek "tanımlı ama boş" demektir ve
  // `process.env.X || varsayilan` kontrollerini sessizce bozar.
  if (v === undefined || v === '') empty.push(k);
  else out[k] = String(v);
}

// Göreli yol = her serviste BAŞKA bir dosya: pm2 her servisi kendi dizininde
// çalıştırır (ecosystem cwd = services/<ad>). Yüksek sesle reddedilir.
const relPaths = Object.entries(out)
  .filter(([k, v]) => /_PATH$/.test(k) && !v.startsWith('/'))
  .map(([k, v]) => `${k}=${v}`);
if (relPaths.length) {
  console.error('HATA: yol değerleri MUTLAK olmalı (pm2 servisleri kendi dizinlerinde çalıştırır):');
  for (const r of relPaths) console.error('      ' + r);
  process.exit(1);
}

if (!Object.keys(out).length) {
  console.error(`HATA: ${envPath} icinde hic anahtar yok — yanlis dosya mi?`);
  process.exit(1);
}

writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
console.log(`    ${Object.keys(out).length} anahtar yazildi -> ${outPath}`);

if (empty.length) {
  console.warn(`    UYARI: env dosyasinda tanimli ama BOS ${empty.length} anahtar (atlandi):`);
  console.warn('      ' + empty.join(', '));
}

if (existsSync(examplePath)) {
  const missing = keysOf(examplePath).filter((k) => !(k in out));
  if (missing.length) {
    console.warn(`    UYARI: .env.example icinde olup env dosyasinda OLMAYAN ${missing.length} anahtar:`);
    console.warn('      ' + missing.join(', '));
  }
}
