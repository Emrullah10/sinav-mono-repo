import { DomainError } from 'app-shared';
import { insertAiUsage } from '../shared/helpers.js';

const FEATURES = ['tutor_chat', 'translation_eval', 'content_draft'];
const ROLES = new Set(['system', 'user', 'assistant']);

export const makeInternal = ({ rawQuery, llm }) => {
  /** İçerik servisi (CMS taslakları) için: tek seferlik tamamlama + maliyet defteri. */
  const aiComplete = async ({ caller, feature = 'content_draft', model, messages, json = false, maxTokens }) => {
    if (!FEATURES.includes(feature)) throw new DomainError('TUTOR_AI_FEATURE_INVALID', 'Unknown feature');
    if (!Array.isArray(messages) || !messages.length || messages.length > 40) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'messages must be 1-40 items');
    let total = 0;
    for (const m of messages) {
      if (!m || !ROLES.has(m.role) || typeof m.content !== 'string') throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'Each message needs role and string content');
      total += m.content.length;
    }
    if (total > 200000) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'messages too large');
    if (model !== undefined && !/^[\w.\-/:]{1,80}$/.test(String(model))) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'model name invalid');
    const useModel = model || (feature === 'translation_eval' ? llm.models.eval : feature === 'tutor_chat' ? llm.models.tutor : llm.models.content);
    const userId = Number(caller?.callerUserId) || null;
    const started = Date.now();
    try {
      const r = await llm.complete({ messages, model: useModel, json: !!json, maxTokens: Math.min(Number(maxTokens) || 4000, 8000), task: 'internal' });
      await insertAiUsage(rawQuery, { caller, userId, feature, model: r.model || useModel, usage: r.usage, latencyMs: Date.now() - started, succeeded: true, metadata: { internal: true } });
      return { text: r.text, json: r.json ?? null, model: r.model || useModel, usage: r.usage, finishReason: r.finishReason || null };
    } catch (e) {
      if (llm.configured) await insertAiUsage(rawQuery, { caller, userId, feature, model: useModel, latencyMs: Date.now() - started, succeeded: false, metadata: { internal: true, errorCode: e.code || null } });
      throw e;
    }
  };
  return Object.freeze({ aiComplete });
};
