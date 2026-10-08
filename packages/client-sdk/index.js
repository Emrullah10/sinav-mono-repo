// ÜRETİLDİ: node packages/client-sdk/build-index.mjs
import { createGatewayApi } from './src/gateway.js';
import { createIdentityApi } from './src/identity.js';
export * from './src/queryKeys.js';
export * from './src/deepLinks.js';
export * from './src/errors.js';

export const createApi = (http, opts = {}) => {
  const parts = [createGatewayApi(http, opts), createIdentityApi(http, opts)];
  const api = {};
  for (const part of parts) {
    for (const [k, fn] of Object.entries(part)) {
      if (api[k]) throw new Error(`client-sdk: yinelenen fonksiyon adı ${k}`);
      api[k] = fn;
    }
  }
  return api;
};
export default createApi;
