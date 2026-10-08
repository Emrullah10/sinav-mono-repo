// İki kurulum yolunu iki geçici veritabanında kurup şemayı karşılaştırır:
//   A) _combined.sql  B) tüm migration'lar. Fark varsa çıkış 1.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const base = new URL(process.env.CORE_APP_DB_CONNECTION_STRING);

const build = (db, extra) => {
  const r = spawnSync('node', ['scripts/db-fresh.mjs', `--db=${db}`, ...extra], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`${db} kurulamadı`); }
};
const snapshot = async (db) => {
  const u = new URL(base); u.pathname = `/${db}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  const q = async (sql) => (await c.query(sql)).rows.map((r) => Object.values(r).join('|'));
  const out = {
    columns: await q(`SELECT table_schema, table_name, column_name, data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name <> 'schema_migrations' ORDER BY 1,2,3`),
    constraints: await q(`SELECT n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relname <> 'schema_migrations' ORDER BY 1,2,3`),
    indexes: await q(`SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') AND tablename <> 'schema_migrations' ORDER BY 1,2,3`),
    triggers: await q(`SELECT event_object_schema, event_object_table, trigger_name FROM information_schema.triggers ORDER BY 1,2,3`),
    seeds: await q(`SELECT 'role_permission', count(*) FROM enums.role_permission UNION ALL SELECT 'organization', count(*) FROM identity.organization UNION ALL SELECT 'tenant', count(*) FROM identity.tenant`),
  };
  await c.end();
  return out;
};
const drop = async (db) => {
  const u = new URL(base); u.pathname = '/postgres';
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect(); await c.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`); await c.end();
};

build('sinav_verify_a', []);
build('sinav_verify_b', ['--migrations']);
const a = await snapshot('sinav_verify_a');
const b = await snapshot('sinav_verify_b');
await drop('sinav_verify_a'); await drop('sinav_verify_b');
let bad = false;
for (const k of Object.keys(a)) {
  const A = new Set(a[k]), B = new Set(b[k]);
  const onlyA = a[k].filter((x) => !B.has(x)), onlyB = b[k].filter((x) => !A.has(x));
  if (onlyA.length || onlyB.length) { bad = true; console.log(`FARK ${k}: _combined'da ${onlyA.length}, migration'da ${onlyB.length}`, onlyA.slice(0, 3), onlyB.slice(0, 3)); }
  else console.log(`✓ ${k}: ${a[k].length} satır aynı`);
}
process.exit(bad ? 1 : 0);
