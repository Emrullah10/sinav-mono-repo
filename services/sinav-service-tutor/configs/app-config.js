import path from 'path';
import packageJson from '../package.json' with { type: 'json' };
global.dirName = path.resolve('../');
const { name, description, version } = packageJson;

export default {
  name: { default: name },
  url: { env: 'SERVICE_TUTOR_REST_URL', type: 'string', default: 'http://127.0.0.1:2005' },
  basePath: { default: '/sinav-service-tutor' },
  basePathPrefix: { default: '/api' },
  description: { default: description },
  version: { default: version },
  validateRequests: { type: 'boolean', default: false },
  validateResponses: { type: 'boolean', default: false },
  nodeEnv: { env: 'NODE_ENV', type: 'enum', values: ['fake', 'development', 'production', 'test'], default: 'production' },
  debug: { env: 'DEBUG', type: 'string', default: '' },
  remoting: { default: { json: { strict: false, limit: '10mb' }, urlencoded: { extended: true, limit: '10mb' } } },
};
