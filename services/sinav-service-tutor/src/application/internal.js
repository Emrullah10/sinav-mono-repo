import { DomainError } from 'app-shared';
import { insertAiUsage } from '../shared/helpers.js';

const FEATURES = ['tutor_chat', 'translation_eval', 'content_draft', 'word_gloss', 'sentence_translation', 'lexicon_prefill', 'lexicon_review'];
const ROLES = new Set(['system', 'user', 'assistant']);
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];

export const makeInternal = ({ rawQuery, llm }) => {
  /** İçerik servisi (CMS taslakları) için: tek seferlik tamamlama + maliyet defteri. */
  const aiComplete = async ({ caller, feature = 'content_draft', model, messages, json = false, maxTokens, webSearch = null, reasoning = null }) => {
    if (!FEATURES.includes(feature)) throw new DomainError('TUTOR_AI_FEATURE_INVALID', 'Unknown feature');
    if (!Array.isArray(messages) || !messages.length || messages.length > 40) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'messages must be 1-40 items');
    let total = 0;
    for (const m of messages) {
      if (!m || !ROLES.has(m.role) || typeof m.content !== 'string') throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'Each message needs role and string content');
      total += m.content.length;
    }
    if (total > 200000) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'messages too large');
    if (model !== undefined && !/^[\w.\-/:]{1,80}$/.test(String(model))) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'model name invalid');
    if (reasoning != null && !EFFORTS.includes(reasoning)) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', `reasoning must be one of ${EFFORTS.join('|')}`);
    const useModel = model || (feature === 'translation_eval' ? llm.models.eval : feature === 'tutor_chat' ? llm.models.tutor : llm.models.content);
    const userId = Number(caller?.callerUserId) || null;
    const started = Date.now();
    try {
      const web = webSearch ? { maxResults: Number(webSearch.maxResults) || 8 } : null;
      const r = await llm.complete({ messages, model: useModel, json: !!json, maxTokens: Math.min(Number(maxTokens) || 4000, 16000), task: 'internal', webSearch: web, reasoning: reasoning || null });
      // finishReason 'length' = cevap max_tokens'ta kesildi (çağıran JSON'u ayrıştıramayabilir); reasoningTokens bütçenin ne kadarını düşünmenin yediğini gösterir.
      const meta = { internal: true, finishReason: r.finishReason || null, reasoningTokens: r.usage?.reasoningTokens || 0, ...(reasoning ? { reasoning } : {}), ...(web ? { webSearch: true } : {}) };
      await insertAiUsage(rawQuery, { caller, userId, feature, model: r.model || useModel, usage: r.usage, latencyMs: Date.now() - started, succeeded: true, metadata: meta });
      return { text: r.text, json: r.json ?? null, model: r.model || useModel, usage: r.usage, finishReason: r.finishReason || null, citations: r.citations || [] };
    } catch (e) {
      if (llm.configured) await insertAiUsage(rawQuery, { caller, userId, feature, model: useModel, latencyMs: Date.now() - started, succeeded: false, metadata: { internal: true, errorCode: e.code || null } });
      throw e;
    }
  };
  return Object.freeze({ aiComplete });
};
