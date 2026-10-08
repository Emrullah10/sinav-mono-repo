import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import datasources, { createDatasources } from 'app-datasource';
import appConfig, { createAppConfig } from 'app-config';
import serviceDiscovery from 'app-service-discovery';
import helper from 'app-helper';
import rawAppConfig from './configs/app-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceName = path.basename(__dirname);
const datasourceConfigPath =
  process.env.NODE_ENV === 'test'
    ? `../../test/services/${serviceName}/configs/datasource-config.js`
    : './configs/datasource-config.js';
const { default: rawDatasourceConfig } = await import(datasourceConfigPath);
import middlewareFactory from './middlewares/index.js';
import boot from './src/boot.js';
import openApi from './definitions/rest-api-definition.js';

async function initialize() {
  const app = express();
  app.set('query parser', 'extended');
  createAppConfig(rawAppConfig, rawDatasourceConfig);
  if (appConfig?.nodeEnv !== 'production') global.logMode = 'trace';

  await createDatasources(appConfig).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });
  const sd = await serviceDiscovery(app, openApi, datasources.serviceDiscoveryRedis, datasources.coreAppRedis).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });
  app.use(middlewareFactory(appConfig, sd, openApi));
  sd.setAllServiceApis(app).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });
  const server = app.listen(appConfig.port, appConfig.host);
  helper.application.appStarted(appConfig);
  await boot().catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });

  // Graceful shutdown: PM2 kill_timeout (30 sn) bu drain'den UZUN olmalı.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, draining...`);
    try {
      await new Promise((resolve) => server.close(resolve));
      await datasources.coreAppDb?.disconnect?.();
      await datasources.coreAppRedis?.redisClient?.quit?.();
      await datasources.serviceDiscoveryRedis?.redisClient?.quit?.();
      process.exit(0);
    } catch (error) {
      console.error('[shutdown] error during drain', error);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

initialize();
