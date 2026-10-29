import { DomainError } from 'app-shared';

// LLM portu. Arayüz:
//   llm.configured                         -> boolean (false iken her çağrı LLM_NOT_CONFIGURED fırlatır)
//   llm.provider                           -> 'openrouter' | 'fake' | 'not_configured'
//   llm.models.{tutor,eval,content}        -> varsayılan model adları (env)
//   llm.complete({ messages, model, json, maxTokens, task, signal })
//        -> { text, json?, model, usage, finishReason }
//   llm.stream({ messages, model, onToken, signal, maxTokens, task })
//        -> { text, model, usage, finishReason }
//   usage = { inputTokens, outputTokens, cacheReadTokens, costMicros }
// Mesaj: { role: 'system'|'user'|'assistant', content: string, cache?: true }
//   `cache: true` -> sağlayıcı istem önbelleği için kararlı önek (Anthropic modellerinde cache_control eklenir).

const EMPTY_USAGE = Object.freeze({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costMicros: 0 });
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});

export const readModels = (env = process.env) => ({
  tutor: env.TUTOR_MODEL || 'anthropic/claude-sonnet-4.5',
  eval: env.EVAL_MODEL || 'anthropic/claude-haiku-4.5',
  content: env.CONTENT_MODEL || 'anthropic/claude-opus-4.1',
});

/** Modelin döndürdüğü metinden JSON nesnesi çıkarır (çit ve çevre metne dayanıklı). */
export const parseJsonLoose = (text) => {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(t);
  if (v !== undefined) return v;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) { v = tryParse(fence[1].trim()); if (v !== undefined) return v; }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { v = tryParse(t.slice(a, b + 1)); if (v !== undefined) return v; }
  return null;
};

const toApiMessages = (messages, model) => {
  const anthropic = /^anthropic\//.test(model || '');
  return messages.map((m) => {
    if (m.cache && anthropic) {
      return { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] };
    }
    return { role: m.role, content: m.content };
  });
};

const usageFrom = (u) => {
  if (!u) return { ...EMPTY_USAGE };
  const cost = Number(u.cost);
  return {
    inputTokens: Number(u.prompt_tokens) || 0,
    outputTokens: Number(u.completion_tokens) || 0,
    cacheReadTokens: Number(u.prompt_tokens_details?.cached_tokens) || 0,
    costMicros: Number.isFinite(cost) ? Math.round(cost * 1e6) : 0,
  };
};

const upstreamError = (status, body) => {
  const msg = typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body || {}).slice(0, 300);
  if (status === 429) return new DomainError('LLM_RATE_LIMITED', 'LLM provider rate limited', { status }, 429);
  return new DomainError('LLM_UPSTREAM_ERROR', `LLM provider error (${status}): ${msg}`, { status }, 502);
};

const wrapNetwork = (error) => {
  if (error instanceof DomainError) return error;
  if (error?.name === 'TimeoutError') return new DomainError('LLM_TIMEOUT', 'LLM did not answer in time', undefined, 504);
  if (error?.name === 'AbortError') return error; // çağıran (Durdur / bağlantı kopması) kendisi yorumlar
  return new DomainError('LLM_UPSTREAM_ERROR', `LLM unreachable: ${error?.message || error}`, undefined, 502);
};

const withTimeout = (signal, ms) => {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
};

// ── OpenRouter ──────────────────────────────────────────────────────────────
// `openrouter/auto` yönlendiricisini izin listesiyle sınırlar; `maxPrice` ($/milyon token) her istekte tavan koyar.
// `reasoningEffort` düşünme payını sınırlar (low|medium|high); düşünen modeller çıktı bütçesini yemesin.
const routing = (m, { autoAllowed = [], maxPrice = null, reasoningEffort = null }) => ({
  ...(m === 'openrouter/auto' && autoAllowed.length ? { plugins: [{ id: 'auto-router', allowed_models: autoAllowed }] } : {}),
  ...(maxPrice ? { provider: { max_price: maxPrice } } : {}),
  ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
});
const splitList = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const priceCap = (v) => {
  const [prompt, completion] = splitList(v).map(Number);
  return Number.isFinite(prompt) && Number.isFinite(completion) ? { prompt, completion } : null;
};

export const makeOpenRouterLlm = ({ apiKey, baseUrl, models, fetchFn = globalThis.fetch, timeoutMs = 90000, autoAllowed = [], maxPrice = null, reasoningEffort = null }) => {
  const url = `${String(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Title': 'Odak',
  };

  const complete = async ({ messages, model, json = false, maxTokens = 1500, signal } = {}) => {
    const m = model || models.tutor;
    const body = { model: m, messages: toApiMessages(messages, m), max_tokens: maxTokens, usage: { include: true }, ...(json ? { response_format: { type: 'json_object' } } : {}), ...routing(m, { autoAllowed, maxPrice, reasoningEffort }) };
    try {
      const res = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body), signal: withTimeout(signal, timeoutMs) });
      const raw = await res.text();
      let data; try { data = JSON.parse(raw); } catch { data = null; }
      if (!res.ok) throw upstreamError(res.status, data?.error?.message || raw);
      if (data?.error) throw upstreamError(data.error.code || 502, data.error.message);
      const text = data?.choices?.[0]?.message?.content ?? '';
      return { text, json: json ? parseJsonLoose(text) : undefined, model: data?.model || m, usage: usageFrom(data?.usage), finishReason: data?.choices?.[0]?.finish_reason || null };
    } catch (e) { throw wrapNetwork(e); }
  };

  const stream = async ({ messages, model, onToken, signal, maxTokens = 1500 } = {}) => {
    const m = model || models.tutor;
    const body = { model: m, messages: toApiMessages(messages, m), max_tokens: maxTokens, stream: true, usage: { include: true }, ...routing(m, { autoAllowed, maxPrice, reasoningEffort }) };
    try {
      const res = await fetchFn(url, { method: 'POST', headers: { ...headers, Accept: 'text/event-stream' }, body: JSON.stringify(body), signal: withTimeout(signal, timeoutMs) });
      if (!res.ok) throw upstreamError(res.status, await res.text().catch(() => ''));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ''; let text = ''; let usage = { ...EMPTY_USAGE }; let finishReason = null; let usedModel = m;
      const handleLine = async (line) => {
        if (!line.startsWith('data:')) return; // ': OPENROUTER PROCESSING' gibi yorum satırları
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        let chunk; try { chunk = JSON.parse(payload); } catch { return; }
        if (chunk.error) throw upstreamError(chunk.error.code || 502, chunk.error.message);
        if (chunk.model) usedModel = chunk.model;
        if (chunk.usage) usage = usageFrom(chunk.usage);
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const piece = choice?.delta?.content;
        if (piece) { text += piece; await onToken?.(piece); }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); await handleLine(line); }
      }
      if (buf.trim()) await handleLine(buf.trim());
      return { text, model: usedModel, usage, finishReason };
    } catch (e) { throw wrapNetwork(e); }
  };

  return Object.freeze({ provider: 'openrouter', configured: true, models, complete, stream });
};

// ── Yalnız yerel doğrulama için sahte adaptör (FAKE_LLM=1; üretimde reddedilir) ──────────────
const FAKE_XRAY = {
  type: 'sentence_xray',
  sentence: 'Despite the heavy rain, the match continued.',
  parts: [
    { no: 1, text: 'Despite the heavy rain', role: 'Zarf öbeği', function: 'Zıtlık kurar; "rağmen"', main: false },
    { no: 2, text: 'the match', role: 'Özne', function: 'Cümlenin öznesi', main: true },
    { no: 3, text: 'continued', role: 'Yüklem', function: 'Geçmiş zaman fiili', main: true },
  ],
  skeleton: 'Despite + isim öbeği -> özne -> yüklem',
  translation: 'Şiddetli yağmura rağmen maç devam etti.',
};
const FAKE_MINI = {
  type: 'mini_question',
  stem: 'She stayed home ______ she was invited.',
  options: [{ label: 'A', text: 'because' }, { label: 'B', text: 'although' }, { label: 'C', text: 'so' }, { label: 'D', text: 'unless' }, { label: 'E', text: 'since' }],
  answerLabel: 'B',
  explanation: '"Although" zıtlık kurar: davet edilmesine rağmen evde kaldı.',
};

const approxTokens = (s) => Math.ceil(String(s || '').length / 4);
const lastUser = (messages) => [...messages].reverse().find((m) => m.role === 'user')?.content || '';

// ── Sahte içerik üretimi (yalnız FAKE_LLM=1): content servisinin `[gen:<tür>]` istemlerine geçerli JSON döner ──
let fakeSeq = 0;
const FAKE_LABELS = ['A', 'B', 'C', 'D', 'E'];
const filler = (n) => Array.from({ length: n }, (_, i) => `Research on topic ${fakeSeq} shows result number ${i + 1} in this study.`).join(' ');
const fakeQuestion = (extra = {}) => {
  fakeSeq += 1;
  return {
    stem: `Fake question ${fakeSeq}: the committee decided to ______ the plan.`,
    options: FAKE_LABELS.map((l, k) => ({ label: l, text: `option ${l} of question ${fakeSeq}`, rationale: k === 0 ? null : 'Bu şık bağlama uymuyor.' })),
    correctLabel: 'A', shortReason: 'Doğru. Bağlama uyan tek şık bu.', explanation: 'Cümlenin yönü bu şıkkı gerektiriyor. Diğer şıklar anlamı bozuyor.',
    hints: [
      { kind: 'focus', body: 'Cümlenin yönüne bak.' }, { kind: 'rule', body: 'Bağlaç ve eşdizim ilişkisini düşün.' },
      { kind: 'eliminate', body: 'İki şık anlamı bozuyor.', eliminatesLabels: ['B', 'C'] }, { kind: 'solution', body: 'A şıkkı cümleyi tamamlar.' },
    ],
    difficulty: 3, estimatedSeconds: 45, ...extra,
  };
};
const fakeGenerate = (gen, userMsg) => {
  const count = Number(/Write (\d+)/.exec(userMsg)?.[1]) || 1;
  if (gen === 'question') return { questions: Array.from({ length: count }, () => fakeQuestion()) };
  if (gen === 'note') {
    fakeSeq += 1;
    return { note: {
      title: `Sahte not ${fakeSeq}`, summary: 'Tek cümlelik sahte özet.', readingSeconds: 80, ruleMd: '- Birinci kural\n- İkinci kural: *although* zıtlık kurar',
      examples: [{ en: 'Although it rained, we left.', tr: 'Yağmur yağmasına rağmen çıktık.' }], trapMd: 'Sık yapılan hata: bağlacı yönüne bakmadan seçmek.',
      checks: [fakeQuestion(), fakeQuestion()],
    } };
  }
  if (gen === 'check') {
    const n = [...userMsg.matchAll(/^Q(\d+)\./gm)].length;
    return { answers: Array.from({ length: n }, (_, i) => ({ n: i + 1, label: process.env.FAKE_CHECK_MISMATCH === '1' && i === 0 ? 'B' : 'A' })) };
  }
  const kind = gen.split(':')[1];
  const mk = () => {
    fakeSeq += 1;
    if (kind === 'reading') {
      const kinds = ['main_idea', 'inference', 'detail', 'vocabulary_in_context'];
      return { title: `Fake reading ${fakeSeq}`, body: `${filler(14)}\n\n${filler(8)}`, terms: [{ term: 'study', definitionTr: 'çalışma' }], questions: kinds.map((k) => fakeQuestion({ readingQuestionKind: k })) };
    }
    if (kind === 'cloze') {
      const body = `${filler(5)} {{1}} ${filler(3)} {{2}} ${filler(3)} {{3}} ${filler(3)} {{4}} ${filler(3)} {{5}} ${filler(2)}`;
      return { title: `Fake cloze ${fakeSeq}`, body, terms: [], questions: [1, 2, 3, 4, 5].map((b) => fakeQuestion({ blankNo: b, stem: `Blank ${b}: choose the option that best completes the passage.` })) };
    }
    const irrelevant = /Question type: irrelevant_sentence/.test(userMsg);
    const body = irrelevant ? `[[I]] ${filler(2)} [[II]] ${filler(2)} [[III]] ${filler(2)} [[IV]] ${filler(2)} [[V]] ${filler(2)}` : `${filler(4)} ______ ${filler(2)}`;
    return { title: `Fake paragraph ${fakeSeq}`, body, terms: [], questions: [fakeQuestion({ stem: irrelevant ? 'Which numbered sentence breaks the flow of the paragraph?' : 'Choose the sentence that best completes the paragraph.' })] };
  };
  return { passages: Array.from({ length: count }, mk) };
};

export const makeFakeLlm = ({ models }) => {
  const stream = async ({ messages, model, onToken, signal } = {}) => {
    const user = lastUser(messages);
    if (user.includes('FAKE_FAIL')) throw new DomainError('LLM_UPSTREAM_ERROR', 'fake upstream failure', undefined, 502);
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const wantsXray = /sentence_xray/.test(sys) || /röntgen/i.test(user);
    const wantsMini = /soru ver|benzer soru/i.test(user);
    const sourceMatch = /\[kaynak:(\d+)\|([^\]]+)\]/.exec(sys);
    const lines = [
      'Merhaba, ben Öğretmen; yapay zekâ destekli bir öğretmenim.',
      'Sorunu birlikte adım adım çözelim.',
      'Önce cümlenin ana yapısına bakalım, sonra bağlaca odaklanalım.',
      'Zıtlık bağlaçları iki fikir arasındaki karşıtlığı gösterir.',
      'Kendi cümlenle küçük bir örnek yazmak ister misin?',
    ];
    const words = lines.join(' ').split(' ');
    let text = '';
    for (const w of words) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const piece = (text ? ' ' : '') + w;
      text += piece;
      await onToken?.(piece);
      await sleep(Number(process.env.FAKE_LLM_DELAY_MS) || 70, signal);
    }
    const extra = { blocks: [], sources: [] };
    if (wantsXray) extra.blocks.push(FAKE_XRAY);
    if (wantsMini) extra.blocks.push(FAKE_MINI);
    if (sourceMatch) extra.sources.push({ kind: 'note', code: sourceMatch[1], title: sourceMatch[2] });
    if (/emin değilim|FAKE_UNSURE/.test(user)) extra.unsure = true;
    const tail = `\n\`\`\`json\n${JSON.stringify(extra)}\n\`\`\``;
    await onToken?.(tail);
    text += tail;
    return { text, model: model || `fake/${models.tutor}`, finishReason: 'stop', usage: { inputTokens: approxTokens(messages.map((m) => m.content).join(' ')), outputTokens: approxTokens(text), cacheReadTokens: 0, costMicros: 0 } };
  };

  const complete = async ({ messages, model, json, task } = {}) => {
    const all = messages.map((m) => m.content).join('\n');
    const userMsg = lastUser(messages);
    const gen = /\[gen:([a-z:]+)\]/.exec(messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n'))?.[1];
    let out;
    if (task === 'translation_eval') {
      const keys = [...userMsg.matchAll(/CRITERION:([a-z_]+)/g)].map((m) => m[1]);
      const user = /<ogrenci_cevabi>\n?([\s\S]*?)\n?<\/ogrenci_cevabi>/.exec(userMsg)?.[1]?.trim() || '';
      const refm = /<referans>\n?([\s\S]*?)\n?<\/referans>/.exec(userMsg)?.[1]?.trim() || user;
      out = {
        scores: Object.fromEntries((keys.length ? keys : ['meaning', 'tense', 'structure', 'vocabulary']).map((k, i) => [k, Math.max(0, 3 - (i % 2))])),
        criteriaComments: Object.fromEntries((keys.length ? keys : ['meaning']).map((k) => [k, 'Bu ölçütte genel olarak iyi gidiyorsun.'])),
        suggestedTranslation: refm,
        summary: 'Anlamı büyük ölçüde yakalamışsın; birkaç küçük düzeltmeyle daha doğal olur.',
        changes: [{ from: '', to: '', explanation: 'Kelime seçimi bağlama göre ayarlandı.' }],
      };
    } else if (gen) {
      out = fakeGenerate(gen, userMsg);
    } else {
      out = { ok: true, echo: approxTokens(all) };
    }
    const text = json || task === 'translation_eval' ? JSON.stringify(out) : `Sahte yanıt: ${lastUser(messages).slice(0, 80)}`;
    return { text, json: json || task === 'translation_eval' ? out : undefined, model: model || `fake/${models.eval}`, finishReason: 'stop', usage: { inputTokens: approxTokens(all), outputTokens: approxTokens(text), cacheReadTokens: 0, costMicros: 0 } };
  };
  return Object.freeze({ provider: 'fake', configured: true, models, complete, stream });
};

// ── Yapılandırılmamış: her çağrı 503 ───────────────────────────────────────
export const makeUnconfiguredLlm = ({ models }) => {
  const fail = async () => { throw new DomainError('LLM_NOT_CONFIGURED', 'LLM provider is not configured', undefined, 503); };
  return Object.freeze({ provider: 'not_configured', configured: false, models, complete: fail, stream: fail });
};

export const createLlm = ({ env = process.env, fetchFn } = {}) => {
  const models = readModels(env);
  if (env.FAKE_LLM === '1') {
    if ((env.NODE_ENV || 'production') === 'production') {
      console.error('[tutor] FAKE_LLM=1 üretimde reddedildi; LLM yapılandırılmamış sayılır.');
    } else {
      console.warn('[tutor] FAKE_LLM=1: sahte LLM adaptörü etkin (yalnız yerel doğrulama).');
      return makeFakeLlm({ models });
    }
  }
  if (!env.OPENROUTER_API_KEY) return makeUnconfiguredLlm({ models });
  return makeOpenRouterLlm({
    apiKey: env.OPENROUTER_API_KEY, baseUrl: env.OPENROUTER_BASE_URL, models, fetchFn,
    autoAllowed: splitList(env.OPENROUTER_AUTO_ALLOWED), maxPrice: priceCap(env.OPENROUTER_MAX_PRICE), reasoningEffort: env.OPENROUTER_REASONING_EFFORT || null,
  });
};
