import { isPublicPath } from '../constants/public-paths.js';
import { verifyAccess } from '../auth/jwt.js';
import { isJtiBlacklisted, sessionExists } from '../auth/session.js';
import { getAccessToken } from '../auth/transport.js';
import { findRoute } from '../auth/route-registry.js';

const stripQuery = (url) => (url || '').split('?')[0];

const fail = (res, status, code, details) =>
  res.status(status).json({
    success: false,
    error: { code, message: code, ...(details ? { details } : {}) },
  });

const authenticateJwt = () => async (req, res, next) => {
  // CORS preflight + liveness bypass
  if (req.method === 'OPTIONS') return next();
  if (req.originalUrl === '/health' || req.originalUrl === '/test') return next();

  if (isPublicPath(req.originalUrl, req.method)) return next();

  const got = getAccessToken(req);
  if (got.conflict) return fail(res, 400, 'AUTH_TRANSPORT_CONFLICT');
  const at = got.token;
  if (!at) return fail(res, 401, 'TOKEN_MISSING');
  req.authVia = got.via;

  let payload;
  try {
    payload = verifyAccess(at);
  } catch (e) {
    if (e?.name === 'TokenExpiredError') return fail(res, 401, 'TOKEN_EXPIRED');
    return fail(res, 401, 'TOKEN_INVALID');
  }

  if (await isJtiBlacklisted(payload.jti)) {
    return fail(res, 401, 'TOKEN_REVOKED');
  }

  // Session-existence gate — a revoked session (logout-all / revoke-by-role /
  // RT-reuse) deletes session:{sid} immediately, so the still-valid access JWT
  // stops being honored here instead of lingering up to the access TTL.
  if (!(await sessionExists(payload.sid))) {
    return fail(res, 401, 'SESSION_GONE');
  }

  const registry = global.serviceRegistry || [];
  const route = findRoute(registry, req.method, stripQuery(req.originalUrl));

  // Fail-closed: an authenticated request whose path is not in the service
  // registry must NOT reach a downstream service without passing the gateway's
  // permission gate. (Public paths / OPTIONS / health are already bypassed
  // above.) Previously a null route fell through to the proxy, silently
  // skipping the internal-endpoint and permission checks for any unregistered
  // route — a defense-in-depth gap.
  if (!route) {
    return fail(res, 404, 'ROUTE_NOT_FOUND');
  }

  if (route.internal) {
    return fail(res, 401, 'INTERNAL_ENDPOINT_BLOCKED');
  }
  const required = route.permissionList;
  if (!required) {
    return fail(res, 500, 'PERMISSION_NOT_CONFIGURED', {
      route: route.path,
    });
  }
  if (required !== '*') {
    const allowed = required.split(',').map((s) => s.trim()).filter(Boolean);
    const userPerms = Array.isArray(payload.perms) ? payload.perms : [];
    const ok = allowed.some((p) => userPerms.includes(p));
    if (!ok) return fail(res, 403, 'PERMISSION_DENIED', { required });
  }

  req.user = payload;
  return next();
};

export default authenticateJwt;
export { authenticateJwt };
