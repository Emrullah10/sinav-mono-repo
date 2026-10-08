import coreRoutes from '../../../core/service-billing/routes/rest-routes.js';
import endpoints from '../src/interfaces/http/endpoints.js';

// Anahtarlar = OpenAPI `x-functionName` (defineEndpoints ikisini birlikte üretir).
export default { ...coreRoutes, ...endpoints.routes };
