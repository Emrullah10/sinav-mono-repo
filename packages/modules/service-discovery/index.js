import handleErrors from '../errors/handleErrors.js';
import initHelper from './modules/helper.js';
import appConfig from '../../modules/config/index.js';

const { unRoutedRouteErrorHandler } = handleErrors;
const { safeJsonParse, prepareServiceInfo } = initHelper;

const routesUpdateChannel = 'app.fct.servicerestarted';

const init = async (
  router,
  openApi,
  serviceDiscoveryRedis,
  serviceDiscoveryPubSubRedis,
) => {
  if (!serviceDiscoveryRedis) {
    throw new Error('Service Discovery Redis client is undefined.');
  }
  const serviceDiscovery = {};
  const accessOverApiGateway = true;
  let prefix;

  /**
   * @name createOpenApiDoc
   * @summary Create OpenApiDoc Object.
   * @throws Throws an error if any error happens.
   * @param {string} path -Path of open api doc
   * @return {object} Promise - resolving or rejecting
   */
  serviceDiscovery.createOpenApiDoc = (openApi) => {
    const basePath = appConfig.basePath || '';
    const basePathPrefix = appConfig.basePathPrefix || '';
    openApi.info.title = appConfig.name;
    openApi.info.description = appConfig.description;
    openApi.info['x-serviceDiscovery'] = [
      { name: appConfig.name },
      { rootUrl: appConfig.url },
      { basePath },
      { basePathPrefix },
    ];
    openApi.servers = [
      { url: `${appConfig.url}${basePathPrefix}${basePath}` },
      ...(openApi && openApi.servers ? openApi.servers : []),
    ];
    return openApi;
  };

  const redisClient = serviceDiscoveryRedis.client;
  let heartBeating = false;
  const healthInterval = 3000;
  let serviceInfo;
  let routerFunctions;

  async function pipelineToRedis(commands) {
    return new Promise((res, rej) => {
      redisClient.pipeline(commands).exec((err, results) => {
        if (err) return rej(err);
        console.log('Executing commands on redis is done.');
        res(results);
      });
    });
  }

  if (openApi) {
    const obj = await prepareServiceInfo(openApi, serviceDiscovery);
    serviceInfo = obj.info;
    routerFunctions = obj.routerFunctions;
    prefix = obj.prefix;
  }

  let heartBeatIntervalId = null;

  const giveHeartBeat = async () => {
    if (!serviceDiscovery.healthCheckKey) {
      console.error(
        'Health check key name is undefined on giveHeartBeat on Service Discovery Redis.',
      );
      heartBeating = false;
      return;
    }
    try {
      await redisClient.set(
        serviceDiscovery.healthCheckKey,
        new Date().toString(),
      );
      heartBeating = true;
    } catch (err) {
      heartBeating = false;
      console.error('HeartBeat failed:', err.message);
    }
  };

  serviceDiscovery.prepareServiceInfo = prepareServiceInfo;
  /**
   * @name getServiceNames
   * @summary Retrieve a list services apis.
   * @throws Throws an error if any error happens.
   * @return {object} Promise - resolving or rejecting
   */
  serviceDiscovery.getAllServiceKeys = async () =>
    redisClient.scan(0, 'match', 'service:*', 'count', 9999999);

  serviceDiscovery.deleteOldRedisHashesByServiceName = async (serviceName) => {
    const hashes = await redisClient.keys(`service:/${serviceName}:*`);

    const commands = [];
    for (const hash of hashes) {
      commands.push(['del', hash]);
    }
    await pipelineToRedis(commands);
  };
  /**
   * @name discoverServices
   * @summary Retrieve information objects of available services.
   * @throws Throws an error if any error happens.
   * @return {object} Async - List of service apis info
   */
  serviceDiscovery.discoverAllServices = async () => {
    let serviceKeys = await serviceDiscovery.getAllServiceKeys();
    if (
      !serviceKeys ||
      !Array.isArray(serviceKeys) ||
      !serviceKeys[1] ||
      !Array.isArray(serviceKeys[1])
    ) {
      throw new Error('Couldnt get Service names from Sevice Discovery Redis.');
    }
    serviceKeys = serviceKeys[1];
    const serviceKeysLength = serviceKeys.length;
    const infoList = [];
    for (let index = 0; index < serviceKeysLength; index += 1) {
      const serviceKey = serviceKeys[index];
      const value = await serviceDiscovery.discoverService(serviceKey);
      if (!value) {
        throw new Error(`${serviceKey} info is undefined`);
      }
      infoList.push(value);
    }
    return infoList;
  };

  serviceDiscovery.subscribeServiceDiscoveryRedis = async (channel, cb) => {
    if (!serviceDiscoveryPubSubRedis)
      throw new Error('Redis Pub/Sub Client is undefined in Service Discovery');
    const { client } = serviceDiscoveryPubSubRedis;

    client.subscribe(channel, (error, count) => {
      if (error) {
        throw new Error(error);
      }
      console.log(
        `Subscribed to ${count} channel. Listening for updates on the ${channel} channel.`,
      );
    });

    client.on('message', cb);
  };
  /**
   * @name discoverService
   * @summary Retrieve object of named service.
   * @throws Throws an error if any error happens.
   * @param {string} serviceKey - Key of the service info value on redis
   * @return {object} Promise - resolving or rejecting
   */
  serviceDiscovery.discoverService = async (serviceKey) => {
    const serviceInfoFromRedis = await redisClient.hgetall(serviceKey);
    const parsedInfo = safeJsonParse(serviceInfoFromRedis.functionName);
    if (parsedInfo) {
      serviceInfoFromRedis.functionName = parsedInfo;
    }
    if (!serviceInfoFromRedis.functionName) {
      console.log('functionName is undefined after JSON.parse.');
    }

    return serviceInfoFromRedis;
  };

  /**
   * @name addServiceRoute
   * @summary Add service route.
   * @throws Throws an error if any error happens.
   * @param {object} element - application route value in redis object.
   * @param {object} router - application router object.
   * @param {object} routerFunctions - application router functions object.
   * @return {undefined} Promise - resolving or rejecting
   */
  serviceDiscovery.addServiceRoute = (element) => {
    if (!routerFunctions[element?.functionName])
      console.log(element.functionName, 'is undefined');
    router[element.method](
      `${element.basePathPrefix || ''}${element.basePath || ''}${element.path}`,
      routerFunctions[element.functionName],
    );

    console.log(
      `${element.url}${element.path}  ${element.method} route successfully added.`,
    );
  };

  /**
   * @name setServiceApi
   * @summary Set service api info to Redis and add route.
   * @throws Throws an error if any error happens.
   * @param {object} key - application route key in redis object.
   * @param {object} element - application route value in redis object.
   * @param {object} router - application router object.
   * @param {object} routerFunctions - application router functions object.
   * @return {undefined} Promise - resolving or rejecting
   */
  serviceDiscovery.setServiceApi = async (key, element) => {
    if (!key || !element) {
      throw new Error('setServiceApi parameters are broken');
    }
    serviceDiscovery.addServiceRoute(element);
    if (accessOverApiGateway || element.path.includes('/app/health')) {
      const clonedElement = structuredClone(element);
      await redisClient.hset(key, clonedElement);
    }
  };
  /**
   * @name setAllServiceApis
   * @summary Set all services info to Redis.
   * @throws Throws an error if any error happens.
   * @param {object} path - application config object.
   * @param {object} router - application router object.
   * @param {object} routerFunctions - application router functions object.
   * @return {undefined} Promise - resolving or rejecting
   */
  serviceDiscovery.setAllServiceApis = async (router, control) => {
    if (!router) {
      throw new Error('setAllServiceApis parameters are broken.');
    }

    if (
      !serviceInfo ||
      !serviceInfo.name ||
      !serviceInfo.basePath ||
      !serviceInfo.url ||
      !Array.isArray(serviceInfo.routeList)
    ) {
      throw new Error('Service info file is broken');
    }

    await serviceDiscovery.deleteOldRedisHashesByServiceName(serviceInfo.name);

    serviceDiscovery.serviceName = serviceInfo.name;
    serviceDiscovery.basePath = serviceInfo.basePath;
    serviceDiscovery.url = serviceInfo.url;
    serviceDiscovery.healthCheckKey = `health:${serviceInfo.name}`;
    serviceInfo.routeList = [...serviceInfo.routeList].sort((a, b) =>
      b.path.localeCompare(a.path),
    );
    const routeListLength = serviceInfo.routeList.length;
    for (let index = 0; index < routeListLength; index += 1) {
      const element = serviceInfo.routeList[index];
      if (!element.path || !element.basePath || !element.method) {
        throw new Error('Service info doesnt contain path or method');
      }
      const key = `${prefix}:${element.path}:${element.method}`;
      if (element.path.includes('/app/health')) {
        await serviceDiscovery.addHealthCheckApi(
          key,
          element,
          router,
          routerFunctions,
        );
      } else {
        if (element.path.includes('/definitions')) {
          element.basePath = '';
          element.basePathPrefix = '';
          element.url = `${element.rootUrl}`;
        }
        await serviceDiscovery.setServiceApi(
          key,
          element,
          router,
          routerFunctions,
          control,
        );
      }
    }
    unRoutedRouteErrorHandler(router);
    const data = {
      serviceName: serviceDiscovery.serviceName,
      time: Date.now(),
    };
    redisClient.publish(routesUpdateChannel, JSON.stringify(data));
  };

  /**
   * @name addHealthCheckApi
   * @summary Add health check route to service.
   * @throws Throws an error if any error happens.
   * @param {object} router - application router object.
   * @return {undefined} Promise - resolving or rejecting
   */
  serviceDiscovery.addHealthCheckApi = async (
    key,
    element,
    router,
    routerFunctions,
  ) => {
    if (
      !key ||
      !element ||
      !router ||
      !routerFunctions ||
      !routerFunctions[element.functionName]
    ) {
      throw new Error('addHealthCheckApi parameters are broken.');
    }
    router.get(`${element.basePathPrefix || ''}/online`, (request, response) =>
      response.status(200).json(true),
    );
    await serviceDiscovery.setServiceApi(key, element, router, routerFunctions);
    if (!heartBeating) {
      heartBeatIntervalId = setInterval(giveHeartBeat, healthInterval);
    }
  };

  return serviceDiscovery;
};

export default init;
