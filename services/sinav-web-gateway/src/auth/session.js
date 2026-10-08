import crypto from 'crypto';
import datasources from 'app-datasource';
import { signAccess } from './jwt.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTtlFor,
} from './refresh.js';

// ⚠️ Anahtar semasi artik PAYLASILAN modulde (app-shared/auth/session-store).
// 2026-08-03: identity servisi de oturum iptal etmek zorunda kaldi
// (organizasyon askiya alininca). Semayi oraya KOPYALAMAK, iki ucun sessizce
// ayrismasi riskini dogururdu — "iptal ettim" diyen kod baska bir anahtari
// siler ve kimse fark etmez. Tek kaynak, iki tuketici.
// Davranis DEGISMEDI: ayni adlar, ayni bicim.
import {
  sessionKey,
  refreshIdxKey,
  userSessionsKey,
  jtiBlacklistKey,
  roleSessionsKey,
} from 'app-shared';

// Eşzamanlı (çok-sekme) refresh yarışında, yeni rotate edilmiş token'ı bu süre
// boyunca "aynı mantıksal rotasyon" kabul et — yanlış RT_REUSED ile session'ı
// yok edip kullanıcıyı atmamak için. Gerçek replay tespiti bu pencere kadar
// körleşir (kabul edilen ödünleşim); pencere sonrası eski index expire olur.
const GRACE_SECONDS = 30;

const redis = () => datasources.serviceDiscoveryRedis.client;

const buildClaims = (user, sid) => ({
  sub: String(user.userAccountId),
  sid,
  tenantCode: user.userAccountTenantCode,
  organizationId: user.userAccountOrganizationId,
  role: user.userAccountRole,
  organizationType: user.userAccountOrganizationType ?? null,
});

const createSession = async ({ user, perms = [], ip, userAgent, clientType = 'web', deviceId = '', appVersion = '' }) => {
  const REFRESH_TTL_SECONDS = refreshTtlFor(clientType);
  const sid = crypto.randomBytes(16).toString('hex');
  const { token: refreshToken, hash } = generateRefreshToken();
  const claims = { ...buildClaims(user, sid), perms };
  const { token: jwt, jti, exp } = signAccess(claims);

  const now = Math.floor(Date.now() / 1000);
  const sessionRecord = {
    userId: String(user.userAccountId),
    tenantCode: user.userAccountTenantCode || '',
    organizationId: String(user.userAccountOrganizationId || ''),
    role: user.userAccountRole || '',
    organizationType: user.userAccountOrganizationType || '',
    refreshHash: hash,
    perms: JSON.stringify(perms),
    createdAt: String(now),
    lastUsedAt: String(now),
    ip: ip || '',
    userAgent: userAgent || '',
    clientType,
    deviceId,
    appVersion,
  };

  const client = redis();
  const pipe = client.multi();
  pipe.hset(sessionKey(sid), sessionRecord);
  pipe.expire(sessionKey(sid), REFRESH_TTL_SECONDS);
  pipe.set(refreshIdxKey(hash), sid, 'EX', REFRESH_TTL_SECONDS);
  pipe.sadd(userSessionsKey(user.userAccountId), sid);
  pipe.expire(userSessionsKey(user.userAccountId), REFRESH_TTL_SECONDS);
  if (user.userAccountRole) {
    pipe.sadd(roleSessionsKey(user.userAccountRole), sid);
    pipe.expire(roleSessionsKey(user.userAccountRole), REFRESH_TTL_SECONDS);
  }
  await pipe.exec();

  return { jwt, refreshToken, sid, jti, exp };
};

const rotateSession = async ({ refreshToken }) => {
  const client = redis();
  const oldHash = hashRefreshToken(refreshToken);
  const sid = await client.get(refreshIdxKey(oldHash));
  if (!sid) {
    const err = new Error('RT_INVALID');
    err.code = 'RT_INVALID';
    throw err;
  }

  const session = await client.hgetall(sessionKey(sid));
  if (!session || !session.userId) {
    const err = new Error('SESSION_GONE');
    err.code = 'SESSION_GONE';
    throw err;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  // Süpersede edilecek (geçersiz kılınan) hash. Normalde === oldHash. Ancak
  // eşzamanlı refresh'te oldHash, grace penceresi içinde yeni rotate edilmiş
  // bir token olabilir — bunu reuse sayıp session'ı yok etmek yerine aynı
  // mantıksal rotasyon kabul ediyoruz (yoksa idle sonrası iki sekme de logout).
  let supersededHash = oldHash;
  if (session.refreshHash !== oldHash) {
    const withinGrace =
      session.previousRefreshHash === oldHash &&
      session.rotatedAt &&
      nowSec - Number(session.rotatedAt) <= GRACE_SECONDS;
    if (!withinGrace) {
      await revokeSession({ sid, userId: session.userId, role: session.role });
      const err = new Error('RT_REUSED');
      err.code = 'RT_REUSED';
      throw err;
    }
    // Grace: mevcut hash'i süpersede et ve onu kısa süre canlı tut ki o token'ı
    // hâlâ tutan diğer sekme de bir sonraki refresh'te geçebilsin.
    supersededHash = session.refreshHash;
  }

  const { token: newRefreshToken, hash: newHash } = generateRefreshToken();
  const perms = session.perms ? JSON.parse(session.perms) : [];
  const claims = {
    sub: session.userId,
    sid,
    tenantCode: session.tenantCode,
    organizationId: session.organizationId,
    role: session.role,
    organizationType: session.organizationType || null,
    perms,
  };
  const { token: jwt, jti, exp } = signAccess(claims);

  const pipe = client.multi();
  pipe.hset(sessionKey(sid), {
    refreshHash: newHash,
    previousRefreshHash: supersededHash,
    rotatedAt: String(nowSec),
    lastUsedAt: String(nowSec),
  });
  pipe.expire(sessionKey(sid), REFRESH_TTL_SECONDS);
  // Eski index'i SİLME → GRACE_SECONDS kadar canlı tut; yarışan eşzamanlı
  // refresh sid'i hâlâ çözebilsin (yoksa RT_INVALID alır).
  pipe.expire(refreshIdxKey(supersededHash), GRACE_SECONDS);
  pipe.set(refreshIdxKey(newHash), sid, 'EX', REFRESH_TTL_SECONDS);
  pipe.expire(userSessionsKey(session.userId), REFRESH_TTL_SECONDS);
  if (session.role) {
    pipe.expire(roleSessionsKey(session.role), REFRESH_TTL_SECONDS);
  }
  await pipe.exec();

  return {
    jwt,
    refreshToken: newRefreshToken,
    sid,
    jti,
    exp,
    userId: session.userId,
    tenantCode: session.tenantCode,
    organizationId: session.organizationId,
    role: session.role,
    organizationType: session.organizationType || null,
    perms,
    clientType: session.clientType || 'web',
  };
};

const sidForRefreshToken = async (refreshToken) => {
  if (!refreshToken) return null;
  return redis().get(refreshIdxKey(hashRefreshToken(refreshToken)));
};

const revokeSession = async ({ sid, jti, jtiExp, userId, role }) => {
  const client = redis();
  const session = await client.hgetall(sessionKey(sid));
  const pipe = client.multi();
  if (session?.refreshHash) pipe.del(refreshIdxKey(session.refreshHash));
  pipe.del(sessionKey(sid));
  const uId = userId || session?.userId;
  if (uId) pipe.srem(userSessionsKey(uId), sid);
  const r = role || session?.role;
  if (r) pipe.srem(roleSessionsKey(r), sid);
  if (jti && jtiExp) {
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(jtiExp - now, 1);
    pipe.set(jtiBlacklistKey(jti), '1', 'EX', ttl);
  }
  await pipe.exec();
};

const revokeAllForUser = async ({ userId, currentJti, currentJtiExp }) => {
  const client = redis();
  const sids = await client.smembers(userSessionsKey(userId));
  for (const sid of sids) {
    await revokeSession({ sid, userId });
  }
  if (currentJti && currentJtiExp) {
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(currentJtiExp - now, 1);
    await client.set(jtiBlacklistKey(currentJti), '1', 'EX', ttl);
  }
  await client.del(userSessionsKey(userId));
};

const revokeAllForRole = async ({ role }) => {
  const client = redis();
  const sids = await client.smembers(roleSessionsKey(role));
  for (const sid of sids) {
    await revokeSession({ sid, role });
  }
  await client.del(roleSessionsKey(role));
  return { revokedCount: sids.length };
};

const isJtiBlacklisted = async (jti) => {
  const exists = await redis().exists(jtiBlacklistKey(jti));
  return exists === 1;
};

// Session-existence gate. A still-cryptographically-valid access JWT must NOT
// be honored once its Redis session is gone (logout-all / revoke-by-role /
// RT-reuse delete the session hash but often cannot blacklist every live jti).
// Checking EXISTS session:{sid} per request closes that up-to-2.5h revocation
// gap for ALL revoke paths. Session TTL == refresh TTL (140d), so the key is
// present for the full access-token lifetime of a live session.
const sessionExists = async (sid) => {
  if (!sid) return false;
  const exists = await redis().exists(sessionKey(sid));
  return exists === 1;
};

const getSessionById = async (sid) => {
  const session = await redis().hgetall(sessionKey(sid));
  if (!session || !session.userId) return null;
  return {
    sid,
    userId: session.userId,
    tenantCode: session.tenantCode,
    organizationId: session.organizationId,
    role: session.role,
    organizationType: session.organizationType || null,
    perms: session.perms ? JSON.parse(session.perms) : [],
    createdAt: Number(session.createdAt),
    lastUsedAt: Number(session.lastUsedAt),
    ip: session.ip,
    userAgent: session.userAgent,
  };
};

// True if the target user has any live session minted for the superadmin role.
// Protects superadmins from admin session-revocation (a superadmin with no live
// session is a no-op to revoke, so the Redis view suffices to prevent a
// platform-owner lockout). Session role is fixed at creation and superadmin is
// immutable, so this cannot be a stale demotion.
const isUserSuperadmin = async (userId) => {
  const client = redis();
  const sids = await client.smembers(userSessionsKey(userId));
  for (const sid of sids) {
    const role = await client.hget(sessionKey(sid), 'role');
    if (role === 'superadmin') return true;
  }
  return false;
};

export {
  sidForRefreshToken,
  createSession,
  rotateSession,
  revokeSession,
  revokeAllForUser,
  revokeAllForRole,
  isJtiBlacklisted,
  sessionExists,
  getSessionById,
  isUserSuperadmin,
};
