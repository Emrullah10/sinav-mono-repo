// Kullanım: node scripts/scaffold-service.mjs <domain> <port>
// core/service-<d> (şablon §7.2) ve services/sinav-service-<d> (şablon §8) iskeletini üretir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [domain, port] = process.argv.slice(2);
if (!domain || !port) throw new Error('kullanım: scaffold-service.mjs <domain> <port>');
const D = domain.toUpperCase().replace(/-/g, '_');
const write = (rel, content) => {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, content);
};
const core = `core/service-${domain}`;
const svc = `services/sinav-service-${domain}`;

// ── core ──
write(`${core}/package.json`, JSON.stringify({ name: `service-${domain}-core`, version: '0.0.1', description: `service-${domain} core (yalnızca table-definitions.js düzenlenir)`, type: 'module' }, null, 2) + '\n');
write(`${core}/src/domain/index.js`, `import { defineEntity } from 'entity-factory';
import { readScript, createScript, updateScript, deleteScript } from 'persistence-utils';
import tableDefs from '../infrastructure/persistence/schemas/table-definitions.js';
import { executeScript, convertObjectToCamelCase } from 'app-shared';

const deps = { readScript, createScript, updateScript, deleteScript, executeScript, convertObjectToCamelCase };

const domain = {};
for (const [name, schema] of Object.entries(tableDefs)) {
  if (!schema?.table) continue;
  domain[name] = defineEntity({ name, schema, deps });
}

export default domain;
`);
write(`${core}/src/application/use-cases/index.js`, `import domain from '../../domain/index.js';

const useCases = {};
for (const [name, entry] of Object.entries(domain)) useCases[name] = entry.useCase;

export default useCases;
`);
write(`${core}/src/interfaces/http/index.js`, `import domain from '../../domain/index.js';

const controllers = {};
for (const [name, entry] of Object.entries(domain)) controllers[name] = entry.controller;

export default controllers;
`);
write(`${core}/src/infrastructure/persistence/repositories/index.js`, `import domain from '../../../domain/index.js';

const repositoryImpls = {};
for (const [name, entry] of Object.entries(domain)) repositoryImpls[name] = entry.repositoryImpl;

export default repositoryImpls;
`);
write(`${core}/src/infrastructure/persistence/init-query-builder.js`, `import tableDefinitions from './schemas/table-definitions.js';
import { initQueryBuilder } from '../../../../../packages/query-builder/index.js';
initQueryBuilder(tableDefinitions);
`);
for (const [f, n] of [['domain-error', 'DomainError'], ['application-error', 'ApplicationError'], ['infrastructure-error', 'InfrastructureError']]) {
  write(`${core}/src/domain/errors/${f}.js`, `export class ${n} extends Error {
  constructor(message, context) {
    super(message);
    this.name = '${n}';
    this.context = context;
  }
}
`);
}
write(`${core}/definitions/_shared.openapi.js`, `export default {
  responseGet: { type: 'object', properties: { code: { type: 'string', example: 'success' }, message: { type: 'string', example: 'Success' }, list: { type: 'array', example: [] } } },
  responsePost: { type: 'object', properties: { code: { type: 'string', example: 'success' }, message: { type: 'string', example: 'Success' }, item: { type: 'object', example: {} } } },
  QueryParameters: {
    type: 'object',
    properties: {
      startRow: { type: 'number', example: 0 },
      endRow: { type: 'number', example: 100 },
      sortModel: { type: 'array', items: { type: 'object', properties: { colId: { type: 'string', example: 'id' }, sort: { type: 'string', example: 'asc' } } } },
      filterModel: { type: 'object', properties: { id: { type: 'object', properties: { type: { type: 'string', example: 'equals' }, filter: { type: 'string', example: '2' } } } } },
    },
  },
};
`);
write(`${core}/definitions/rest-api-definition.js`, `import sharedSchemas from './_shared.openapi.js';
import { buildShard } from 'example-builder';
import tableDefs from '../src/infrastructure/persistence/schemas/table-definitions.js';

const components = { schemas: { ...sharedSchemas } };
const paths = {};

for (const schema of Object.values(tableDefs)) {
  if (!schema?.table) continue;
  const shard = buildShard(schema);
  Object.assign(components.schemas, shard.schemas);
  Object.assign(paths, shard.paths);
}

export default {
  openapi: '3.0.0',
  info: { title: 'REST API', version: '1.0.0', description: 'A dynamically generated API from the database schema.' },
  components,
  paths,
};
`);
write(`${core}/test/helpers/index.js`, `import handleErrors from '../../../../packages/modules/errors/handleErrors.js';
import openApi from '../../definitions/rest-api-definition.js';
const { routeFunctionErrorHandler } = handleErrors;

export default async (req, res, next, callerName) => {
  try {
    const { schemas } = openApi?.components || {};
    const responseProperties = schemas[callerName + 'Response'].properties;
    const response = Object.keys(responseProperties).reduce((acc, key) => {
      acc[key] = responseProperties[key].example;
      return acc;
    }, {});
    res.status(200).json(response);
  } catch (error) {
    routeFunctionErrorHandler(error, req, next);
  }
};
`);
write(`${core}/routes/rest-routes.js`, `import { getCaller } from 'app-shared';
import appConfig from 'app-config';
import handleErrors from 'app-errors';
import faker from '../test/helpers/index.js';
import controllers from '../src/interfaces/http/index.js';

const { routeFunctionErrorHandler, HTTP_STATUS } = handleErrors;

const base = async (req, res, next, callerName, serviceFunction, isPublic = false) => {
  try {
    if (typeof serviceFunction !== 'function') throw new Error('Invalid service function provided');
    const caller = getCaller(req.headers, isPublic);
    const response = await serviceFunction(req, caller);
    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    routeFunctionErrorHandler({ callerName, path: req.path, method: req.method }, error, next);
  }
};

const routeResponse = appConfig.nodeEnv === 'fake' ? faker : base;
const routes = {};

for (const ctrl of Object.values(controllers)) {
  if (!ctrl || typeof ctrl.read !== 'function' || typeof ctrl.upsert !== 'function') continue;
  const getName = \`get\${ctrl.name}\`;
  const postName = \`post\${ctrl.name}\`;
  routes[getName] = (req, res, next) => routeResponse(req, res, next, getName, ctrl.read);
  routes[postName] = (req, res, next) => routeResponse(req, res, next, postName, ctrl.upsert);
}

export default routes;
`);
write(`${core}/src/infrastructure/persistence/schemas/table-definitions.js`, `import { applyDefaultPermissions } from 'example-builder';

export default applyDefaultPermissions({});
`);

// ── service ──
write(`${svc}/package.json`, JSON.stringify({ name: `sinav-service-${domain}`, version: '0.0.1', description: `service-${domain}`, type: 'module' }, null, 2) + '\n');
write(`${svc}/configs/app-config.js`, `import path from 'path';
import packageJson from '../package.json' with { type: 'json' };
global.dirName = path.resolve('../');
const { name, description, version } = packageJson;

export default {
  name: { default: name },
  url: { env: 'SERVICE_${D}_REST_URL', type: 'string', default: 'http://127.0.0.1:${port}' },
  basePath: { default: '/sinav-service-${domain}' },
  basePathPrefix: { default: '/api' },
  description: { default: description },
  version: { default: version },
  validateRequests: { type: 'boolean', default: false },
  validateResponses: { type: 'boolean', default: false },
  nodeEnv: { env: 'NODE_ENV', type: 'enum', values: ['fake', 'development', 'production', 'test'], default: 'production' },
  debug: { env: 'DEBUG', type: 'string', default: '' },
  remoting: { default: { json: { strict: false, limit: '10mb' }, urlencoded: { extended: true, limit: '10mb' } } },
};
`);
write(`${svc}/configs/datasource-config.js`, `export default [
  { name: { default: 'coreAppDb' }, type: { default: 'postgre' }, connectionString: { env: 'CORE_APP_DB_CONNECTION_STRING', type: 'string' } },
  { name: { default: 'coreAppRedis' }, type: { default: 'redis' }, url: { env: 'CORE_REDIS_URL', type: 'string' }, password: { env: 'CORE_REDIS_PASSWORD', type: 'string' }, dbName: { default: 'default' } },
  { name: { default: 'serviceDiscoveryRedis' }, type: { default: 'redis' }, url: { env: 'CORE_DISCOVERY_REDIS_URL', type: 'string' }, password: { env: 'CORE_DISCOVERY_REDIS_PASSWORD', type: 'string' } },
];
`);
write(`${svc}/main.js`, `import path from 'node:path';
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
    ? \`../../test/services/\${serviceName}/configs/datasource-config.js\`
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
    console.log(\`[shutdown] \${signal} received, draining...\`);
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
`);
write(`${svc}/middlewares/index.js`, `import sharedFactory from 'app-middlewares';

export default (config, serviceDiscovery, openApi) => [...sharedFactory(config, serviceDiscovery, openApi)];
`);
write(`${svc}/src/domain/errors/domain-error.js`, `export { DomainError } from 'app-shared';
export { DomainError as default } from 'app-shared';
`);
write(`${svc}/src/domain/errors/infrastructure-error.js`, `export class InfrastructureError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'InfrastructureError';
    this.code = code;
    this.details = details;
  }
}
export default InfrastructureError;
`);
write(`${svc}/src/boot.js`, `import cron from 'node-cron';
import '../../../core/service-${domain}/src/infrastructure/persistence/init-query-builder.js';
import datasources from 'app-datasource';
import { makeWithCronLock } from 'app-shared';
import container from './container.js';
import jobs from './jobs.js';

const withCronLock = makeWithCronLock(datasources);

export default async () => {
  // 1) PORTLAR burada kurulur (cron kapalı olsa da)
  if (typeof container.setup === 'function') await container.setup();

  // 2) ZAMANLANMIŞ İŞLER: testte ve DISABLE_CRON=true iken kapalı.
  const cronDisabled = process.env.NODE_ENV === 'test' || process.env.DISABLE_CRON === 'true';
  if (cronDisabled) return;
  for (const job of jobs) {
    cron.schedule(
      job.schedule,
      () =>
        withCronLock(\`cron:${domain}:\${job.name}\`, job.lockSeconds || 50, async () => {
          try {
            const result = await job.run(container);
            if (result?.changed) console.log(\`[${domain}-\${job.name}] degisen=\${result.changed}\`);
          } catch (error) {
            console.error(\`[service-${domain}] \${job.name} failed\`, error);
          }
        }),
      { timezone: 'Europe/Istanbul' },
    );
  }
};
`);
write(`${svc}/src/jobs.js`, `// Zamanlanmış işler: { name, schedule (cron), lockSeconds, run(container) }
export default [];
`);
write(`${svc}/src/container.js`, `import { rawQuery, wrapWithHttpTranslation } from 'app-shared';

// Composition root. Use-case'ler \`make<Eylem>(deps)\` fabrikalarıdır; hepsi dondurulmuş haritadadır.
export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn = () => new Date() } = {}) => {
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const deps = { rawQuery: rawQueryFn, nowFn, wrap };
  const useCases = Object.freeze({});
  return Object.freeze({ deps, useCases });
};

const container = buildContainer();
export default container;
`);
write(`${svc}/src/interfaces/http/index.js`, `// Uç tanımları endpoints.js'tedir (tek liste → OpenAPI + route haritası).
export {};
`);
write(`${svc}/src/interfaces/http/endpoints.js`, `import { defineEndpoints } from 'app-shared';

export default defineEndpoints([], { tag: '${domain}' });
`);
write(`${svc}/definitions/rest-api-definition.js`, `import coreDefinition from '../../../core/service-${domain}/definitions/rest-api-definition.js';
import endpoints from '../src/interfaces/http/endpoints.js';

export default {
  ...coreDefinition,
  components: {
    ...(coreDefinition.components || {}),
    schemas: { ...(coreDefinition.components?.schemas || {}), ...endpoints.schemas },
  },
  paths: { ...(coreDefinition.paths || {}), ...endpoints.paths },
};
`);
write(`${svc}/routes/rest-routes.js`, `import coreRoutes from '../../../core/service-${domain}/routes/rest-routes.js';
import endpoints from '../src/interfaces/http/endpoints.js';

// Anahtarlar = OpenAPI \`x-functionName\` (defineEndpoints ikisini birlikte üretir).
export default { ...coreRoutes, ...endpoints.routes };
`);
console.log('ok', domain, port);
