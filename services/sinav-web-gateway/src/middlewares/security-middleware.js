import crypto from 'node:crypto';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import datasources from 'app-datasource';
import { getAccessToken } from '../auth/transport.js';

const num = (name, def) => Number(process.env[name]) || def;
const generalMax = () => num('RATE_LIMIT_MAX', 200);
const sessionMax = () => num('RATE_LIMIT_SESSION_MAX', 2000);

const corsMiddleware = (config) => {
  const parse = (raw) =>
    String(raw || '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o && o !== '*');
  const origins = parse(config?.corsOrigins ?? process.env.CORS_ORIGINS);
  const landing = new Set(parse(process.env.LANDING_ORIGINS));
  const app = origins.length ? cors({ origin: origins, credentials: true }) : cors({ origin: false });
  // Tanıtım sitesi: yalnız /public/* yollarında, çerezsiz (credentials yok).
  const publicOnly = cors({ origin: [...landing], credentials: false });
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && landing.has(origin) && !origins.includes(origin)) {
      if (/\/v1\/public\//.test(req.originalUrl || req.url)) return publicOnly(req, res, next);
      return next();
    }
    return app(req, res, next);
  };
};

const hash = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 32);

// Anahtar: oturum token'ının hash'i (bearer ya da çerez); yoksa IP (+ mobil cihaz kimliği).
const sessionKey = (req) => {
  const { token } = getAccessToken(req);
  return typeof token === 'string' && token.length > 0 ? token : null;
};
const anonKey = (req) => {
  const dev = req.headers?.['x-device-id'];
  const ip = ipKeyGenerator(req.ip);
  return dev ? `${ip}|${String(dev).slice(0, 64)}` : ip;
};

const store = (prefix) => {
  const client = datasources.serviceDiscoveryRedis?.client;
  if (!client) return undefined;
  return new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args) => client.call(...args) });
};

const make = (prefix, windowMs, max, keyGenerator) => () =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: store(prefix),
    keyGenerator,
  });

const limiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: (req) => (sessionKey(req) ? sessionMax() : generalMax()),
    standardHeaders: true,
    legacyHeaders: false,
    store: store('global'),
    keyGenerator: (req) => {
      const t = sessionKey(req);
      return t ? `s:${hash(t)}` : anonKey(req);
    },
  });

const ipKey = (req) => anonKey(req);
const strictAuthLimiter = make('refresh', 60 * 1000, num('RATE_LIMIT_AUTH_MAX', 30), ipKey);
const authCodeLimiter = make('authcode', 60 * 60 * 1000, num('RATE_LIMIT_OTP_MAX', 20), ipKey);
const loginLimiter = make('login', 15 * 60 * 1000, num('RATE_LIMIT_LOGIN_MAX', 30), ipKey);
const waitlistLimiter = make('waitlist', 60 * 60 * 1000, num('RATE_LIMIT_WAITLIST_MAX', 10), ipKey);
const contactLimiter = make('contact', 60 * 60 * 1000, num('RATE_LIMIT_CONTACT_MAX', 10), ipKey);
const paymentCallbackLimiter = make('paycb', 15 * 60 * 1000, num('RATE_LIMIT_PAYMENT_CALLBACK_MAX', 60), ipKey);
const paymentWebhookLimiter = make('paywh', 15 * 60 * 1000, num('RATE_LIMIT_PAYMENT_WEBHOOK_MAX', 300), ipKey);
const feedbackLimiter = make('feedback', 60 * 60 * 1000, num('RATE_LIMIT_FEEDBACK_MAX', 20), (req) => {
  const t = sessionKey(req);
  return t ? `t:${hash(t)}` : anonKey(req);
});
const tutorLimiter = make('tutor', 60 * 1000, num('RATE_LIMIT_TUTOR_MAX', 30), (req) => {
  const t = sessionKey(req);
  return t ? `t:${hash(t)}` : anonKey(req);
});

export {
  corsMiddleware as cors,
  limiter,
  strictAuthLimiter,
  authCodeLimiter,
  loginLimiter,
  waitlistLimiter,
  contactLimiter,
  feedbackLimiter,
  paymentCallbackLimiter,
  paymentWebhookLimiter,
  tutorLimiter,
};
