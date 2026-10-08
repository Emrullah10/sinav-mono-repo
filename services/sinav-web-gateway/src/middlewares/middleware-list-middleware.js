import compression from './compression-middleware.js';
import helmet from './helmet-middleware.js';
import cookieParser from './cookie-parser.js';
import checkUrl from './check-url-middleware.js';
import authenticateJwt from './authenticate-jwt-middleware.js';
import { cors, limiter } from './security-middleware.js';

// Common middleware — gateway endpoint'leri (refresh/logout/me/...) için
// gerekli (cookieParser, CSRF, security). Tüm request'lere uygulanır.
// ⚠️ `xss` ve `sqlInjectionMiddleware` 2026-09-05'te SILINDI — gerekce
// security-middleware.js'te (gateway govdeyi hic gormuyordu; tek etkileri
// query uzerinde yanlis pozitif 403'lerdi).
export const commonMiddleware = [
  cors,
  cookieParser,
  limiter,
  compression,
  helmet,
  checkUrl,
];

// Auth middleware — SADECE downstream proxy route'larına uygulanır.
// Gateway endpoint'leri kendi auth kontrollerini yapıyor.
export const authMiddleware = [authenticateJwt];

// Backwards-compat default export (tüm middleware list).
export default [...commonMiddleware, ...authMiddleware];
