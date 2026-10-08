/* eslint-disable max-len */
/* eslint-disable no-underscore-dangle */
import _ from 'lodash';
import { Router } from 'express';
import route from './route.js';
import {
  commonMiddlewareFactory,
  authMiddlewareFactory,
} from './middlewares/index.js';
import {
  authCodeLimiter,
  loginLimiter,
  waitlistLimiter,
  contactLimiter,
  paymentCallbackLimiter,
  paymentWebhookLimiter,
  tutorLimiter,
} from './middlewares/security-middleware.js';
import maintenance from './middlewares/maintenance-middleware.js';
import appConfig from 'app-config';
import errors from 'app-errors';
import { buildRegistry } from './auth/route-registry.js';

function isRouteBelongsToProject(basePath) {
  if (!basePath) {
    return false;
  }
  const prefix = `${appConfig.projectPrefix}-`;
  return basePath.includes(prefix);
}

function setServiceRegistry(services) {
  global.serviceRegistry = buildRegistry(services);
  // SCR-110 sistem sağlığı: benzersiz servis → rootUrl haritası. Probe, kökten
  // HERHANGI bir HTTP yanıtını canlı sayar (servislerde /health yok; Express
  // 404 bile prosesin ayakta olduğunu kanıtlar).
  const targets = {};
  for (const svc of services || []) {
    if (!isRouteBelongsToProject(svc.basePath)) continue;
    const name = String(svc.basePath || '').replace(/^\//, '');
    if (name && !targets[name] && name.includes('sinav-'))
      targets[name] = svc.rootUrl;
  }
  global.serviceHealthTargets = targets;
}

function buildServiceRouter(services) {
  const router = Router();
  const obj = {};
  const ordered = _.orderBy(services, ['basePath', 'path'], 'desc');

  for (const service of ordered) {
    if (obj[service.rootUrl] || !isRouteBelongsToProject(service.basePath))
      continue;
    obj[service.rootUrl] = true;
    console.log(
      `${service.rootUrl}${service.basePathPrefix || ''}${service.basePath}`,
    );
    route.reRoute(router, service);
  }
  return router;
}

const dynamicRouter = { current: null };

async function refreshRoute(serviceDiscovery) {
  const services = await serviceDiscovery.discoverAllServices().catch((err) => {
    throw err;
  });

  if (!services || !Array.isArray(services)) {
    throw new Error("Services couldn't discovered.");
  }

  setServiceRegistry(services);
  dynamicRouter.current = buildServiceRouter(services);
  console.log('Routes refreshed.');
}

export default async (serviceDiscovery, app) => {
  const services = await serviceDiscovery.discoverAllServices().catch((err) => {
    throw err;
  });

  if (!services || !Array.isArray(services)) {
    throw new Error("Services couldn't discovered.");
  }

  setServiceRegistry(services);

  // Liveness/health probe — auth middleware'den ÖNCE.
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/test', (_req, res) => res.status(200).json('done'));

  // Common middleware (cookieParser, security, cors, vd.) — gateway routes
  // bu middleware'lere bağlı (signedCookies, CSRF, vd.).
  const commonMw = commonMiddlewareFactory(appConfig);
  app.use(commonMw);
  app.use(maintenance());

  // OTP send brute-force / SMS-bombing guard — per-IP saatlik cap. Downstream
  // identity yalnızca per-telefon limitliyor; bu gateway bucket'ı (trust proxy
  // sonrası gerçek client IP'siyle) per-IP koruma ekler.
  const ID = '/api/sinav-service-identity/v1';
  app.use(`${ID}/auth/email/code`, authCodeLimiter());
  app.use(`${ID}/auth/password/reset/request`, authCodeLimiter());
  app.use(`${ID}/auth/email/verify`, loginLimiter());
  app.use(`${ID}/auth/password/login`, loginLimiter());
  app.use(`${ID}/auth/guest`, loginLimiter());
  app.use(`${ID}/public/waitlist`, waitlistLimiter());
  app.use(`${ID}/public/contact-messages`, contactLimiter());
  app.use('/api/sinav-service-tutor/v1/conversations', tutorLimiter());
  app.use('/api/sinav-service-billing/v1/public/payments', paymentCallbackLimiter());
  app.use('/api/sinav-service-billing/v1/webhooks', paymentWebhookLimiter());

  route.addGatewayRoutes(app);

  // Auth middleware (authenticateJwt) — SADECE downstream proxy route'larına.
  const authMw = authMiddlewareFactory(appConfig);
  app.use(authMw);

  dynamicRouter.current = buildServiceRouter(services);

  app.use((req, res, next) => {
    dynamicRouter.current(req, res, next);
  });

  errors.unRoutedRouteErrorHandler(app);

  await serviceDiscovery.subscribeServiceDiscoveryRedis(
    appConfig.pubsubChannel,
    (channel, message) => {
      console.log(`Received the following message from ${channel}: ${message}`);
      refreshRoute(serviceDiscovery);
    },
  );

  // Boot-race guard. The initial discoverAllServices() above is a single
  // snapshot of Redis. When the gateway and downstream services start at the
  // same time, a service may still be writing its routes (service-discovery
  // hset's them one-by-one) and may publish its `servicerestarted` event
  // BEFORE the subscription above is active — that refresh is then lost and the
  // gateway is left with a partial in-memory registry. The symptom is a route
  // that exists in Redis + the service router but 404s (ROUTE_NOT_FOUND) at the
  // gateway until the next restart (e.g. a late-registered route was missing
  // while sibling routes registered fine). Re-discovering once now that the
  // subscription is established reconciles the registry against the final Redis
  // state; any registration completing after this point is caught by the
  // subscription.
  await refreshRoute(serviceDiscovery);
};
