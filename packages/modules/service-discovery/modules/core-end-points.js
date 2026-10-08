import appConfig from '../../../modules/config/index.js';
import datasources from '../../../modules/datasource/index.js';
import handleErrors from '../../errors/handleErrors.js';

const { routeFunctionErrorHandler, HTTP_STATUS } = handleErrors;

export default () => {
  let serviceInfo;

  function setServiceInfo(info) {
    serviceInfo = info;
  }

  function apiMetrics(req, res, next) {
    try {
      res.status(HTTP_STATUS.OK).json({});
    } catch (error) {
      routeFunctionErrorHandler(error, req, next);
    }
  }
  function apiInfo(req, res, next) {
    try {
      res.status(HTTP_STATUS.OK).json({ info: serviceInfo });
    } catch (error) {
      routeFunctionErrorHandler(error, req, next);
    }
  }
  /**
   * @name healthCheck
   * @summary Private function for /health api.
   * @throws Throws an error if any error happens.
   * @return {object} Promise - resolving or rejecting
   */
  async function healthCheck(req, res, next) {
    try {
      if (req.query && req.query.basicCheck) {
        return res.status(HTTP_STATUS.OK).json(true);
      }
      const xMinustesAgo = new Date().getTime() - 30 * 60 * 1000;
      global.exceptions = (global.exceptions || []).filter(
        (datum) => datum.time > xMinustesAgo,
      );
      const result = {
        name: appConfig.name,
        isOnline: true,
        time: new Date(),
        exceptions: (global.exceptions || []).map((datum) => ({
          date: new Date(datum.time),
          error: datum.error,
        })),
        datasources: [],
      };
      if (datasources) {
        for (const [key, datasource] of Object.entries(datasources)) {
          if (datasource?.health) {
            const datasourceHealth = await datasource.health().catch((err) => {
              console.log(err);
            });
            result.datasources.push({ name: key, health: datasourceHealth });
          }
        }
      }
      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      routeFunctionErrorHandler(error, req, next);
    }
  }

  return {
    appRoutes: {
      health: {
        key: ':/app/health:get',
        element: {
          basePath: '',
          path: '/app/health',
          functionName: 'health',
          method: 'get',
          url: '',
          accessOverApiGateway: true,
        },
        routerFunctions: { health: healthCheck },
      },
      info: {
        key: ':/app/info:get',
        element: {
          basePath: '',
          path: '/app/info',
          functionName: 'info',
          method: 'get',
          url: '',
          accessOverApiGateway: true,
        },
        routerFunctions: { info: apiInfo },
      },
      metrics: {
        key: ':/app/metrics:get',
        element: {
          basePath: '',
          path: '/app/metrics',
          functionName: 'metrics',
          method: 'get',
          url: '',
        },
        routerFunctions: { metrics: apiMetrics },
      },
    },
    setServiceInfo,
  };
};
