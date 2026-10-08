import datasources from 'app-datasource';
import { localDate } from '../domain/study-day.js';
import { getEntitlements } from './entitlement-read.js';
import { DomainError } from '../api/domain-error.js';

// Redis 19: usage:{userId}:{feature}:{periodKey}. Eksikse dönem sayısı Postgres'ten (kayıtlı seed
// fonksiyonuyla) alınıp SET NX ile kurulur; limit aşımı yalnız eşzamanlı istek kadar şişebilir.
const seeds = new Map();
export const registerUsageSeed = (feature, fn) => seeds.set(feature, fn);

const redis = () => datasources.coreAppRedis?.client;
const LUA_CONSUME = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '-1')
if cur < 0 then return -2 end
local lim = tonumber(ARGV[1]); local n = tonumber(ARGV[2])
if lim >= 0 and cur + n > lim then return -1 end
local v = redis.call('INCRBY', KEYS[1], n)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return v`;

export const periodKeyFor = (period, tz, now = new Date()) => {
  const d = localDate(now, tz);
  return period === 'month' ? d.slice(0, 7) : d;
};
const ttlFor = (period) => (period === 'month' ? 40 * 86400 : 2 * 86400);
const usageKey = (userId, feature, pk) => `usage:${userId}:${feature}:${pk}`;

const rangeFor = (period, pk) => {
  if (period === 'month') {
    const [y, m] = pk.split('-').map(Number);
    return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
  }
  return { from: new Date(`${pk}T00:00:00Z`), to: new Date(new Date(`${pk}T00:00:00Z`).getTime() + 86400000) };
};

const ensureKey = async (r, userId, feature, period, pk, tz) => {
  const k = usageKey(userId, feature, pk);
  if (await r.exists(k)) return k;
  let base = 0;
  const seed = seeds.get(feature);
  if (seed) {
    try {
      const { from, to } = rangeFor(period, pk);
      base = Number(await seed({ userId, from, to, tz, periodKey: pk })) || 0;
    } catch (e) {
      console.error('[usage] seed failed', feature, e.message);
    }
  }
  await r.set(k, String(base), 'EX', ttlFor(period), 'NX');
  return k;
};

export const peekUsage = async ({ userId, feature, tz = 'Europe/Istanbul', now = new Date() }) => {
  const ent = await getEntitlements(userId);
  const f = ent.features[feature] || { enabled: false, limit: 0, period: 'day' };
  const period = f.period || 'day';
  const pk = periodKeyFor(period, tz, now);
  let used = 0;
  const r = redis();
  if (r) {
    const k = await ensureKey(r, userId, feature, period, pk, tz);
    used = Number(await r.get(k)) || 0;
  }
  return { feature, enabled: f.enabled, limit: f.limit, period, used, remaining: f.limit === null ? null : Math.max(0, f.limit - used), periodKey: pk };
};

/** Kota tüket; aşımda 402 QUOTA_EXCEEDED (details: feature/limit/period). */
export const consumeQuota = async ({ userId, feature, n = 1, tz = 'Europe/Istanbul', now = new Date() }) => {
  const ent = await getEntitlements(userId);
  const f = ent.features[feature];
  if (!f || !f.enabled) throw new DomainError('QUOTA_EXCEEDED', 'Feature not available', { feature, limit: 0, period: 'day', tier: ent.tier });
  if (f.limit === null) return { used: null, limit: null };
  const period = f.period || 'day';
  const pk = periodKeyFor(period, tz, now);
  const r = redis();
  if (!r) return { used: null, limit: f.limit };
  const k = await ensureKey(r, userId, feature, period, pk, tz);
  const res = Number(await r.eval(LUA_CONSUME, 1, k, f.limit, n, ttlFor(period)));
  if (res === -1) throw new DomainError('QUOTA_EXCEEDED', 'Quota exceeded', { feature, limit: f.limit, period, tier: ent.tier });
  return { used: res, limit: f.limit, period };
};

export const refundQuota = async ({ userId, feature, n = 1, tz = 'Europe/Istanbul', now = new Date() }) => {
  const ent = await getEntitlements(userId);
  const f = ent.features[feature];
  if (!f || f.limit === null) return;
  const r = redis();
  if (!r) return;
  const k = usageKey(userId, feature, periodKeyFor(f.period || 'day', tz, now));
  if (await r.exists(k)) await r.decrby(k, n);
};
