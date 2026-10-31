import { rawQuery, wrapWithHttpTranslation, sendMail, installMailProviderFromEnv } from 'app-shared';
import { makeAuth } from './application/auth.js';
import { makeAccount } from './application/account.js';
import { makeNotify } from './application/notify.js';
import { makePublic } from './application/public.js';
import { makeFeedback } from './application/feedback.js';

export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn = () => new Date(), mailer = { send: (a) => sendMail(a) } } = {}) => {
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const deps = { rawQuery: rawQueryFn, nowFn, mailer };
  const auth = makeAuth(deps);
  const account = makeAccount({ ...deps, auth });
  const notify = makeNotify(deps);
  const pub = makePublic(deps);
  const feedback = makeFeedback(deps);
  // Her use-case dondurulmuş haritada ve HTTP hata çevirisiyle sarılı (şablon §8.4).
  const wrapAll = (obj) => Object.freeze(Object.fromEntries(Object.entries(obj).map(([k, fn]) => [k, wrap(fn)])));
  const useCases = Object.freeze({ auth: wrapAll(auth), account: wrapAll(account), notify: wrapAll(notify), public: wrapAll(pub), feedback: wrapAll(feedback) });
  return Object.freeze({
    deps, useCases,
    setup: async () => { installMailProviderFromEnv({ serviceName: 'service-identity' }); },
  });
};

const container = buildContainer();
export default container;
