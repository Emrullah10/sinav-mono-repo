import { rawQuery, wrapWithHttpTranslation } from 'app-shared';
import { buildPaymentProvider, assertPaymentConfig } from './ports/payment.js';
import { makeCatalog } from './application/catalog.js';
import { makeCheckout } from './application/checkout.js';
import { makeSubscription } from './application/subscription.js';
import { makeLifecycle } from './application/lifecycle.js';
import { makeProfile } from './application/profile.js';
import { makeStore } from './application/store.js';

// Composition root. Use-case'ler `make<Eylem>(deps)` fabrikalarıdır; hepsi dondurulmuş haritadadır.
export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn = () => new Date(), provider = null, fetchFn = globalThis.fetch } = {}) => {
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const pay = provider || buildPaymentProvider();
  const deps = { rawQuery: rawQueryFn, nowFn, wrap, provider: pay };
  const catalog = makeCatalog(deps);
  const checkout = makeCheckout(deps);
  const subscription = makeSubscription({ ...deps, checkoutFn: checkout.checkout });
  const lifecycle = makeLifecycle({ ...deps, subscription, checkout });
  const profile = makeProfile({ ...deps, renew: lifecycle });
  const store = makeStore({ ...deps, fetchFn });
  const wrapAll = (obj) => Object.freeze(Object.fromEntries(Object.entries(obj).map(([k, fn]) => [k, wrap(fn)])));
  const useCases = Object.freeze({
    catalog: wrapAll(catalog), checkout: wrapAll(checkout), subscription: wrapAll(subscription), lifecycle: wrapAll(lifecycle), profile: wrapAll(profile), store: wrapAll(store),
  });
  return Object.freeze({ deps, useCases, provider: pay });
};

// Sağlayıcı yapılandırması geçersizse (ör. NODE_ENV=production + PAYMENT_PROVIDER=fake) süreç AÇILMAZ.
let container;
try {
  assertPaymentConfig();
  container = buildContainer();
} catch (error) {
  console.error(`[service-billing] FATAL: ${error.message}`);
  process.exit(1);
}
export default container;
