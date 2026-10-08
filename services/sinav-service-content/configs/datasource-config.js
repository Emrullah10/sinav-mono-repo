export default [
  { name: { default: 'coreAppDb' }, type: { default: 'postgre' }, connectionString: { env: 'CORE_APP_DB_CONNECTION_STRING', type: 'string' } },
  { name: { default: 'coreAppRedis' }, type: { default: 'redis' }, url: { env: 'CORE_REDIS_URL', type: 'string' }, password: { env: 'CORE_REDIS_PASSWORD', type: 'string' }, dbName: { default: 'default' } },
  { name: { default: 'serviceDiscoveryRedis' }, type: { default: 'redis' }, url: { env: 'CORE_DISCOVERY_REDIS_URL', type: 'string' }, password: { env: 'CORE_DISCOVERY_REDIS_PASSWORD', type: 'string' } },
];
