import {
  createProxyMiddleware,
  responseInterceptor,
} from 'http-proxy-middleware';
import appConfig from 'app-config';
import { isPublicPath, isSessionRefreshPath } from '../constants/public-paths.js';
import { createSession } from '../auth/session.js';
import { setAuthCookies, setXsrfCookie } from '../auth/cookies.js';
import { generateCsrfToken } from './csrf-middleware.js';
import { wantsBearerTransport, clientInfo } from '../auth/transport.js';
import { refreshTtlFor } from '../auth/refresh.js';
import { accessTtlSeconds } from '../auth/jwt.js';

// ⚠️ `checkXAuth` SİLİNDİ (D7, 2026-09-05). `?apikey=<INTERNAL_API_KEY>` ile
// iç anahtarı QUERY'den kabul ediyordu ve hiçbir yerden çağrılmıyordu. Bir gün
// bağlansaydı anahtar erişim loglarına ve `Referer` başlığına düşerdi. İç
// çağrıların doğrulaması `app-shared/api/wrap-internal.js`tedir (x-auth-token).

const NONE = 'none';

// Downstream servisler kimliği SADECE bu header'lardan türetiyor (getCaller,
// packages/modules/shared/utils/general.js). Bir client bunları kendisi
// gönderirse spoof riski doğar; bu yüzden proxy'ye geçen HER istekte önce
// hepsini (+ getCaller'ın okuduğu legacy fallback'leri) siler, sonra JWT'den
// türeyen güvenilir değerleri set ederiz.
const IDENTITY_HEADERS = [
  'userAccountId',
  'userAccountTenantCode',
  'userAccountOrganizationId',
  'userAccountRole',
  'userAccountOrganizationType',
  'userAccountSessionId',
  'userAccountPermissionList',
  // O7 (2026-09-05) — gercek istemci IP'si. Odeme saglayicisina giden alici
  // IP'si bugune kadar SABITTI; iyzico'nun dolandiricilik skorlamasi her
  // islemde ayni sahte aliciyi goruyordu. Istemcinin kendisi gonderemesin diye
  // once SILINIR, sonra `req.ip`ten (trust proxy cozumlu) yazilir.
  'userAccountIp',
  // getCaller legacy fallback'leri (general.js:123-127)
  'userid',
  'tenantcode',
  'organizationid',
];

function stripInboundIdentityHeaders(proxyReq) {
  for (const header of IDENTITY_HEADERS) proxyReq.removeHeader(header);
}

function injectAuthHeaders(proxyReq, req) {
  if (req?.user) {
    proxyReq.setHeader('userAccountId', String(req.user.sub || ''));
    proxyReq.setHeader(
      'userAccountTenantCode',
      String(req.user.tenantCode || ''),
    );
    proxyReq.setHeader(
      'userAccountOrganizationId',
      String(req.user.organizationId || ''),
    );
    proxyReq.setHeader('userAccountRole', String(req.user.role || ''));
    proxyReq.setHeader(
      'userAccountOrganizationType',
      String(req.user.organizationType || ''),
    );
    proxyReq.setHeader('userAccountSessionId', String(req.user.sid || ''));
    proxyReq.setHeader('userAccountIp', String(req.ip || NONE));
    const perms = Array.isArray(req.user.perms) ? req.user.perms : [];
    proxyReq.setHeader('userAccountPermissionList', perms.join(','));
  } else {
    // Public/anonim istekler: 7 header'ın TAMAMINI güvenli sentinel'e sabitle
    // (önceden 4'ü set ediliyordu; role/orgType/sessionId client'tan sızabilirdi).
    proxyReq.setHeader('userAccountId', NONE);
    proxyReq.setHeader('userAccountTenantCode', NONE);
    proxyReq.setHeader('userAccountOrganizationId', NONE);
    proxyReq.setHeader('userAccountRole', NONE);
    proxyReq.setHeader('userAccountOrganizationType', NONE);
    proxyReq.setHeader('userAccountSessionId', NONE);
    proxyReq.setHeader('userAccountIp', String(req?.ip || NONE));
    proxyReq.setHeader('userAccountPermissionList', '');
  }
}

// SSE (text/event-stream) yanıtları tamponlanmaz: `responseInterceptor` gövdeyi sonuna kadar
// biriktirdiği için akış tek parça gelirdi. Akış doğrudan istemciye aktarılır; istemci
// bağlantıyı keserse yukarı akış da kapatılır (tutor servisi bunu "yarım kaldı" sayar).
function passSseThrough(interceptor) {
  return (proxyRes, req, res) => {
    if (!String(proxyRes.headers['content-type'] || '').includes('text/event-stream')) {
      return interceptor(proxyRes, req, res);
    }
    res.statusCode = proxyRes.statusCode || 200;
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value === undefined || ['transfer-encoding', 'content-length', 'connection'].includes(key)) continue;
      res.setHeader(key, value);
    }
    res.flushHeaders?.();
    proxyRes.pipe(res);
    res.on('close', () => proxyRes.destroy());
    return undefined;
  };
}

function proxy(url) {
  const webProxy = createProxyMiddleware({
    target: url,
    changeOrigin: true,
    selfHandleResponse: true,
    pathRewrite: (_path, req) => req.originalUrl,
    on: {
      proxyReq(proxyReq, req, res) {
        res.setHeader('X-Frame-Options', '');

        // Client'ın enjekte ettiği kimlik header'larını sil, sonra güvenilir
        // (JWT'den türeyen) değerleri yaz — sıra önemli.
        stripInboundIdentityHeaders(proxyReq);
        injectAuthHeaders(proxyReq, req);

        if (req.originalUrl.includes('/openapi-ui/')) {
          if (
            req.originalUrl.includes('/openapi-ui/swagger-ui') ||
            req.originalUrl.includes('/openapi-ui/favicon')
          ) {
            return;
          }
          const openapiUiKey =
            appConfig?.openapiUiKey || process.env.OPENAPI_UI_KEY;
          const { apikey } = req.query;
          if (!openapiUiKey || apikey !== openapiUiKey) {
            return res.status(401).send('Unauthorized');
          }
        }
      },
      error(err, req, res) {
        console.error(
          'PROXY ERROR:',
          err.message,
          'target:',
          url,
          'path:',
          req.originalUrl,
        );
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: 'Proxy error', message: err.message });
        }
      },
      proxyRes: passSseThrough(responseInterceptor(
        async (responseBuffer, proxyRes, request, response) => {
          if (request.originalUrl.includes('/openapi-ui/')) {
            return responseBuffer;
          }

          // Login/upgrade response intercept. Gateway, response shape'i
          // { user: { userAccountId, ... }, rolePermissionList: [...] } olan
          // POST'larda taze session (JWT) basar. İki sınıf route tetikler:
          //  - public login/kayıt akışları (otp/verify, profile/create, register)
          //  - authenticated role-upgrade route'ları (finalize-company) —
          //    SESSION_REFRESH_PATHS; bunlar anonim → carrier_admin/shipper_admin
          //    geçişinde session'ı yenilemezse kullanıcı eski anonim perm'lerle
          //    kalır ve her korumalı API 403 döner.
          const isCandidate =
            request.method === 'POST' &&
            (isPublicPath(request.originalUrl, request.method) ||
              isSessionRefreshPath(request.originalUrl, request.method)) &&
            (proxyRes.statusCode || 200) < 400;

          if (isCandidate) {
            let data;
            try {
              data = JSON.parse(responseBuffer.toString('utf-8'));
            } catch {
              return responseBuffer;
            }
            // Envelope wrapping (wrap.js) — { success, data }
            const payload = data?.data || data;
            const user = payload?.user;
            const perms = payload?.rolePermissionList;
            if (
              user?.userAccountId &&
              Array.isArray(perms) &&
              !payload?.error
            ) {
              try {
                const info = clientInfo(request);
                const { jwt, refreshToken, exp } = await createSession({
                  user,
                  perms,
                  ip: request.ip,
                  userAgent: request.headers['user-agent'],
                  ...info,
                });
                if (wantsBearerTransport(request)) {
                  // Mobil: çerez yok; token'lar gövdede (docs/PLAN-P0.md §5).
                  payload.auth = {
                    accessToken: jwt,
                    accessTokenExpiresAt: exp * 1000,
                    refreshToken,
                    refreshTokenExpiresAt: Date.now() + refreshTtlFor(info.clientType) * 1000,
                  };
                } else {
                  setAuthCookies(response, { jwt, refreshToken });
                  try {
                    const xsrfToken = generateCsrfToken(request, response);
                    if (xsrfToken) setXsrfCookie(response, xsrfToken);
                  } catch (csrfErr) {
                    console.error('CSRF token generate failed (login):', csrfErr.message);
                  }
                }
                payload.user.permissions = perms;
                delete payload.rolePermissionList;
                if (data?.data) data.data = payload;
                return Buffer.from(JSON.stringify(data));
              } catch (sessErr) {
                console.error('Session create error:', sessErr.message);
                return responseBuffer;
              }
            }
          }
          return responseBuffer;
        },
      )),
    },
  });
  return webProxy;
}

export default proxy;
