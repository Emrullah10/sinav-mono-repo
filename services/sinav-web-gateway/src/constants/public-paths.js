// Method-aware public-path list. Her entry:
//   { path, match: 'exact' | 'prefix', methods? }
// `methods` omit edilirse tüm method'lar public.
// SADECE 'exact' ve 'prefix' destekleniyor — `endsWith` (defansif yan-yol
// riskli) kaldırıldı.

const PUBLIC_PATHS = [
  { path: '/api/sinav-service-identity/v1/auth/guest', match: 'exact', methods: ['POST'] },
  { path: '/api/sinav-service-identity/v1/auth/email/code', match: 'exact', methods: ['POST'] },
  { path: '/api/sinav-service-identity/v1/auth/email/verify', match: 'exact', methods: ['POST'] },
  { path: '/api/sinav-service-identity/v1/auth/password/login', match: 'exact', methods: ['POST'] },
  { path: '/api/sinav-service-identity/v1/auth/password/reset/request', match: 'exact', methods: ['POST'] },
  { path: '/api/sinav-service-identity/v1/auth/password/reset/confirm', match: 'exact', methods: ['POST'] },
  { path: '/api/sinav-service-identity/v1/public/ping', match: 'exact', methods: ['GET'] },
  { path: '/api/sinav-service-identity/v1/public/', match: 'prefix', methods: ['GET', 'POST'] },
  { path: '/api/sinav-service-content/v1/public/', match: 'prefix', methods: ['GET'] },
  { path: '/api/sinav-service-billing/v1/public/', match: 'prefix', methods: ['GET', 'POST'] },
  { path: '/api/sinav-service-learning/v1/public/', match: 'prefix', methods: ['GET'] },
  { path: '/openapi-ui/', match: 'prefix' },
];

const stripQuery = (url) => (url || '').split('?')[0];

const matchesAny = (list, url, method) => {
  if (!url) return false;
  const u = stripQuery(url);
  const m = (method || '').toUpperCase();
  return list.some(({ path, match, methods, pattern }) => {
    let pathMatch = false;
    if (match === 'exact') pathMatch = u === path;
    else if (match === 'prefix') pathMatch = u.startsWith(path);
    // Tek bir path parametresi taşıyan uçlar: tam desen (prefix, kardeş
    // yolları da açardı).
    else if (match === 'pattern') pathMatch = pattern instanceof RegExp && pattern.test(u);
    if (!pathMatch) return false;
    if (!methods) return true;
    return methods.includes(m);
  });
};

const isPublicPath = (url, method) => matchesAny(PUBLIC_PATHS, url, method);

// Authenticated routes whose SUCCESS RESPONSE upgrades the caller's
// role/permissions (anonymous → shipper_admin / carrier_admin) and therefore
// must re-issue the gateway session so the new perms take effect immediately.
//
// Bunlar PUBLIC DEĞİL — authenticateJwt + CSRF gate'lerinden normal geçerler
// (finalize, anonim user'ın JWT caller context'ine ihtiyaç duyar). Sadece
// http-proxy-middleware response-interceptor'ı, public login akışlarında olduğu
// gibi bu route'lar için de taze JWT basar. Bu olmadan session finalize sonrası
// ESKİ anonim perm'lerle kalır → her korumalı route 403 döner ve kullanıcı
// elle yeniden login olana kadar düzelmez. (Carrier kayıt 403 bug'ı.)
const SESSION_REFRESH_PATHS = [
  { path: '/api/sinav-service-identity/v1/auth/register', match: 'exact', methods: ['POST'] },
  { path: '/api/sinav-service-identity/v1/session/switch', match: 'exact', methods: ['POST'] },
];

const isSessionRefreshPath = (url, method) =>
  matchesAny(SESSION_REFRESH_PATHS, url, method);

export {
  PUBLIC_PATHS,
  isPublicPath,
  SESSION_REFRESH_PATHS,
  isSessionRefreshPath,
};
export default PUBLIC_PATHS;
