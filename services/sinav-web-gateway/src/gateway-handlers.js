// Gateway-level endpoint handler'ları:
//   POST /api/gateway/refresh
//   POST /api/gateway/logout
//   POST /api/gateway/logout-all
//   GET  /api/gateway/me
//   POST /api/gateway/sessions/revoke-by-role  (superadmin)

import express from 'express';
import { conditionalCsrfProtection } from './middlewares/csrf-middleware.js';
import { strictAuthLimiter } from './middlewares/security-middleware.js';
import { verifyAccess } from './auth/jwt.js';
import {
  rotateSession,
  revokeSession,
  revokeAllForUser,
  revokeAllForRole,
  isJtiBlacklisted,
  sessionExists,
  isUserSuperadmin,
} from './auth/session.js';
import {
  setAuthCookies,
  setXsrfCookie,
  clearAuthCookies,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from './auth/cookies.js';
import { generateCsrfToken } from './middlewares/csrf-middleware.js';
import { getAccessToken, wantsBearerTransport } from './auth/transport.js';
import { sidForRefreshToken, getSessionById } from './auth/session.js';
import { refreshTtlFor } from './auth/refresh.js';
import {
  logoutAudit,
  logoutAllAudit,
  sessionRevokeAudit,
} from './auth/identity-client.js';

const fail = (res, status, code, details) =>
  res.status(status).json({
    success: false,
    error: { code, message: code, ...(details ? { details } : {}) },
  });

const ok = (res, data = { ok: true }) =>
  res.status(200).json({ success: true, data });

// JWT verify helper — current access token'dan caller objesi çıkarır.
// Refresh dışındaki gateway endpoint'leri için.
const verifyAccessFromCookie = (req) => {
  const got = getAccessToken(req);
  if (got.conflict) {
    const e = new Error('AUTH_TRANSPORT_CONFLICT');
    e.status = 400;
    e.code = 'AUTH_TRANSPORT_CONFLICT';
    throw e;
  }
  const at = got.token;
  if (!at) {
    const e = new Error('TOKEN_MISSING');
    e.status = 401;
    e.code = 'TOKEN_MISSING';
    throw e;
  }
  try {
    return verifyAccess(at);
  } catch (err) {
    const code = err?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    const e = new Error(code);
    e.status = 401;
    e.code = code;
    throw e;
  }
};

const refreshHandler = async (req, res) => {
  const bearerMode = wantsBearerTransport(req);
  const refreshToken = bearerMode
    ? req.body?.refreshToken
    : req.signedCookies?.[REFRESH_COOKIE];
  if (!refreshToken || typeof refreshToken !== 'string') {
    clearAuthCookies(res);
    return fail(res, 401, 'REFRESH_MISSING');
  }
  try {
    const { jwt, refreshToken: newRt } = await rotateSession({ refreshToken });
    setAuthCookies(res, { jwt, refreshToken: newRt });
    // CSRF self-heal: her refresh'te { overwrite: true } ile TAZE, senkron bir
    // sinav_csrf + sinav_xsrf çifti üret. Böylece client'ta herhangi bir
    // CSRF desync'i olsa bile refresh sonrası kendiliğinden onarılır.
    // (/refresh CSRF'ten muaf — opak, httpOnly, signed, SameSite sinav_rt
    // cookie'si zaten anti-forgery sağlıyor; aksi halde desync refresh'i de
    // 403'ler ve kurtuluş imkânsızlaşırdı.)
    try {
      const xsrfToken = generateCsrfToken(req, res, { overwrite: true });
      if (xsrfToken) setXsrfCookie(res, xsrfToken);
    } catch (csrfErr) {
      console.error('CSRF token rotate failed (refresh):', csrfErr.message);
    }
    return ok(res, { ok: true });
  } catch (e) {
    clearAuthCookies(res);
    if (e.code === 'RT_REUSED') return fail(res, 401, 'RT_REUSED');
    if (e.code === 'RT_INVALID') return fail(res, 401, 'RT_INVALID');
    if (e.code === 'SESSION_GONE') return fail(res, 401, 'SESSION_GONE');
    console.error('Refresh error:', e);
    return fail(res, 500, 'REFRESH_FAILED');
  }
};

const logoutHandler = async (req, res) => {
  let payload;
  try {
    payload = verifyAccessFromCookie(req);
  } catch (e) {
    // Süresi dolmuş access ile çıkış: oturum refresh token'dan (gövde ya da çerez) bulunup iptal edilir.
    const rt = req.body?.refreshToken || req.signedCookies?.[REFRESH_COOKIE];
    const sid = e.code === 'TOKEN_EXPIRED' ? await sidForRefreshToken(rt) : null;
    if (sid) {
      const s = await getSessionById(sid);
      await revokeSession({ sid, userId: s?.userId, role: s?.role });
      clearAuthCookies(res);
      return ok(res);
    }
    clearAuthCookies(res);
    return fail(res, e.status || 401, e.code || 'TOKEN_INVALID');
  }
  if (await isJtiBlacklisted(payload.jti)) {
    clearAuthCookies(res);
    return fail(res, 401, 'TOKEN_REVOKED');
  }
  // Redis erişimi başarısız olsa bile cookie'leri yine de sil — kullanıcının
  // tarayıcısı clean state'e dönsün. Session revoke en iyi-effort.
  try {
    await revokeSession({
      sid: payload.sid,
      jti: payload.jti,
      jtiExp: payload.exp,
      userId: payload.sub,
      role: payload.role,
    });
  } catch (e) {
    console.error('Logout revokeSession failed:', e.message);
  }
  // Audit fire-and-forget — başarısız olursa session yine kapalı
  logoutAudit({
    caller: {
      userId: payload.sub,
      tenantCode: payload.tenantCode,
      organizationId: payload.organizationId,
      role: payload.role,
      organizationType: payload.organizationType,
      sid: payload.sid,
    },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  clearAuthCookies(res);
  return ok(res);
};

const logoutAllHandler = async (req, res) => {
  let payload;
  try {
    payload = verifyAccessFromCookie(req);
  } catch (e) {
    clearAuthCookies(res);
    return fail(res, e.status || 401, e.code || 'TOKEN_INVALID');
  }
  if (await isJtiBlacklisted(payload.jti)) {
    clearAuthCookies(res);
    return fail(res, 401, 'TOKEN_REVOKED');
  }
  try {
    await revokeAllForUser({
      userId: payload.sub,
      currentJti: payload.jti,
      currentJtiExp: payload.exp,
    });
  } catch (e) {
    console.error('Logout-all revokeAllForUser failed:', e.message);
  }
  logoutAllAudit({
    caller: {
      userId: payload.sub,
      tenantCode: payload.tenantCode,
      organizationId: payload.organizationId,
      role: payload.role,
      organizationType: payload.organizationType,
      sid: payload.sid,
    },
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  clearAuthCookies(res);
  return ok(res);
};

const meHandler = async (req, res) => {
  let payload;
  try {
    payload = verifyAccessFromCookie(req);
  } catch (e) {
    return fail(res, e.status || 401, e.code || 'TOKEN_INVALID');
  }
  if (await isJtiBlacklisted(payload.jti)) {
    return fail(res, 401, 'TOKEN_REVOKED');
  }
  if (!(await sessionExists(payload.sid))) {
    return fail(res, 401, 'SESSION_GONE');
  }
  return ok(res, {
    user: {
      userAccountId: payload.sub,
      userAccountTenantCode: payload.tenantCode,
      userAccountOrganizationId: payload.organizationId,
      userAccountRole: payload.role,
      userAccountOrganizationType: payload.organizationType,
    },
    organization: {
      organizationId: payload.organizationId,
      organizationType: payload.organizationType,
    },
    permissions: Array.isArray(payload.perms) ? payload.perms : [],
  });
};

const revokeByRoleHandler = async (req, res) => {
  let payload;
  try {
    payload = verifyAccessFromCookie(req);
  } catch (e) {
    return fail(res, e.status || 401, e.code || 'TOKEN_INVALID');
  }
  if (await isJtiBlacklisted(payload.jti)) {
    return fail(res, 401, 'TOKEN_REVOKED');
  }
  if (!(await sessionExists(payload.sid))) {
    return fail(res, 401, 'SESSION_GONE');
  }
  const userPerms = Array.isArray(payload.perms) ? payload.perms : [];
  if (!userPerms.includes('platform:session:revoke')) {
    return fail(res, 403, 'PERMISSION_DENIED', {
      required: 'platform:session:revoke',
    });
  }
  const role = req.body?.role;
  if (!role || typeof role !== 'string') {
    return fail(res, 400, 'INVALID_ROLE');
  }
  // superadmin is protected from bulk revoke (mirrors the SCR-112 role dropdown
  // which excludes it) — a mass logout of platform owners is never desirable.
  if (role === 'superadmin') {
    return fail(res, 403, 'SUPERADMIN_PROTECTED');
  }
  const { revokedCount } = await revokeAllForRole({ role });
  sessionRevokeAudit({
    caller: {
      userId: payload.sub,
      tenantCode: payload.tenantCode,
      organizationId: payload.organizationId,
      role: payload.role,
      organizationType: payload.organizationType,
      sid: payload.sid,
    },
    targetType: 'role',
    targetRole: role,
    revokedCount,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  return ok(res, { revokedCount, role });
};

// SCR-112 admin: revoke ALL sessions of a target user (not self — that's
// /logout-all). platform:session:revoke gated. Does not touch the admin's own
// jti; only the target user's sessions are torn down.
const revokeByUserHandler = async (req, res) => {
  let payload;
  try {
    payload = verifyAccessFromCookie(req);
  } catch (e) {
    return fail(res, e.status || 401, e.code || 'TOKEN_INVALID');
  }
  if (await isJtiBlacklisted(payload.jti)) {
    return fail(res, 401, 'TOKEN_REVOKED');
  }
  if (!(await sessionExists(payload.sid))) {
    return fail(res, 401, 'SESSION_GONE');
  }
  const userPerms = Array.isArray(payload.perms) ? payload.perms : [];
  if (!userPerms.includes('platform:session:revoke')) {
    return fail(res, 403, 'PERMISSION_DENIED', {
      required: 'platform:session:revoke',
    });
  }
  const userId = req.body?.userId;
  // user_account_id is BIGINT — reject non-numeric input (objects/arrays would
  // serialize into a malformed Redis key that silently revokes nothing).
  if (userId === undefined || userId === null || !/^\d+$/.test(String(userId))) {
    return fail(res, 400, 'INVALID_USER');
  }
  const targetId = String(userId);
  // Protect superadmins from targeted revocation — same rationale as the
  // revoke-by-role superadmin guard; prevents a platform-owner lockout.
  if (await isUserSuperadmin(targetId)) {
    return fail(res, 403, 'SUPERADMIN_PROTECTED');
  }
  await revokeAllForUser({ userId: targetId });
  sessionRevokeAudit({
    caller: {
      userId: payload.sub,
      tenantCode: payload.tenantCode,
      organizationId: payload.organizationId,
      role: payload.role,
      organizationType: payload.organizationType,
      sid: payload.sid,
    },
    targetType: 'user',
    targetUserId: targetId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  return ok(res, { userId: targetId });
};

// SCR-110 sistem sağlığı — platform:metric:read. Her servis köküne 2sn
// timeout'lu istek; yanıt (status ne olursa olsun) = up, ağ hatası = down.
const servicesHealthHandler = async (req, res) => {
  let payload;
  try {
    payload = verifyAccessFromCookie(req);
  } catch (e) {
    return fail(res, e.status || 401, e.code || 'TOKEN_INVALID');
  }
  if (await isJtiBlacklisted(payload.jti)) {
    return fail(res, 401, 'TOKEN_REVOKED');
  }
  if (!(await sessionExists(payload.sid))) {
    return fail(res, 401, 'SESSION_GONE');
  }
  const userPerms = Array.isArray(payload.perms) ? payload.perms : [];
  if (!userPerms.includes('platform:metric:read')) {
    return fail(res, 403, 'PERMISSION_DENIED', {
      required: 'platform:metric:read',
    });
  }
  const targets = global.serviceHealthTargets || {};
  const entries = Object.entries(targets);
  const results = await Promise.all(
    entries.map(async ([name, rootUrl]) => {
      const started = Date.now();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 2000);
      try {
        await fetch(rootUrl, { signal: ac.signal });
        return { service: name, up: true, latencyMs: Date.now() - started };
      } catch {
        return { service: name, up: false, latencyMs: null };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return ok(res, { services: results });
};

// Bearer ile gelen istekte CSRF atlansın diye taşıma türünü işaretler.
const withAuthVia = (req, _res, next) => {
  const got = getAccessToken(req);
  if (got.via) req.authVia = got.via;
  next();
};

const addGatewayRoutes = (app) => {
  // /refresh CSRF'ten MUAF — bkz. refreshHandler içindeki self-heal notu.
  // Opak/httpOnly/signed/SameSite sinav_rt cookie'si anti-forgery sağlar.
  const json = express.json({ limit: '16kb' });
  app.post('/api/gateway/refresh', json, strictAuthLimiter(), refreshHandler);
  app.post('/api/gateway/logout', json, withAuthVia, conditionalCsrfProtection, logoutHandler);
  app.post(
    '/api/gateway/logout-all',
    json,
    withAuthVia,
    conditionalCsrfProtection,
    logoutAllHandler,
  );
  app.get('/api/gateway/me', meHandler);
  app.post(
    '/api/gateway/sessions/revoke-by-role',
    json,
    withAuthVia,
    conditionalCsrfProtection,
    revokeByRoleHandler,
  );
  app.post(
    '/api/gateway/sessions/revoke-by-user',
    json,
    withAuthVia,
    conditionalCsrfProtection,
    revokeByUserHandler,
  );
  app.get('/api/gateway/health/services', servicesHealthHandler);
  console.log(
    'Gateway routes mounted: /refresh, /logout, /logout-all, /me, /sessions/revoke-by-role, /sessions/revoke-by-user',
  );
};

export {
  addGatewayRoutes,
  refreshHandler,
  logoutHandler,
  logoutAllHandler,
  meHandler,
  revokeByRoleHandler,
  revokeByUserHandler,
  servicesHealthHandler,
};
