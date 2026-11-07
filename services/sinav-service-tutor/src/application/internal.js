import { DomainError } from 'app-shared';
import { insertAiUsage } from '../shared/helpers.js';

const FEATURES = ['tutor_chat', 'translation_eval', 'content_draft', 'word_gloss', 'sentence_translation', 'lexicon_prefill', 'lexicon_review', 'book_quiz'];
const OCR_MAX_BASE64 = 9.5 * 1024 * 1024;
const SPEECH_MAX_CHARS = 2000;
const ROLES = new Set(['system', 'user', 'assistant']);
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];
const SORTS = ['price', 'throughput', 'latency'];

export const makeInternal = ({ rawQuery, llm }) => {
  /** İçerik servisi (CMS taslakları) için: tek seferlik tamamlama + maliyet defteri. */
  const aiComplete = async ({ caller, feature = 'content_draft', model, messages, json = false, maxTokens, webSearch = null, reasoning = null, providerSort = null }) => {
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
    if (providerSort != null && !SORTS.includes(providerSort)) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', `providerSort must be one of ${SORTS.join('|')}`);
    const useModel = model || (feature === 'translation_eval' ? llm.models.eval : feature === 'tutor_chat' ? llm.models.tutor : llm.models.content);
    const userId = Number(caller?.callerUserId) || null;
    const started = Date.now();
    try {
      const web = webSearch ? { maxResults: Number(webSearch.maxResults) || 8 } : null;
      const r = await llm.complete({ messages, model: useModel, json: !!json, maxTokens: Math.min(Number(maxTokens) || 4000, 16000), task: 'internal', webSearch: web, reasoning: reasoning || null, providerSort: providerSort || null });
      // finishReason 'length' = cevap max_tokens'ta kesildi (çağıran JSON'u ayrıştıramayabilir); reasoningTokens bütçenin ne kadarını düşünmenin yediğini gösterir.
      const meta = { internal: true, finishReason: r.finishReason || null, reasoningTokens: r.usage?.reasoningTokens || 0, ...(reasoning ? { reasoning } : {}), ...(providerSort ? { providerSort } : {}), ...(web ? { webSearch: true } : {}) };
      await insertAiUsage(rawQuery, { caller, userId, feature, model: r.model || useModel, usage: r.usage, latencyMs: Date.now() - started, succeeded: true, metadata: meta });
      return { text: r.text, json: r.json ?? null, model: r.model || useModel, usage: r.usage, finishReason: r.finishReason || null, citations: r.citations || [] };
    } catch (e) {
      if (llm.configured) await insertAiUsage(rawQuery, { caller, userId, feature, model: useModel, latencyMs: Date.now() - started, succeeded: false, metadata: { internal: true, errorCode: e.code || null } });
      throw e;
    }
  };
  /** Taranmış PDF'in tek sayfası → metin (içerik servisi kitap OCR'ı). Ücret sayfa başınadır; ai_usage'a yazılır (günlük tavan buradan okunur). */
  const ocrPage = async ({ caller, pdfBase64, pageNo }) => {
    if (typeof pdfBase64 !== 'string' || !pdfBase64 || pdfBase64.length > OCR_MAX_BASE64) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'pdfBase64 is missing or too large');
    const userId = Number(caller?.callerUserId) || null;
    const started = Date.now();
    const model = process.env.BOOK_OCR_MODEL || llm.models.content;
    try {
      const r = await llm.ocrPdfPage({ pdfBase64, model, engine: process.env.BOOK_OCR_ENGINE || 'mistral-ocr' });
      await insertAiUsage(rawQuery, { caller, userId, feature: 'book_ocr', model: r.model || model, usage: r.usage, latencyMs: Date.now() - started, succeeded: true, metadata: { internal: true, pageNo: Number(pageNo) || null, chars: r.text.length } });
      return { text: r.text, model: r.model || model, usage: r.usage };
    } catch (e) {
      if (llm.configured) await insertAiUsage(rawQuery, { caller, userId, feature: 'book_ocr', model, latencyMs: Date.now() - started, succeeded: false, metadata: { internal: true, errorCode: e.code || null } });
      throw e;
    }
  };
  /**
   * Sesli okuma: tek cümle → mp3 (içerik servisi önbelleğe yazar; aynı cümle bir daha üretilmez).
   * Yanıtta maliyet olmadığından ücret karakter başı fiyattan yazılır (READ_ALOUD_PRICE_PER_MCHAR $/1M karakter; Drama 3 = 2).
   * $/1M karakter × karakter = mikro dolar.
   */
  const speech = async ({ caller, text, model, voice }) => {
    const input = typeof text === 'string' ? text.trim() : '';
    if (!input || input.length > SPEECH_MAX_CHARS) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', `text must be 1-${SPEECH_MAX_CHARS} characters`);
    if (!/^[\w.\-/:]{1,80}$/.test(String(model || ''))) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'model name invalid');
    if (voice != null && !/^[\w.-]{1,80}$/.test(String(voice))) throw new DomainError('TUTOR_AI_MESSAGES_INVALID', 'voice invalid');
    const userId = Number(caller?.callerUserId) || null;
    const started = Date.now();
    const price = Number(process.env.READ_ALOUD_PRICE_PER_MCHAR);
    const costMicros = Math.round(input.length * (Number.isFinite(price) && price >= 0 ? price : 2));
    try {
      const r = await llm.speech({ text: input, model, voice: voice || undefined });
      await insertAiUsage(rawQuery, { caller, userId, feature: 'read_aloud', model: r.model || model, usage: { costMicros }, latencyMs: Date.now() - started, succeeded: true, requestRef: r.generationId, metadata: { internal: true, chars: input.length, voice: voice || null } });
      return { audioBase64: r.audio.toString('base64'), contentType: r.contentType, model: r.model || model, costMicros };
    } catch (e) {
      if (llm.configured) await insertAiUsage(rawQuery, { caller, userId, feature: 'read_aloud', model, latencyMs: Date.now() - started, succeeded: false, metadata: { internal: true, chars: input.length, errorCode: e.code || null } });
      throw e;
    }
  };
  return Object.freeze({ aiComplete, ocrPage, speech });
};
