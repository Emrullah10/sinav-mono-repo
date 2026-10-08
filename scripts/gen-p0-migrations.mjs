// Base SQL dosyalarından (00..08, 10) P0 başlangıç migration'larını üretir. Aynı şemayı iki yoldan
// (taze: _combined.sql, çalışan: migration) kurmanın tutarlılığı verify-schema-paths.mjs ile doğrulanır.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = path.join(ROOT, 'db-schemas');
const OUT = path.join(SQL, 'migrations');
const DATE = '2026-10-08';
const files = fs.readdirSync(SQL).filter((f) => /^(0\d|10)-.*\.sql$/.test(f)).sort();
let n = 0;
for (const f of files) {
  n += 1;
  const name = f.replace(/^\d+-/, '').replace(/-schema\.sql$|\.sql$/g, '');
  const body = fs.readFileSync(path.join(SQL, f), 'utf8');
  const out = `-- P0 başlangıç şeması: ${f} (docs/PLAN-P0.md §2).\n--\n-- NEDEN: çalışan veritabanlarının taze kurulumla aynı şemaya ulaşması.\n-- Idempotent değil; defter (public.schema_migrations) her dosyayı bir kez çalıştırır.\n-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs ${DATE}-${n}-p0-${name}.sql\nBEGIN;\n\n${body}\n\nCOMMIT;\n`;
  fs.writeFileSync(path.join(OUT, `${DATE}-${n}-p0-${name}.sql`), out);
}
const roleGuard = `DO $guard$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sinav_svc') THEN\n    CREATE ROLE sinav_svc NOLOGIN; -- üretimde A00-bootstrap LOGIN ile kurar; dev'de yalnız yetki hedefi\n  END IF;\nEND\n$guard$;\n`;
const grant = roleGuard + '\n' + fs.readFileSync(path.join(SQL, 'A99-grants.sql'), 'utf8');
console.log('migration dosyaları:', n);
fs.writeFileSync(path.join(OUT, `${DATE}-${n + 1}-grant-p0.sql`), `-- P0 tabloları için servis rolü yetkileri (şablon §4.5; idempotent).\nBEGIN;\n${grant}\nCOMMIT;\n`);
