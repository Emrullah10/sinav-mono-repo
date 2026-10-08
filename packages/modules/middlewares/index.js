/* eslint-disable no-restricted-syntax */
/* eslint-disable global-require */
import middlewareFactoryList from './middleware-list-middleware.js';
import swaggerMiddleware from './swagger-middleware.js';

export default function middlewareFactory(config, serviceDiscovery, openApi) {
  const middleWares = middlewareFactoryList.map((factory) => factory(config));
  if (!serviceDiscovery) {
    return middleWares;
  }

  const swaggerDocument = serviceDiscovery.createOpenApiDoc(openApi);
  middleWares.push(swaggerMiddleware(swaggerDocument));

  return middleWares;
}
