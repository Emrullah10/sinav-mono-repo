import { rawQuery, wrapWithHttpTranslation } from 'app-shared';
import { createLlm } from './ports/llm.js';
import { makeContext } from './application/context.js';
import { makeConversations } from './application/conversations.js';
import { makeChat } from './application/chat.js';
import { makeTranslation } from './application/translation.js';
import { makeInternal } from './application/internal.js';
import { makeCms } from './application/cms.js';

// Composition root. Use-case'ler `make<Eylem>(deps)` fabrikalarıdır; hepsi dondurulmuş haritadadır.
export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn = () => new Date(), llm = createLlm() } = {}) => {
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const deps = { rawQuery: rawQueryFn, nowFn, wrap, llm };
  const context = makeContext(deps);
  const conversations = makeConversations({ ...deps, context });
  const chat = makeChat({ ...deps, context, conversations });
  const translation = makeTranslation(deps);
  const internal = makeInternal(deps);
  const cms = makeCms(deps);
  const wrapAll = (obj) => Object.freeze(Object.fromEntries(Object.entries(obj).map(([k, fn]) => [k, wrap(fn)])));
  const useCases = Object.freeze({
    conversations: wrapAll({ overview: conversations.overview, usage: conversations.usage, create: conversations.create, get: conversations.get, update: conversations.update,
      remove: conversations.remove, removeAll: conversations.removeAll, feedback: conversations.feedback, report: conversations.report }),
    chat: wrapAll({ sendMessage: chat.sendMessage, stop: chat.stop, sweepStale: chat.sweepStale }),
    translation: wrapAll(translation),
    internal: wrapAll(internal),
    cms: wrapAll(cms),
  });
  return Object.freeze({ deps, useCases, llm, setup: async () => { console.log(`[tutor] LLM sağlayıcı: ${llm.provider}`); } });
};

const container = buildContainer();
export default container;
