import path from 'path';
import fs from 'fs/promises';
import _ from 'lodash';
import init from './core-end-points.js';
import dsUtil from '../../datasource/connectors/util.js';

const { appRoutes, setServiceInfo } = init();
const obj = {
  arrayObjecter(array) {
    const base = {};
    if (Array.isArray(array) && array.length > 0) {
      _.forEach(array, (objt) => {
        let key = Object.keys(objt);
        if (Array.isArray(key) && key.length === 1) {
          key = key[0];
          base[key] = objt[key];
        }
      });
    }
    return base;
  },
  safeJsonParse: dsUtil.safeJsonParse,
  defineStandartProperties({ name, url, rootUrl, basePath, basePathPrefix }) {
    const object = {
      serviceName: name,
      url,
      rootUrl,
      basePath,
      basePathPrefix,
    };
    return object;
  },
};

async function readRouterFunctions(appFunctions) {
  const routerFunctions = { ...appFunctions };
  const rootDir = path.resolve();
  const apiFunctionsPath = path.join(rootDir, '/routes');
  const fileInDirectory = await fs.readdir(apiFunctionsPath);
  for (const element of fileInDirectory) {
    const file = element;
    const filePath = path.join(apiFunctionsPath, file);
    const apiFunctions = await import(filePath);
    _.forEach(apiFunctions, (func, name) => {
      routerFunctions[name] = func;
    });
  }

  return routerFunctions;
}

async function prepareServiceInfo(openApi, serviceDiscovery) {
  try {
    let prefix;
    if (!openApi) return;
    const appFunctions = {};
    const info = {};
    info.routeList = [];
    const routes = {};

    const openApiJson = serviceDiscovery.createOpenApiDoc(openApi);
    if (!info.url) {
      info.url = openApiJson.servers[0].url;
      Object.assign(
        info,
        obj.arrayObjecter(openApiJson.info['x-serviceDiscovery']),
      );
      prefix = `service:${info.basePath}`;
    }
    _.forEach(openApiJson.paths, (methods, routePath) => {
      routePath = routePath.replace(/{/g, ':');
      routePath = routePath.replace(/}/g, '');
      _.forEach(methods, (properties, method) => {
        if (!routes[`${routePath}-${method}`]) {
          routes[`${routePath}-${method}`] = {
            ...obj.defineStandartProperties(info),
          };
          routes[`${routePath}-${method}`].path = routePath;
          routes[`${routePath}-${method}`].method = method;
          routes[`${routePath}-${method}`].functionName =
            properties['x-functionName'];
          Object.assign(
            routes[`${routePath}-${method}`],
            obj.arrayObjecter(properties['x-serviceDiscovery']),
          );
          if (properties['x-internal'] === true) {
            routes[`${routePath}-${method}`].internal = true;
          }
        }
      });
    });

    info.routeList = Object.values(routes);
    _.forEach(appRoutes, (invRoute) => {
      Object.assign(appFunctions, invRoute.routerFunctions);
      invRoute.key = prefix + invRoute.key;
      Object.assign(invRoute.element, obj.defineStandartProperties(info));
      info.routeList.push(invRoute.element);
    });
    const routerFunctionsRaw = await readRouterFunctions(appFunctions);
    let routerFunctions = {
      ...routerFunctionsRaw,
      ...routerFunctionsRaw.default,
    };
    delete routerFunctions.default;
    setServiceInfo(info);
    return { info, routerFunctions, prefix };
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export default {
  ...obj,
  prepareServiceInfo,
};
