import { tokenize, splitSentences, normalizeSentence, markdownTapLines, lexiconForm, LEXICON_LIMITS } from 'app-shared';
import { getPlatform, catalogVersion, normalizeHeadword } from '../shared/helpers.js';
import { isLexiconForm, sentenceHash } from './lexicon.js';
import { headwordCandidates } from './study.js';

// Dokun-çevir ön-çevirisi (iş: jobs.js 'lexicon-prefill', dakikada bir). Yayındaki içeriğin (soru kökü, şık, paragraf) kelime ve
// cümlelerini arka planda, gruplar halinde çevirip dokun-çevirin önbelleğine yazar → öğrenci dokununca AI beklemeden açılır.
// Yeni yayın katalog sürümünü artırır; iş bunu görüp yeniden tarar (yeni içerik kendiliğinden çevrilir).
//
// YALNIZ ÜCRETSİZ MODEL: LEXICON_PREFILL_MODELS (virgülle; ör. google/gemma-4-31b-it:free). Boşsa iş kapalı. ':free' ile bitmeyen
// bir ad varsa iş hiç çalışmaz; bir cevap ücretli gelirse (costMicros > 0) iş süreç boyunca kendini kapatır.
// Ücretsiz modellerin günlük istek sınırı var (OpenRouter, 00:00 UTC'de sıfırlanır): 429 üst üste gelirse iş ertesi güne kadar bekler.
//
// Eşleşme kuralı: önbellek anahtarı cümle metni (sentenceHash) ve kelime biçimi (lexiconForm). Metin, web'in TapText'e verdiği
// biçimde üretilir: Markdown ile çizilen alanlar markdownTapLines (web Markdown bileşeniyle aynı ayrıştırıcı), şıklar düz metin.

const WORDS_PER_BATCH = 15;
const SENTENCE_BATCH_CHARS = 2500;
const SENTENCE_BATCH_MAX = 30;
const TICK_BUDGET_MS = 45000; // bu süreden sonra yeni grup başlatılmaz (iş kilidi 300 sn)
const RESCAN_MS = 6 * 3600 * 1000;
const AI_TIMEOUT_MS = 100000;
const MAX_TRIES = 3;
const HAS_LETTER = /[A-Za-z]/;

const splitList = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const nextUtcMidnight = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5);
};

export const makeLexiconPrefill = ({ rawQuery, nowFn = () => new Date(), lexicon }) => {
  const st = { ver: null, scannedAt: 0, words: [], sentences: [], tries: new Map(), pausedUntil: 0, rate429: 0, errors: 0, modelIdx: 0, disabled: null, warned: null };
  const models = () => splitList(process.env.LEXICON_PREFILL_MODELS);

  // Yayındaki İngilizce metinler; sıra: madde, sonra paragraf → kök → şıklar (cümle grupları bağlamı korusun).
  const loadTexts = async () => (await rawQuery(
    `WITH pub AS (SELECT i.item_id, i.item_published_revision_id AS rid FROM content.item i WHERE i.item_status = 'published' AND i.item_language = 'en')
     SELECT 'md' AS f, ps.passage_body AS t, pub.item_id AS ord, 0 AS pos, '' AS lbl FROM content.passage ps JOIN pub ON pub.rid = ps.passage_item_revision_id
     UNION ALL SELECT 'md', q.question_stem, pub.item_id, 1, '' FROM content.question q JOIN pub ON pub.rid = q.question_item_revision_id WHERE q.question_stem IS NOT NULL
     UNION ALL SELECT 'plain', o.question_option_text, pub.item_id, 2, o.question_option_label FROM content.question_option o
       JOIN content.question q ON q.question_id = o.question_option_question_id JOIN pub ON pub.rid = q.question_item_revision_id
     ORDER BY 3, 4, 5`)).rows;

  const rescan = async () => {
    const freq = new Map();
    const sentences = [];
    const seen = new Set();
    for (const r of await loadTexts()) {
      const lines = r.f === 'md' ? markdownTapLines(r.t) : [String(r.t ?? '')];
      for (const line of lines) {
        for (const tok of tokenize(line).tokens) {
          if (!tok.word) continue;
          const f = lexiconForm(tok.text);
          if (isLexiconForm(f)) freq.set(f, (freq.get(f) || 0) + 1);
        }
        for (const s of splitSentences(line)) {
          const text = normalizeSentence(s.text);
          if (!text || text.length > LEXICON_LIMITS.sentenceMax || !HAS_LETTER.test(text)) continue;
          const hash = sentenceHash(text);
          if (seen.has(hash)) continue;
          seen.add(hash);
          sentences.push({ text, hash });
        }
      }
    }
    const p = await getPlatform(rawQuery);
    const glossed = new Set((await rawQuery(
      `SELECT word_gloss_form AS f FROM content.word_gloss WHERE word_gloss_tenant_code = $1 AND word_gloss_language = 'en'`, [p.tenantCode])).rows.map((x) => x.f));
    // Küratörlü sözlükte kökü olan kelime dokununca zaten sözlükten açılır (vocabLookup ile aynı kök kuralı).
    const curated = new Set((await rawQuery(
      `SELECT DISTINCT v.vocab_entry_headword_normalized AS h FROM content.vocab_entry v
         JOIN content.item i ON i.item_published_revision_id = v.vocab_entry_item_revision_id AND i.item_status = 'published' WHERE i.item_language = 'en'`)).rows.map((x) => x.h));
    const done = new Set((await rawQuery(
      `SELECT sentence_translation_hash AS h FROM content.sentence_translation WHERE sentence_translation_tenant_code = $1`, [p.tenantCode])).rows.map((x) => String(x.h).trim()));
    st.words = [...freq.entries()]
      .filter(([f]) => !glossed.has(f) && !headwordCandidates(normalizeHeadword(f)).some((c) => curated.has(c)))
      .sort((a, b) => b[1] - a[1]) // sık geçen kelime önce
      .map(([f]) => f);
    st.sentences = sentences.filter((s) => !done.has(s.hash));
    st.tries.clear();
  };

  const takeSentences = () => {
    const out = [];
    let chars = 0;
    for (const s of st.sentences) {
      if (out.length && (chars + s.text.length > SENTENCE_BATCH_CHARS || out.length >= SENTENCE_BATCH_MAX)) break;
      out.push(s);
      chars += s.text.length;
    }
    return out;
  };

  // Başarısız öğeler kuyruğun sonuna gider; MAX_TRIES'tan sonra bir sonraki taramaya kadar bırakılır (kuyruğu tıkamasın).
  const requeue = (key, items, getKey) => {
    const back = items.filter((x) => {
      const k = getKey(x);
      const n = (st.tries.get(k) || 0) + 1;
      st.tries.set(k, n);
      return n < MAX_TRIES;
    });
    st[key].push(...back);
  };

  const onError = (e, model, now) => {
    const upstream = e?.details?.upstream;
    st.modelIdx++; // sonraki denemede listedeki diğer model
    if (upstream === 'LLM_RATE_LIMITED' || upstream === 429) {
      st.rate429++;
      st.pausedUntil = st.rate429 >= 2 ? nextUtcMidnight(now) : now + 15 * 60 * 1000;
      console.warn(`[lexicon-prefill] ${model}: istek sınırı (429), ${new Date(st.pausedUntil).toISOString()} tarihine kadar bekliyor`);
      return;
    }
    st.errors++;
    console.warn(`[lexicon-prefill] ${model}: ${e?.code || ''} ${String(e?.message || e).slice(0, 200)}`);
    if (st.errors >= 3) {
      st.pausedUntil = now + 30 * 60 * 1000;
      st.errors = 0;
    }
  };

  /** Bir iş turu: süre bütçesi bitene, kuyruk boşalana ya da hata/sınıra kadar gruplar halinde çevirir. */
  const tick = async () => {
    const list = models();
    if (!list.length) return { skipped: 'off' };
    if (st.disabled) return { skipped: st.disabled };
    const paid = list.filter((m) => !m.endsWith(':free'));
    if (paid.length) {
      if (st.warned !== 'paid') console.error(`[lexicon-prefill] KAPALI: yalnız ':free' modele izin var, ücretli ad bulundu: ${paid.join(', ')}`);
      st.warned = 'paid';
      return { skipped: 'paid-model' };
    }
    const now = nowFn().getTime();
    if (now < st.pausedUntil) return { skipped: 'paused' };
    const ver = await catalogVersion();
    if (st.ver !== ver || now - st.scannedAt > RESCAN_MS) {
      await rescan();
      st.ver = ver;
      st.scannedAt = now;
      console.log(`[lexicon-prefill] tarama: çevrilecek kelime ${st.words.length}, cümle ${st.sentences.length}`);
    }
    const started = Date.now();
    let words = 0;
    let sentences = 0;
    let model = null;
    while (Date.now() - started < TICK_BUDGET_MS && (st.words.length || st.sentences.length)) {
      model = list[st.modelIdx % list.length];
      const isWords = st.words.length > 0;
      const batch = isWords ? st.words.slice(0, WORDS_PER_BATCH) : takeSentences();
      if (isWords) st.words = st.words.slice(batch.length);
      else st.sentences = st.sentences.slice(batch.length);
      let r;
      try {
        r = isWords
          ? await lexicon.prefillWords(batch, { model, timeoutMs: AI_TIMEOUT_MS })
          : await lexicon.prefillSentences(batch.map((s) => s.text), { model, timeoutMs: AI_TIMEOUT_MS });
      } catch (e) {
        if (isWords) requeue('words', batch, (f) => f);
        else requeue('sentences', batch, (s) => s.hash);
        onError(e, model, nowFn().getTime());
        break;
      }
      if (r.meta?.costMicros > 0) {
        st.disabled = 'paid-response';
        console.error(`[lexicon-prefill] KAPATILDI: ${r.meta.model || model} ücretli cevap verdi (${r.meta.costMicros} mikro-$). Yeniden açmak için servisi yeniden başlat.`);
        break;
      }
      st.errors = 0;
      st.rate429 = 0;
      if (isWords) {
        words += r.saved;
        requeue('words', r.failed, (f) => f);
      } else {
        sentences += r.saved;
        const failed = new Set(r.failed);
        requeue('sentences', batch.filter((s) => failed.has(s.text)), (s) => s.hash);
      }
    }
    if (words || sentences) {
      console.log(`[lexicon-prefill] +${words} kelime, +${sentences} cümle (${model}); kalan kelime ${st.words.length}, cümle ${st.sentences.length}`);
    }
    return { changed: words + sentences };
  };

  /** Durum (izleme için): kuyrukta kalanlar ve bekleme. */
  const status = () => ({ models: models(), remainingWords: st.words.length, remainingSentences: st.sentences.length, pausedUntil: st.pausedUntil ? new Date(st.pausedUntil).toISOString() : null, disabled: st.disabled });

  return Object.freeze({ tick, status });
};
