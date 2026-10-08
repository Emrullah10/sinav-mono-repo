import datasources from 'app-datasource';
import { DomainError, PERMISSIONS as P } from 'app-shared';

export const num = (v) => (v === null || v === undefined ? null : Number(v));
export const iso = (d) => (d ? new Date(d).toISOString() : null);
export const dateOnly = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const timeOnly = (t) => (t ? String(t).slice(0, 5) : null);
export const toCode = (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
};
export const reqCode = (v, errCode = 'CONTENT_ITEM_NOT_FOUND', msg = 'Not found') => {
  const n = toCode(v);
  if (!n) throw new DomainError(errCode, msg);
  return n;
};
export const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));
export const clampInt = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};
export const pageOf = (query, { defSize = 20, maxSize = 100 } = {}) => {
  const page = clampInt(query?.page, 1, 1, 100000);
  const pageSize = clampInt(query?.pageSize, defSize, 1, maxSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
};
export const like = (s) => `%${String(s).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
export const trunc = (s, n) => (s == null ? null : String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

export const camel = (s) => s.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
/** `question_stem` → `stem` (önek kırpılır, camelCase). */
export const stripRow = (prefix, row, omit = []) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    let key = k.startsWith(`${prefix}_`) ? k.slice(prefix.length + 1) : k;
    key = camel(key);
    if (omit.includes(key)) continue;
    out[key] = v;
  }
  return out;
};

export const normalizeHeadword = (w) => String(w || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

export const hasPerm = (caller, perm) => (caller?.callerPermissionList || []).includes(perm);
export const assertAnyPerm = (caller, perms) => {
  if (!perms.some((p) => hasPerm(caller, p))) throw new DomainError('CONTENT_FORBIDDEN', 'Permission required', { required: perms }, 403);
};
export const PERM = P;

// ── Redis (coreAppRedis) ──
export const redis = () => datasources.coreAppRedis?.client;
export const CATALOG_VER_KEY = 'content:catalog:ver';
export const catalogVersion = async () => {
  try {
    const v = await redis()?.get(CATALOG_VER_KEY);
    return v ? Number(v) : 1;
  } catch { return 1; }
};
export const bumpCatalogVersion = async () => {
  try { return await redis()?.incr(CATALOG_VER_KEY); } catch { return null; }
};
export const cacheGetJson = async (key) => {
  try {
    const v = await redis()?.get(key);
    return v === null || v === undefined ? undefined : JSON.parse(v);
  } catch { return undefined; }
};
export const cacheSetJson = async (key, value, ttl) => {
  try { await redis()?.set(key, JSON.stringify(value), 'EX', ttl); } catch { /* best-effort */ }
};
export const cacheDel = async (...keys) => {
  try { if (keys.length) await redis()?.del(...keys); } catch { /* best-effort */ }
};
export const itemPubKey = (code) => `content:item:${code}:pub`;
export const vocabKey = (lang, headword) => `content:vocab:${lang}:${normalizeHeadword(headword)}`;

// ── Platform bağlamı: içerik sahibi organizasyon ──
let platformCache = null;
export const getPlatform = async (rawQuery) => {
  if (platformCache) return platformCache;
  const { rows } = await rawQuery(
    `SELECT o.organization_id AS "organizationId", o.organization_tenant_code AS "tenantCode"
       FROM identity.organization o WHERE o.organization_type = 'platform' ORDER BY o.organization_id LIMIT 1`);
  if (!rows.length) throw new Error('platform organizasyonu bulunamadı');
  platformCache = { organizationId: Number(rows[0].organizationId), tenantCode: Number(rows[0].tenantCode) };
  return platformCache;
};

export const userRef = (code, name) => (code ? { code: Number(code), displayName: name || null } : null);

export const looseEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
