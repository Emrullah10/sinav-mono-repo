import { accessTtlSeconds } from './jwt.js';
import { refreshTtlSeconds } from './refresh.js';

// secure/sameSite TEK kaynaktan türer. sinav_csrf (csrf-middleware) ve
// sinav_xsrf bu helper'ı paylaştığı için ASLA diverge edemez — diverge,
// tarayıcının secure CSRF cookie'sini düşürüp "invalid csrf token" üretmesinin
// kök nedeniydi.
//
// ── D5 (güvenlik denetimi 2026-09-05) ──────────────────────────────────────
// Eskiden tek koşul `GATEWAY_IS_HTTP_NGINX` idi: bayrak açıkken oturum
// çerezleri `Secure` BASILMIYOR ve `SameSite=lax`a düşüyordu. Bayrak "gateway
// nginx'in arkasında düz HTTP konuşuyor" demek; oysa çerezin `Secure` olması
// TARAYICI ile site arasındaki bağlantıya bakar, nginx ile gateway arasındaki
// hop'a değil. Yani HTTPS bir sitede bile çerezler korumasız kalabiliyordu.
//
// Yeni kural: ÜRETİMDE HER ZAMAN `Secure`. Açık kapı bilinçli bırakıldı
// (gerçekten HTTPS olmayan bir ortam için) ama AÇIKÇA istenmeli:
// `ALLOW_INSECURE_COOKIES=true`. Üretimde açıkken gateway açılışta yüksek
// sesle uyarır (main.js).
const isProduction = () => (process.env.NODE_ENV || 'production') === 'production';
const allowInsecure = () => process.env.ALLOW_INSECURE_COOKIES === 'true';
const isHttpNginx = () => process.env.GATEWAY_IS_HTTP_NGINX === 'true';

const cookieSecurityFlags = () => {
  const insecure = allowInsecure() || (!isProduction() && isHttpNginx());
  return {
    secure: !insecure,
    // `Secure` olmayan bir çerezde `SameSite=strict` tarayıcıya göre
    // düşürülebiliyor; HTTP ortamda `lax` bilinçli geri çekilmedir.
    sameSite: insecure ? 'lax' : 'strict',
  };
};

const baseCookieOptions = (maxAgeSeconds) => ({
  httpOnly: true,
  signed: true,
  ...cookieSecurityFlags(),
  path: '/',
  maxAge: maxAgeSeconds * 1000,
});

const ACCESS_COOKIE = 'sinav_at';
const REFRESH_COOKIE = 'sinav_rt';
const CSRF_COOKIE = 'sinav_csrf';
const XSRF_COOKIE = 'sinav_xsrf';

const setAuthCookies = (res, { jwt, refreshToken }) => {
  res.cookie(ACCESS_COOKIE, jwt, baseCookieOptions(accessTtlSeconds()));
  res.cookie(
    REFRESH_COOKIE,
    refreshToken,
    baseCookieOptions(refreshTtlSeconds()),
  );
};

// `sinav_xsrf` — client-readable (httpOnly:false) ikiz cookie. csrf-csrf
// sadece signed `sinav_csrf` (httpOnly) set ediyor; axios `xsrfCookieName`
// ile bu cookie'yi okuyup `X-XSRF-TOKEN` header'ına koyabilmesi için raw
// token'ı paralel non-httpOnly cookie'de tutuyoruz.
const setXsrfCookie = (res, token) => {
  res.cookie(XSRF_COOKIE, token, {
    httpOnly: false,
    ...cookieSecurityFlags(),
    path: '/',
    maxAge: refreshTtlSeconds() * 1000,
  });
};

const clearAuthCookies = (res) => {
  const opts = baseCookieOptions(0);
  // signed:true clearCookie'de ihmal edilir; diğer alanlar tarayıcı eşleşmesi
  // için geçerli kalır (path, sameSite, secure, httpOnly).
  delete opts.signed;
  delete opts.maxAge;
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
  res.clearCookie(CSRF_COOKIE, opts);
  res.clearCookie(XSRF_COOKIE, { ...opts, httpOnly: false });
};

export {
  setAuthCookies,
  setXsrfCookie,
  clearAuthCookies,
  baseCookieOptions,
  cookieSecurityFlags,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  XSRF_COOKIE,
};
