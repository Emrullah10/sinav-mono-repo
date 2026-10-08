// Seed yardımcıları: bağlantı, ekleme/upsert, rapor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const SEED_DIR = process.env.SEED_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db-schemas/seed/yds');

export class PgArr { constructor(a) { this.a = a; } }

const prep = (v) => {
  if (v === undefined) return null;
  if (v instanceof PgArr) return v.a;
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
};

export const connect = async () => {
  const c = new pg.Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5434),
    user: process.env.PGUSER || 'sinav_dev', password: process.env.PGPASSWORD || 'dev_pass', database: process.env.PGDATABASE || 'sinav',
  });
  await c.connect();
  return c;
};

export const makeCtx = async (db) => {
  const t = await db.query(`SELECT tenant_code FROM identity.tenant WHERE tenant_slug='sinav'`);
  if (!t.rows[0]) throw new Error('tenant "sinav" yok (10-seed-data migration çalışmamış)');
  const o = await db.query(`SELECT organization_id FROM identity.organization WHERE organization_tenant_code=$1 AND organization_type='platform'`, [t.rows[0].tenant_code]);
  if (!o.rows[0]) throw new Error('platform organizasyonu yok');
  return { db, tenant: t.rows[0].tenant_code, org: o.rows[0].organization_id, m: {} };
};

export const insert = async (ctx, schema, table, data, { noScope = false } = {}) => {
  const all = noScope ? data : { tenant_code: ctx.tenant, organization_id: ctx.org, ...data };
  const keys = Object.keys(all);
  const sql = `INSERT INTO ${schema}.${table} (${keys.map((k) => `${table}_${k}`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${table}_id AS id`;
  const r = await ctx.db.query(sql, keys.map((k) => prep(all[k])));
  return r.rows[0].id;
};

// where = doğal anahtar (kısa kolon adları). Varsa data ile günceller (updateData=false ise dokunmaz).
export const upsert = async (ctx, schema, table, where, data = {}, { update = true } = {}) => {
  const wk = Object.keys(where);
  const params = wk.filter((k) => where[k] !== null).map((k) => prep(where[k]));
  let n = 0;
  const conds2 = wk.map((k) => (where[k] === null ? `${table}_${k} IS NULL` : `${table}_${k} = $${++n}`));
  const sel = await ctx.db.query(`SELECT ${table}_id AS id FROM ${schema}.${table} WHERE ${table}_tenant_code = $${n + 1} AND ${conds2.join(' AND ')}`, [...params, ctx.tenant]);
  if (sel.rows[0]) {
    const id = sel.rows[0].id;
    const dk = Object.keys(data);
    if (update && dk.length) {
      await ctx.db.query(`UPDATE ${schema}.${table} SET ${dk.map((k, i) => `${table}_${k}=$${i + 1}`).join(',')} WHERE ${table}_id=$${dk.length + 1}`, [...dk.map((k) => prep(data[k])), id]);
    }
    return { id, created: false };
  }
  return { id: await insert(ctx, schema, table, { ...where, ...data }), created: true };
};

export const sp = async (ctx, fn) => {
  await ctx.db.query('SAVEPOINT rec');
  try { const r = await fn(); await ctx.db.query('RELEASE SAVEPOINT rec'); return r; }
  catch (e) { await ctx.db.query('ROLLBACK TO SAVEPOINT rec'); throw e; }
};

export const tx = async (ctx, fn) => {
  // --dry: dış transaction index.mjs'te açılır ve en sonda geri alınır; burada savepoint kullanılır
  const begin = ctx.dry ? 'SAVEPOINT txn' : 'BEGIN', commit = ctx.dry ? 'RELEASE SAVEPOINT txn' : 'COMMIT', rb = ctx.dry ? 'ROLLBACK TO SAVEPOINT txn' : 'ROLLBACK';
  await ctx.db.query(begin);
  try { const r = await fn(); await ctx.db.query(commit); return r; }
  catch (e) { await ctx.db.query(rb); throw e; }
};

export const readJson = (file) => {
  const p = path.join(SEED_DIR, file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { const err = new Error(`JSON okunamadı: ${e.message}`); err.parse = true; throw err; }
};

export const listFiles = (re) => (fs.existsSync(SEED_DIR) ? fs.readdirSync(SEED_DIR).filter((f) => re.test(f)).sort() : []);

export const newRep = (file) => ({ file, counts: {}, errors: [], warnings: [], notes: [] });
export const bump = (rep, label, created = true) => {
  const c = (rep.counts[label] ??= { total: 0, created: 0 });
  c.total += 1; if (created) c.created += 1;
};
export const err = (rep, id, msg) => rep.errors.push(`${id}: ${msg}`);
export const printRep = (rep) => {
  const parts = Object.entries(rep.counts).map(([k, v]) => `${k} ${v.total} (${v.created} yeni)`);
  console.log(`\n== ${rep.file}: ${parts.join(', ') || 'kayıt yok'}${rep.errors.length ? `, ${rep.errors.length} HATA` : ''}`);
  for (const n of rep.notes) console.log(`   ${n}`);
  for (const w of rep.warnings) console.log(`   UYARI ${w}`);
  for (const e of rep.errors) console.log(`   HATA ${e}`);
};
