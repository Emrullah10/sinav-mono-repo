export default [
  {
    name: { default: 'coreAppRedis' },
    type: { default: 'redis' },
    url: { env: 'CORE_REDIS_URL', type: 'string' },
    password: { env: 'CORE_REDIS_PASSWORD', type: 'string' },
    dbName: { default: 'default' },
  },
  {
    name: { default: 'serviceDiscoveryRedis' },
    type: { default: 'redis' },
    url: { env: 'CORE_DISCOVERY_REDIS_URL', type: 'string' },
    password: { env: 'CORE_DISCOVERY_REDIS_PASSWORD', type: 'string' },
  },
];
