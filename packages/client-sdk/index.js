// ÜRETİLDİ: node packages/client-sdk/build-index.mjs
import { createBillingApi } from './src/billing.js';
import { createContentApi } from './src/content.js';
import { createGatewayApi } from './src/gateway.js';
import { createIdentityApi } from './src/identity.js';
import { createLearningApi } from './src/learning.js';
import { createTutorApi } from './src/tutor.js';
export * from './src/queryKeys.js';
export * from './src/deepLinks.js';
export * from './src/errors.js';

export const createApi = (http, opts = {}) => {
  const parts = [createBillingApi(http, opts), createContentApi(http, opts), createGatewayApi(http, opts), createIdentityApi(http, opts), createLearningApi(http, opts), createTutorApi(http, opts)];
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
