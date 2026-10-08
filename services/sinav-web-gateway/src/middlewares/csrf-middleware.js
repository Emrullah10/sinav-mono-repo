import { doubleCsrf } from 'csrf-csrf';
import { isPublicPath } from '../constants/public-paths.js';
import { CSRF_COOKIE, cookieSecurityFlags } from '../auth/cookies.js';
import appConfig from 'app-config';

// secure/sameSite hardcode EDİLMEZ — cookies.js'ten türeyen ortak flag'leri
// kullanır ki sinav_csrf, ikiz sinav_xsrf ile aynı kapsamda kalsın.
// (HTTP/nginx modunda GATEWAY_IS_HTTP_NGINX=true → cookieSecurityFlags gevşetir)
const baseCookieOptions = {
  httpOnly: true,
  path: '/',
};

let cached;
function getCsrf() {
  if (cached) return cached;
  const secret = appConfig?.cookieSecret || process.env.COOKIE_SECRET;
  if (!secret) {
    throw new Error(
      'COOKIE_SECRET env required for CSRF (gateway boot fail-fast)',
    );
  }
  // Match the refresh/session cookie lifetime (cookies.js derives the refresh
  // cookie from the same appConfig.refreshTokenExpiry). A shorter, hardcoded
  // CSRF maxAge would expire mid-session and 403 every mutation while the user
  // is still logged in. Read lazily here so appConfig is fully populated.
  const csrfMaxAgeMs =
    (appConfig?.refreshTokenExpiry || 14 * 24 * 3600) * 1000;
  cached = doubleCsrf({
    getSecret: () => secret,
    cookieOptions: {
      ...baseCookieOptions,
      ...cookieSecurityFlags(),
      maxAge: csrfMaxAgeMs,
    },
    // SessionIdentifier'ı stabil tut: login response'unda token üretilirken
    // request.signedCookies henüz boş (yeni cookie sonraki request'te gelecek),
    // validate sırasında dolu olur → HMAC mismatch. IP de mobile/proxy'de
    // değişebilir. Pragmatik olarak global sabit kullan; per-session
    // uniqueness zaten Redis session-id ile sağlanıyor, CSRF burada klasik
    // double-submit (cookie==header) kontrolü olarak yeterli.
    getSessionIdentifier: () => 'sinav-app',
    cookieName: CSRF_COOKIE,
    getCsrfTokenFromRequest: (req) =>
      req.headers['x-xsrf-token'] || req.headers['x-csrf-token'],
  });
  return cached;
}

const doubleCsrfProtection = (req, res, next) =>
  getCsrf().doubleCsrfProtection(req, res, next);

const generateCsrfToken = (...args) => getCsrf().generateCsrfToken(...args);

const conditionalCsrfProtection = (req, res, next) => {
  if (isPublicPath(req.originalUrl, req.method)) return next();
  // Bearer taşıması ortam kimlik bilgisi değildir (otomatik çerez yok): CSRF uygulanmaz.
  if (req.authVia === 'bearer') return next();
  return doubleCsrfProtection(req, res, next);
};

export { doubleCsrfProtection, conditionalCsrfProtection, generateCsrfToken };
export default () => conditionalCsrfProtection;
