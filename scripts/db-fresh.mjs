// Boş veritabanı kurar: build-schema → DROP/CREATE → _combined.sql → ledger baseline.
// --migrations: _combined yerine tüm migration'ları sırayla çalıştırır.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const useMigrations = process.argv.includes('--migrations');
const target = new URL(process.env.CORE_APP_DB_CONNECTION_STRING);
const dbName = process.argv.find((a) => a.startsWith('--db='))?.slice(5) || target.pathname.slice(1);

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, ...(dbName !== target.pathname.slice(1) ? { CORE_APP_DB_CONNECTION_STRING: `${target.protocol}//${target.username}:${target.password}@${target.host}/${dbName}` } : {}) } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} başarısız`);
};

run('node', ['scripts/build-schema.js']);
const admin = new URL(target); admin.pathname = '/postgres';
const c = new pg.Client({ connectionString: admin.toString() });
await c.connect();
await c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await c.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
await c.end();

const dbUrl = new URL(target); dbUrl.pathname = `/${dbName}`;
const d = new pg.Client({ connectionString: dbUrl.toString() });
await d.connect();
if (!useMigrations) {
  await d.query(fs.readFileSync(path.join(ROOT, 'db-schemas/_combined.sql'), 'utf8'));
  await d.end();
  run('node', ['scripts/apply-migrations.mjs', '--baseline', '--yes']);
} else {
  await d.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_by TEXT NOT NULL DEFAULT current_user, baselined BOOLEAN NOT NULL DEFAULT FALSE)`);
  await d.end();
  run('node', ['scripts/apply-migrations.mjs', '--pending']);
}
console.log(`✓ ${dbName} hazır (${useMigrations ? 'migration yolu' : '_combined yolu'})`);
