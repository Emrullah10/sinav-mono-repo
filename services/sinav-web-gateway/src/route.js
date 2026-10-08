import proxy from './middlewares/http-proxy-middleware.js';
import { conditionalCsrfProtection } from './middlewares/csrf-middleware.js';
import { addGatewayRoutes as mountGatewayRoutes } from './gateway-handlers.js';

function reRoute(app, service) {
  const path = `${service.basePathPrefix || ''}${service.basePath}`;
  app.use(path, conditionalCsrfProtection, proxy(service.rootUrl));
}

function addGatewayRoutes(app) {
  mountGatewayRoutes(app);
}

export default { reRoute, addGatewayRoutes };
