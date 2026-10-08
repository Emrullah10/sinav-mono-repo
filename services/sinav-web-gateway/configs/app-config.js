import path from 'path';
import packageJson from '../package.json' with { type: 'json' };
global.dirName = path.resolve('../');
const { name, description, version } = packageJson;

export default {
  name: {
    default: name,
  },
  url: {
    default: 'http://127.0.0.1:2000',
    env: 'GATEWAY_REST_URL',
    type: 'string',
  },
  basePath: {
    type: 'string',
    default: '/sinav-web-gateway',
  },
  basePathPrefix: {
    default: '/api',
  },
  description: {
    default: description,
  },
  version: {
    default: version,
  },
  apiDocsPath: {
    default: `${global.dirName}/src/routes/versions`,
  },
  validateRequests: {
    type: 'boolean',
    default: false,
  },
  validateResponses: {
    type: 'boolean',
    default: false,
  },
  nodeEnv: {
    env: 'NODE_ENV',
    type: 'enum',
    values: ['development', 'production', 'test'],
    default: 'production',
  },
  debug: {
    env: 'DEBUG',
    type: 'string',
    default: '',
  },
  remoting: {
    default: {
      json: {
        strict: false,
        limit: '10mb',
      },
      urlencoded: {
        extended: true,
        limit: '10mb',
      },
    },
  },
  isHttpNginx: {
    env: 'GATEWAY_IS_HTTP_NGINX',
    type: 'boolean',
    default: false,
  },
  projectPrefix: {
    env: 'PROJECT_PREFIX',
    type: 'string',
    default: 'service',
  },
  pubsubChannel: {
    env: 'PUBSUB_CHANNEL',
    type: 'string',
    default: 'app.fct.servicerestarted',
  },
  iamServiceBasePath: {
    type: 'string',
    default: '/sinav-service-identity',
  },
  cookieSecret: {
    env: 'COOKIE_SECRET',
    type: 'string',
    default: 'dev-secret',
  },
  internalApiKey: {
    env: 'INTERNAL_API_KEY',
    type: 'string',
    default: '',
  },
  openapiUiKey: {
    env: 'OPENAPI_UI_KEY',
    type: 'string',
    default: '',
  },
  corsOrigins: {
    env: 'CORS_ORIGINS',
    type: 'string',
    default: '*',
  },
  accessTokenExpiry: {
    env: 'ACCESS_TOKEN_EXPIRY',
    type: 'integer',
    default: 9000, // saniye — 150 dakika / 2.5 saat (access token / JWT ömrü)
  },
  refreshTokenExpiry: {
    env: 'REFRESH_TOKEN_EXPIRY',
    type: 'integer',
    // 14 gün. ⚠️ 2026-09-05'e kadar 12096000 (140 gün) idi ve bir fazladan
    // sıfır taşıyor gibi duruyordu: csrf-middleware.js'teki yorum ZATEN
    // "14 * 24 * 3600" diyor. Çalınan bir refresh çerezinin ömrü 140 gündü.
    default: 1209600,
  },
};
