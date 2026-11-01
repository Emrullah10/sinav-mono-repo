import { createHash } from 'node:crypto';
import {
  DomainError, withTransaction, getEntitlements, fetchInternal, internalHeaders, lexiconForm, normalizeSentence, localDate, LEXICON_LIMITS,
} from 'app-shared';
import { getPlatform, redis, cacheDel, vocabKey, normalizeHeadword } from '../shared/helpers.js';
import { getPublishedItem } from '../shared/item-read.js';

// Dokun-çevir. Kelime: önce küratörlü sözlük (vocab_entry), sonra content.word_gloss önbelleği, en son AI (biçim başına
// bir kez; herkes için saklanır). Cümle: content.sentence_translation (normalize metnin SHA-256'sı); eksikler tek AI
// isteğinde bloğun tamamıyla çevrilir ki aynı metinde sonraki basışlar anında açılsın. AI'a giden istekler günlük
// sınırlıdır (önbellekten gelenler sayılmaz). Model: CONTENT_MODEL (openrouter/auto + cost_tier low), düşünme kapalı (reasoning:'none'):
// düşünme token'ları max_tokens'tan yiyip JSON'u yarıda kesiyordu (2026-10-31: kelime çağrılarının %78'i 503). Tavanlar, model düşünmeyi
// reddedip tutor varsayılan ayara döndüğünde de cevap sığsın diye geniş tutulur (yalnız üretilen token ücretlenir).

const tutorUrl = () => `${(process.env.SERVICE_TUTOR_REST_URL || process.env.TUTOR_REST_URL || 'http://127.0.0.1:2005').replace(/\/$/, '')}/api/sinav-service-tutor/v1`;
const aiTimeout = () => Number(process.env.LEXICON_AI_TIMEOUT_MS) || 35000;
const WORD_MAX_TOKENS = 1500;
const sentenceMaxTokens = (chars) => Math.min(6000, Math.ceil(chars / 2) + 1000);
const LIMITS = { word: { free: 60, premium: 300 }, sentence: { free: 20, premium: 100 } };
const POS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal_verb', 'conjunction', 'preposition', 'pronoun', 'determiner', 'interjection', 'numeral', 'idiom', 'collocation'];
const POS_ALIAS = { auxiliary: 'verb', modal: 'verb', 'modal verb': 'verb', 'auxiliary verb': 'verb', article: 'determiner', phrase: 'idiom', 'proper noun': 'noun', number: 'numeral', 'phrasal verb': 'phrasal_verb' };
const WORD_OK = /^(?:[a-z]\.){2,}$|^[a-zà-ɏ]+(?:['-][a-zà-ɏ]+)*$/;

const WORD_SHAPE = `{"isWord":true,"lemma":"base form","partOfSpeech":"${POS.join('|')}","ipa":"/IPA/","formNote":"short Turkish note on the inflected form or null","meanings":[{"tr":"Turkish meaning","pos":"part of speech of this sense","note":"short Turkish usage note or null"}],"examples":[{"en":"short natural example sentence","tr":"its Turkish translation"}]}`;
const WORD_RULES = `Rules: lemma is the dictionary form (went→go, studies→study, better→good). formNote only when the given form differs from the lemma, e.g. "'go' fiilinin geçmiş zaman hâli". 1–3 meanings covering the common senses, most common first; each Turkish meaning is 1–5 words; notes only when really needed. Exactly 1 short example at exam level. If it is a proper name, a typo, a number or not English, set "isWord":false and explain briefly in Turkish in formNote (meanings may then be empty).`;
const WORD_SYSTEM = `[gen:lex:word] You are a concise English→Turkish learner's dictionary for Turkish students preparing for YDS/YÖKDİL (B1–C1).
You get one English word exactly as it appeared in a text. Return ONLY JSON:
${WORD_SHAPE}
${WORD_RULES}`;
// Ön-çeviri (lexicon-prefill): aynı kurallar, numaralı kelime listesi → entries dizisi.
const WORDS_SYSTEM = `[gen:lex:words] You are a concise English→Turkish learner's dictionary for Turkish students preparing for YDS/YÖKDİL (B1–C1).
You get a numbered list of English words exactly as they appeared in exam texts. Return ONLY JSON: {"entries":[...]} with exactly one entry per numbered word, in the same order.
Each entry is this object plus a "word" field holding the word exactly as given:
${WORD_SHAPE}
${WORD_RULES}`;

// Kontrol (lexicon-review): ücretsiz modelin kayıtlarını ucuz model denetler; YALNIZ düzeltilmesi gerekenleri döndürür (çıktı az → ucuz).
const WORDS_REVIEW_SYSTEM = `[gen:lex:review-words] You are a strict reviewer of an English→Turkish learner's dictionary for Turkish students preparing for YDS/YÖKDİL (B1–C1).
You get numbered JSON entries written by another model. Check each one: lemma, partOfSpeech, the Turkish meanings (correct, natural, most common sense first, real and correctly spelled Turkish words — no invented words), formNote and the example with its Turkish translation.
Return ONLY JSON: {"fixes":[...]} containing ONLY the entries that need any change; if every entry is correct return {"fixes":[]}.
A fix is the full corrected entry plus "n" (its number): {"n":1, ...this object}:
${WORD_SHAPE}
${WORD_RULES}`;
const SENTENCES_REVIEW_SYSTEM = `[gen:lex:review-sentences] You review Turkish translations of English sentences from exam-preparation texts, made by another model for Turkish learners.
For each numbered pair check that the Turkish is accurate (same meaning, nothing missing or added), natural and correctly spelled. Blank and placeholder markers (----, ______, {{1}}, [[II]], (A)…) must stay exactly as written; never fill a blank.
Return ONLY JSON: {"fixes":[{"n":1,"tr":"corrected Turkish"}]} containing ONLY the pairs that need a change; if all are fine return {"fixes":[]}.`;

const SENTENCE_SYSTEM = `[gen:lex:sentence] You translate English sentences from exam-preparation texts into natural, accurate Turkish for Turkish learners.
Translate every numbered sentence separately, in order; use the neighbouring sentences only as context. Keep blank and placeholder markers exactly as written (----, ______, {{1}}, [[II]], (A)…) and NEVER guess or fill in a missing word. No explanations.
Return ONLY JSON: {"translations":["Turkish of [1]","Turkish of [2]", ...]} with exactly one string per numbered sentence.`;

const sha = (s) => createHash('sha256').update(s).digest('hex');
export const sentenceHash = (text) => sha(`en>tr|${normalizeSentence(text)}`);
/** Dokunulan kelimenin sözlük anahtarı geçerli mi (word() ile aynı kural; ön-çeviri adaylarını süzer). */
export const isLexiconForm = (form) => Boolean(form) && form.length <= LEXICON_LIMITS.wordMax && WORD_OK.test(form);
const clean = (v, n) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null);

const userIdOf = (caller) => Number(caller?.callerUserId) || null;

/** 503 + log: içerik servisi DomainError'ları loglamaz; kesilen/bozuk cevaplar böyle görünür kalır (metin değil, yalnız ölçüler loglanır). */
const lexFail = (feature, message, ctx = {}, details = undefined) => {
  console.warn(`[lexicon] ${feature}: ${message} ${JSON.stringify(ctx)}`);
  return new DomainError('CONTENT_LEXICON_UNAVAILABLE', message, details, 503);
};

export const makeLexicon = ({ rawQuery, nowFn, fetchFn, study, items }) => {
  const inflight = new Map();

  const platform = () => getPlatform(rawQuery);

  // ── günlük AI sınırı (Redis; Redis yoksa sınırsız) ──
  const consume = async (caller, kind) => {
    const uid = userIdOf(caller);
    const r = redis();
    if (!uid || !r) return;
    const ent = await getEntitlements(uid).catch(() => ({ tier: 'free' }));
    const limit = LIMITS[kind][ent.tier === 'premium' ? 'premium' : 'free'];
    const key = `lexicon:${uid}:${kind}:${localDate(nowFn(), 'Europe/Istanbul')}`;
    const used = await r.incr(key);
    if (used === 1) await r.expire(key, 2 * 86400);
    if (used > limit) {
      await r.decr(key);
      throw new DomainError('CONTENT_LEXICON_LIMIT', 'Daily translation limit reached', { kind, limit, tier: ent.tier }, 429);
    }
  };
  const refund = async (caller, kind) => {
    const uid = userIdOf(caller);
    try { if (uid) await redis()?.decr(`lexicon:${uid}:${kind}:${localDate(nowFn(), 'Europe/Istanbul')}`); } catch { /* best-effort */ }
  };

  const askAi = async (caller, feature, messages, maxTokens, { model, timeoutMs } = {}) => {
    let res;
    try {
      res = await fetchInternal(`${tutorUrl()}/internal/ai/complete`, {
        method: 'POST', headers: internalHeaders(caller), timeoutMs: timeoutMs || aiTimeout(), fetchFn,
        body: { feature, model: model || process.env.CONTENT_MODEL || undefined, messages, json: true, maxTokens, reasoning: 'none', userAccountId: userIdOf(caller) },
      });
    } catch (e) {
      throw lexFail(feature, `Translation service unreachable: ${e.message}`);
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok || body?.success === false) {
      throw lexFail(feature, body?.error?.message || `Translation failed (${res.status})`, { status: res.status, upstream: body?.error?.code || null }, { upstream: body?.error?.code || res.status });
    }
    const data = body?.data ?? body;
    const meta = { model: data?.model || null, finishReason: data?.finishReason || null, maxTokens, outputTokens: data?.usage?.outputTokens ?? null, reasoningTokens: data?.usage?.reasoningTokens ?? null, costMicros: Number(data?.usage?.costMicros) || 0 };
    let out = data?.json;
    if (!out && typeof data?.text === 'string') {
      try { out = JSON.parse(data.text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { out = null; }
    }
    if (!out || typeof out !== 'object') throw lexFail(feature, meta.finishReason === 'length' ? 'Translation was cut off' : 'Translation returned no JSON', meta);
    return { out, model: meta.model, meta };
  };

  // ── kelime ──
  const formOf = (word) => {
    const form = lexiconForm(word);
    if (!isLexiconForm(form)) throw new DomainError('CONTENT_LEXICON_WORD_INVALID', 'word must be a single English word', { field: 'word' });
    return form;
  };

  const curatedDto = (form, entry, extra = {}) => ({
    form, source: 'dictionary', isWord: true, itemCode: entry.itemCode, lemma: entry.headword, partOfSpeech: entry.partOfSpeech, ipa: entry.pronunciationIpa || null,
    formNote: extra.formNote ?? null, meanings: (entry.meanings || []).map((m) => ({ tr: m.tr, note: m.note || null, pos: m.pos || null })),
    examples: (entry.examples || []).slice(0, 3).map((x) => ({ en: x.en, tr: x.tr || null })), synonyms: entry.synonyms || [], collocations: entry.collocations || [],
  });

  const glossDto = (row) => ({
    form: row.form, source: 'ai', isWord: row.isWord, itemCode: row.itemCode ? Number(row.itemCode) : null, lemma: row.lemma, partOfSpeech: row.pos, ipa: row.ipa,
    formNote: row.formNote, meanings: row.meanings || [], examples: row.examples || [], synonyms: [], collocations: [],
  });

  const GLOSS_SEL = `g.word_gloss_id AS id, g.word_gloss_form AS form, g.word_gloss_lemma AS lemma, g.word_gloss_part_of_speech AS pos, g.word_gloss_pronunciation_ipa AS ipa,
    g.word_gloss_form_note AS "formNote", g.word_gloss_meanings AS meanings, g.word_gloss_examples AS examples, g.word_gloss_is_word AS "isWord",
    g.word_gloss_vocab_item_id AS "vocabItemId", i.item_code AS "itemCode", (i.item_status = 'published') AS "itemPublished"`;
  const findGloss = async (q, p, form) => {
    const { rows } = await q(
      `SELECT ${GLOSS_SEL} FROM content.word_gloss g LEFT JOIN content.item i ON i.item_id = g.word_gloss_vocab_item_id
        WHERE g.word_gloss_tenant_code = $1 AND g.word_gloss_language = 'en' AND g.word_gloss_form = $2`, [p.tenantCode, form]);
    return rows[0] || null;
  };

  const fromGloss = async (row) => {
    if (row.itemCode && row.itemPublished) {
      const it = await getPublishedItem(rawQuery, Number(row.itemCode));
      if (it?.kind === 'vocab_entry') {
        const b = it.body;
        return curatedDto(row.form, { itemCode: it.code, headword: b.headword, partOfSpeech: b.partOfSpeech, pronunciationIpa: b.pronunciationIpa, meanings: b.meanings, examples: b.examples, synonyms: b.synonyms, collocations: b.collocations },
          { formNote: row.formNote });
      }
    }
    return glossDto({ ...row, itemCode: null });
  };

  const parseGloss = (out) => {
    const isWord = out.isWord !== false;
    const lemma = lexiconForm(clean(out.lemma, 80) || '');
    let pos = String(out.partOfSpeech || '').toLowerCase().trim();
    pos = POS.includes(pos) ? pos : POS_ALIAS[pos] || (isWord ? 'noun' : null);
    const meanings = (Array.isArray(out.meanings) ? out.meanings : []).slice(0, 5)
      .map((m) => ({ tr: clean(m?.tr, 120), pos: POS.includes(String(m?.pos || '').toLowerCase()) ? String(m.pos).toLowerCase() : null, note: clean(m?.note, 160) }))
      .filter((m) => m.tr);
    const examples = (Array.isArray(out.examples) ? out.examples : []).slice(0, 2).map((x) => ({ en: clean(x?.en, 300), tr: clean(x?.tr, 300) })).filter((x) => x.en);
    if (isWord && (!lemma || !meanings.length)) return null;
    return { isWord, lemma: lemma || null, pos, ipa: clean(out.ipa, 120), formNote: clean(out.formNote, 200), meanings, examples };
  };

  /** AI açıklamasını önbelleğe yazar (çakışmada ilk kayıt kalır). lookups: dokunuştan 1, ön-çeviriden 0. */
  // Kök küratörlü sözlükte varsa (went → go) kayıt ona bağlanır; sonraki dokunuşlar doğrudan küratörlü kaydı açar.
  const curatedItemId = async (form, g) => {
    if (!g.isWord || !g.lemma || g.lemma === form) return null;
    const hit = await study.vocabLookup({ word: g.lemma, lang: 'en' });
    if (!hit.found) return null;
    return (await rawQuery(`SELECT item_id AS id FROM content.item WHERE item_code = $1`, [hit.primary.itemCode])).rows[0]?.id || null;
  };

  const saveGloss = async (p, form, g, model, userId, lookups = 1) => {
    const vocabItemId = await curatedItemId(form, g);
    await rawQuery(
      `INSERT INTO content.word_gloss (word_gloss_tenant_code, word_gloss_organization_id, word_gloss_language, word_gloss_form, word_gloss_lemma, word_gloss_part_of_speech,
              word_gloss_pronunciation_ipa, word_gloss_form_note, word_gloss_meanings, word_gloss_examples, word_gloss_is_word, word_gloss_vocab_item_id, word_gloss_model,
              word_gloss_lookup_count, word_gloss_created_by, word_gloss_updated_by)
       VALUES ($1,$2,'en',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$14,$13,$13)
       ON CONFLICT (word_gloss_tenant_code, word_gloss_language, word_gloss_form) DO NOTHING`,
      [p.tenantCode, p.organizationId, form, g.lemma || form, g.pos, g.ipa, g.formNote, JSON.stringify(g.meanings), JSON.stringify(g.examples), g.isWord, vocabItemId, model, userId, lookups]);
  };

  const glossFromAi = async (caller, p, form) => {
    await consume(caller, 'word');
    let g;
    let model;
    try {
      const r = await askAi(caller, 'word_gloss', [{ role: 'system', content: WORD_SYSTEM }, { role: 'user', content: `<kelime>${form}</kelime>` }], WORD_MAX_TOKENS);
      g = parseGloss(r.out);
      model = r.model;
      if (!g) throw lexFail('word_gloss', 'Translation was incomplete', { form, ...r.meta });
    } catch (e) {
      await refund(caller, 'word');
      throw e;
    }
    await saveGloss(p, form, g, model, userIdOf(caller));
    const row = await findGloss(rawQuery, p, form);
    return fromGloss(row);
  };

  /** Dokunulan kelimenin sözlük kaydı (küratörlü → önbellek → AI). */
  const word = async ({ caller, word: raw }) => {
    const form = formOf(raw);
    const hit = await study.vocabLookup({ word: form, lang: 'en' });
    const p = await platform();
    const row = await findGloss(rawQuery, p, form);
    // Kök sözlükte bulunduysa (studies → study) daha önce üretilmiş biçim notu korunur.
    if (hit.found) return curatedDto(form, hit.primary, { formNote: hit.matched !== form ? row?.formNote ?? null : null });
    if (row) {
      rawQuery(`UPDATE content.word_gloss SET word_gloss_lookup_count = word_gloss_lookup_count + 1 WHERE word_gloss_id = $1`, [row.id]).catch(() => {});
      return fromGloss(row);
    }
    // Aynı kelime için eşzamanlı istekler tek AI çağrısını paylaşır.
    if (!inflight.has(form)) inflight.set(form, glossFromAi(caller, p, form).finally(() => inflight.delete(form)));
    return inflight.get(form);
  };

  /**
   * Kelimeyi kartlara eklenebilir sözlük kaydına çevirir → { itemCode }. Küratörlü kayıt varsa o; yoksa AI açıklaması
   * 'ai_gloss' kaynaklı, yayımlanmış bir vocab_entry olur (CMS'te kaynağa göre süzülüp gözden geçirilebilir).
   */
  const ensureItem = async ({ caller, word: raw }) => {
    const entry = await word({ caller, word: raw });
    if (entry.itemCode) return { itemCode: Number(entry.itemCode), created: false };
    if (!entry.isWord || !entry.lemma || !entry.meanings.length) throw new DomainError('CONTENT_LEXICON_NOT_A_WORD', 'This entry cannot become a vocabulary card', { form: entry.form });
    const p = await platform();
    const headword = entry.lemma;
    const pos = POS.includes(entry.partOfSpeech) ? entry.partOfSpeech : 'noun';
    const result = await withTransaction(async (tx) => {
      const q = (s, prm) => tx.query(s, prm);
      await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`lexicon:item:${headword}:${pos}`]);
      const ex = await q(
        `SELECT i.item_id AS id, i.item_code AS code FROM content.vocab_entry v JOIN content.item i ON i.item_published_revision_id = v.vocab_entry_item_revision_id AND i.item_status = 'published'
          WHERE v.vocab_entry_headword_normalized = $1 AND v.vocab_entry_part_of_speech = $2 AND i.item_tenant_code = $3 LIMIT 1`, [normalizeHeadword(headword), pos, p.tenantCode]);
      let id;
      let code;
      let created = false;
      if (ex.rows.length) {
        ({ id, code } = ex.rows[0]);
      } else {
        const ctx = { tenantCode: p.tenantCode, organizationId: p.organizationId, userId: null };
        const c = await items.createInTx(tx, ctx, caller, {
          kind: 'vocab_entry', origin: 'ai_gloss', language: 'en', accessTier: 'free', changeNote: 'Dokun-çevir: öğrenci kartlarına ekledi (AI sözlük açıklaması)',
          body: { headword, partOfSpeech: pos, pronunciationIpa: entry.ipa, meanings: entry.meanings.map((m) => ({ tr: m.tr, note: m.note })), examples: entry.examples.map((x) => ({ en: x.en, tr: x.tr, examStyle: false })) },
        });
        const now = nowFn();
        await q(`UPDATE content.item_revision SET item_revision_review_status = 'approved', item_revision_submitted_at = $2, item_revision_reviewed_at = $2,
                   item_revision_decision_note = 'Otomatik yayın: AI sözlük açıklaması (gözden geçirilebilir)' WHERE item_revision_id = $1`, [c.revisionId, now]);
        await q(`UPDATE content.item SET item_published_revision_id = $2, item_published_at = $3, item_status = 'published' WHERE item_id = $1`, [c.id, c.revisionId, now]);
        ({ id, code } = c);
        created = true;
      }
      await q(`UPDATE content.word_gloss SET word_gloss_vocab_item_id = $3 WHERE word_gloss_tenant_code = $1 AND word_gloss_language = 'en' AND word_gloss_form = $2`, [p.tenantCode, entry.form, id]);
      return { itemCode: Number(code), created };
    });
    if (result.created) await cacheDel(vocabKey('en', headword), vocabKey('en', entry.form));
    return result;
  };

  // ── cümle ──
  /**
   * sentences: aynı metin bloğunun cümleleri (sırayla), index: basılı tutulan cümle.
   * Dönüş: { index, translation, translations: [{ index, text }] } — bloğun bilinen tüm çevirileri (istemci önbelleğe alır).
   */
  const sentence = async ({ caller, sentences, index = 0 }) => {
    const L = LEXICON_LIMITS;
    if (!Array.isArray(sentences) || !sentences.length || sentences.length > L.sentencesMax) throw new DomainError('CONTENT_LEXICON_SENTENCE_INVALID', `sentences must be 1-${L.sentencesMax} items`, { field: 'sentences' });
    const list = sentences.map((s) => normalizeSentence(s));
    const at = Number(index);
    if (!Number.isInteger(at) || at < 0 || at >= list.length) throw new DomainError('CONTENT_LEXICON_SENTENCE_INVALID', 'index out of range', { field: 'index' });
    if (!list[at] || list[at].length > L.sentenceMax) throw new DomainError('CONTENT_LEXICON_SENTENCE_INVALID', `sentence must be 1-${L.sentenceMax} characters`, { field: 'sentences' });
    // Blok sınırı aşılırsa yalnız hedef cümlenin çevresi kullanılır.
    let from = 0;
    let to = list.length;
    const total = (a, b) => list.slice(a, b).reduce((n, s) => n + s.length, 0);
    while (total(from, to) > L.blockMax && to - from > 1) {
      if (at - from > to - 1 - at) from++;
      else to--;
    }
    const block = [];
    for (let i = from; i < to; i++) if (list[i] && list[i].length <= L.sentenceMax) block.push({ index: i, text: list[i], hash: sentenceHash(list[i]) });
    const p = await platform();
    const { rows } = await rawQuery(
      `SELECT sentence_translation_hash AS hash, sentence_translation_text AS text FROM content.sentence_translation WHERE sentence_translation_tenant_code = $1 AND sentence_translation_hash = ANY($2::text[])`,
      [p.tenantCode, [...new Set(block.map((b) => b.hash))]]);
    const known = new Map(rows.map((r) => [r.hash.trim(), r.text]));
    const target = block.find((b) => b.index === at);
    if (!known.has(target.hash)) {
      const missing = [];
      const seen = new Set();
      for (const b of block) if (!known.has(b.hash) && !seen.has(b.hash)) { seen.add(b.hash); missing.push(b); }
      await consume(caller, 'sentence');
      let out;
      let model;
      let meta;
      try {
        const user = missing.map((m, i) => `[${i + 1}] ${m.text}`).join('\n');
        ({ out, model, meta } = await askAi(caller, 'sentence_translation', [{ role: 'system', content: SENTENCE_SYSTEM }, { role: 'user', content: user }], sentenceMaxTokens(user.length)));
      } catch (e) {
        await refund(caller, 'sentence');
        throw e;
      }
      const tr = Array.isArray(out.translations) ? out.translations.map((x) => clean(x, 2000)) : [];
      // Hizalama bozuksa (eksik/fazla öğe) yalnız tek cümlelik istekte ilk öğe güvenilir.
      const usable = tr.length === missing.length ? missing.map((m, i) => [m, tr[i]]) : missing.length === 1 && tr[0] ? [[missing[0], tr[0]]] : [];
      for (const [m, text] of usable) {
        if (!text) continue;
        known.set(m.hash, text);
        await rawQuery(
          `INSERT INTO content.sentence_translation (sentence_translation_tenant_code, sentence_translation_organization_id, sentence_translation_hash, sentence_translation_source_text,
                  sentence_translation_text, sentence_translation_model, sentence_translation_created_by, sentence_translation_updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT (sentence_translation_tenant_code, sentence_translation_hash) DO NOTHING`,
          [p.tenantCode, p.organizationId, m.hash, m.text, text, model, userIdOf(caller)]);
      }
      if (!known.has(target.hash)) {
        await refund(caller, 'sentence');
        throw lexFail('sentence_translation', 'Translation was incomplete', { sentences: missing.length, translations: tr.length, ...meta });
      }
    } else {
      rawQuery(`UPDATE content.sentence_translation SET sentence_translation_hit_count = sentence_translation_hit_count + 1 WHERE sentence_translation_tenant_code = $1 AND sentence_translation_hash = $2`,
        [p.tenantCode, target.hash]).catch(() => {});
    }
    return {
      index: at, translation: known.get(target.hash),
      translations: block.filter((b) => known.has(b.hash)).map((b) => ({ index: b.index, text: known.get(b.hash) })),
    };
  };

  // ── ön-çeviri (lexicon-prefill işi) ──
  // Kullanıcı beklemesin diye yayındaki içeriğin kelime/cümleleri arka planda, gruplar halinde çevrilir. Sonuç aynı önbelleğe
  // (word_gloss / sentence_translation) yazılır; kullanıcı sınırı düşmez. Model çağıran verir (iş yalnız ':free' modele izin verir).
  /** forms: geçerli sözlük anahtarları → { saved, failed: [form], meta } */
  const prefillWords = async (forms, { model, timeoutMs } = {}) => {
    const p = await platform();
    const user = forms.map((f, i) => `[${i + 1}] ${f}`).join('\n');
    const { out, model: used, meta } = await askAi(null, 'lexicon_prefill', [{ role: 'system', content: WORDS_SYSTEM }, { role: 'user', content: user }],
      Math.min(8000, forms.length * 220 + 400), { model, timeoutMs });
    const entries = Array.isArray(out.entries) ? out.entries : [];
    const byWord = new Map(entries.map((e) => [lexiconForm(String(e?.word || '')), e]));
    let saved = 0;
    const failed = [];
    for (let i = 0; i < forms.length; i++) {
      const f = forms[i];
      // Sıra kaymasına karşı önce kelimeyle eşle; kelime alanı yoksa ve sayı tutuyorsa sıraya güven.
      const e = byWord.get(f) || (entries.length === forms.length && !entries[i]?.word ? entries[i] : null);
      const g = e ? parseGloss(e) : null;
      if (!g) { failed.push(f); continue; }
      await saveGloss(p, f, g, used, null, 0);
      saved++;
    }
    return { saved, failed, meta };
  };

  /** sentences: aynı metinden sıralı, normalize cümleler (bağlam için) → { saved, failed, meta } */
  const prefillSentences = async (sentences, { model, timeoutMs } = {}) => {
    const p = await platform();
    const user = sentences.map((t, i) => `[${i + 1}] ${t}`).join('\n');
    const { out, model: used, meta } = await askAi(null, 'lexicon_prefill', [{ role: 'system', content: SENTENCE_SYSTEM }, { role: 'user', content: user }],
      sentenceMaxTokens(user.length), { model, timeoutMs });
    const tr = Array.isArray(out.translations) ? out.translations.map((x) => clean(x, 2000)) : [];
    if (tr.length !== sentences.length) return { saved: 0, failed: sentences, meta: { ...meta, got: tr.length } };
    let saved = 0;
    const failed = [];
    for (let i = 0; i < sentences.length; i++) {
      if (!tr[i]) { failed.push(sentences[i]); continue; }
      await rawQuery(
        `INSERT INTO content.sentence_translation (sentence_translation_tenant_code, sentence_translation_organization_id, sentence_translation_hash, sentence_translation_source_text,
                sentence_translation_text, sentence_translation_model, sentence_translation_created_by, sentence_translation_updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL) ON CONFLICT (sentence_translation_tenant_code, sentence_translation_hash) DO NOTHING`,
        [p.tenantCode, p.organizationId, sentenceHash(sentences[i]), sentences[i], tr[i], used]);
      saved++;
    }
    return { saved, failed, meta };
  };

  // ── kontrol (lexicon-review işi) ──
  // Yalnız ücretsiz modelden gelmiş ve henüz denetlenmemiş kayıtlar (model ':free' ile biter, reviewed_at boş). Cevap bozuksa hiçbiri
  // işaretlenmez (sonraki turda yeniden denenir); geçerli cevapta düzeltmeler uygulanır, gruptaki tüm kayıtlar denetlendi sayılır.
  const fixesOf = (out, n) => {
    if (!Array.isArray(out?.fixes)) return null;
    return out.fixes.filter((f) => Number.isInteger(Number(f?.n)) && Number(f.n) >= 1 && Number(f.n) <= n);
  };

  /** → { reviewed, fixed, meta } (reviewed 0: denetlenecek kayıt yok) */
  const reviewWords = async ({ limit = 25, model, timeoutMs } = {}) => {
    const p = await platform();
    const { rows } = await rawQuery(
      `SELECT ${GLOSS_SEL} FROM content.word_gloss g LEFT JOIN content.item i ON i.item_id = g.word_gloss_vocab_item_id
        WHERE g.word_gloss_tenant_code = $1 AND g.word_gloss_language = 'en' AND g.word_gloss_model LIKE '%:free' AND g.word_gloss_reviewed_at IS NULL
        ORDER BY g.word_gloss_id LIMIT $2`, [p.tenantCode, limit]);
    if (!rows.length) return { reviewed: 0, fixed: 0, meta: null };
    const user = rows.map((r, i) => `[${i + 1}] ${JSON.stringify({ word: r.form, isWord: r.isWord, lemma: r.lemma, partOfSpeech: r.pos, ipa: r.ipa, formNote: r.formNote, meanings: r.meanings, examples: r.examples })}`).join('\n');
    const { out, model: used, meta } = await askAi(null, 'lexicon_review', [{ role: 'system', content: WORDS_REVIEW_SYSTEM }, { role: 'user', content: user }],
      Math.min(8000, rows.length * 220 + 400), { model, timeoutMs });
    const fixes = fixesOf(out, rows.length);
    if (!fixes) throw lexFail('lexicon_review', 'Review returned no fixes array', meta);
    const now = nowFn();
    let fixed = 0;
    for (const f of fixes) {
      const row = rows[Number(f.n) - 1];
      const g = parseGloss(f);
      if (!g) continue;
      await rawQuery(
        `UPDATE content.word_gloss SET word_gloss_lemma = $2, word_gloss_part_of_speech = $3, word_gloss_pronunciation_ipa = $4, word_gloss_form_note = $5,
                word_gloss_meanings = $6, word_gloss_examples = $7, word_gloss_is_word = $8, word_gloss_vocab_item_id = COALESCE($9, word_gloss_vocab_item_id)
          WHERE word_gloss_id = $1`,
        [row.id, g.lemma || row.form, g.pos, g.ipa, g.formNote, JSON.stringify(g.meanings), JSON.stringify(g.examples), g.isWord, await curatedItemId(row.form, g)]);
      fixed++;
    }
    await rawQuery(`UPDATE content.word_gloss SET word_gloss_reviewed_at = $2, word_gloss_review_model = $3 WHERE word_gloss_id = ANY($1::bigint[])`,
      [rows.map((r) => r.id), now, used]);
    return { reviewed: rows.length, fixed, meta };
  };

  /** → { reviewed, fixed, meta } */
  const reviewSentences = async ({ limit = 40, maxChars = 6000, model, timeoutMs } = {}) => {
    const p = await platform();
    const { rows: all } = await rawQuery(
      `SELECT sentence_translation_id AS id, sentence_translation_source_text AS en, sentence_translation_text AS tr FROM content.sentence_translation
        WHERE sentence_translation_tenant_code = $1 AND sentence_translation_model LIKE '%:free' AND sentence_translation_reviewed_at IS NULL
        ORDER BY sentence_translation_id LIMIT $2`, [p.tenantCode, limit]);
    const rows = [];
    let chars = 0;
    for (const r of all) {
      if (rows.length && chars + r.en.length + r.tr.length > maxChars) break;
      rows.push(r);
      chars += r.en.length + r.tr.length;
    }
    if (!rows.length) return { reviewed: 0, fixed: 0, meta: null };
    const user = rows.map((r, i) => `[${i + 1}] EN: ${r.en}\n    TR: ${r.tr}`).join('\n');
    const { out, model: used, meta } = await askAi(null, 'lexicon_review', [{ role: 'system', content: SENTENCES_REVIEW_SYSTEM }, { role: 'user', content: user }],
      sentenceMaxTokens(chars), { model, timeoutMs });
    const fixes = fixesOf(out, rows.length);
    if (!fixes) throw lexFail('lexicon_review', 'Review returned no fixes array', meta);
    const now = nowFn();
    let fixed = 0;
    for (const f of fixes) {
      const text = clean(f.tr, 2000);
      if (!text) continue;
      await rawQuery(`UPDATE content.sentence_translation SET sentence_translation_text = $2 WHERE sentence_translation_id = $1`, [rows[Number(f.n) - 1].id, text]);
      fixed++;
    }
    await rawQuery(`UPDATE content.sentence_translation SET sentence_translation_reviewed_at = $2, sentence_translation_review_model = $3 WHERE sentence_translation_id = ANY($1::bigint[])`,
      [rows.map((r) => r.id), now, used]);
    return { reviewed: rows.length, fixed, meta };
  };

  return Object.freeze({ word, ensureItem, sentence, prefillWords, prefillSentences, reviewWords, reviewSentences });
};
