import { DomainError, fetchInternal, internalHeaders, getEntitlements } from 'app-shared';

// Kitap soruları ("Bu kitaptan soru çöz"). Yalnız ücretli planlar (book_quiz özelliği).
// Kitap başına BİR KEZ, biri soruları ilk açtığında üretilir ve saklanır; herkes aynısını görür (hiç açılmayan kitap için ücret yok).
// Girdi: kitabın kendi soruları (çıkarmada ayrılan ham metin, book_metadata.quiz) + cevap anahtarı + kitaptan seçilen birkaç parça.
// Çıktı: kitabın çoktan seçmeli soruları (cevabı anahtardan ya da metinden) + toplam 10'a tamamlayan yeni sorular + etkinlik listesi.
// Model: içerik modeli (CONTENT_MODEL, en ucuz katman), sağlayıcı sırası 'price'. Ücret tutor.ai_usage'a 'book_quiz' olarak yazılır.
// Günlük tavan BOOK_QUIZ_DAILY_USD (varsayılan 0.5; 0: yeni üretim kapalı).

const tutorUrl = () => `${(process.env.SERVICE_TUTOR_REST_URL || process.env.TUTOR_REST_URL || 'http://127.0.0.1:2005').replace(/\/$/, '')}/api/sinav-service-tutor/v1`;
const TARGET = 10;
const MAX_QUESTIONS = 15;
const PASSAGES = 6;
const PASSAGE_WORDS = 300;
const STALE_MS = 3 * 60 * 1000;
const RETRY_AFTER_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 150000;
const dailyCapMicros = () => {
  const v = process.env.BOOK_QUIZ_DAILY_USD;
  const n = v === undefined || v === '' ? 0.5 : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) : 0;
};

const SYSTEM = `[gen:book:quiz] You write reading-comprehension questions for a graded English reader used by Turkish learners preparing for YDS/YÖKDİL.
You receive the book title and level, optional QUESTIONS FROM THE BOOK (raw text cut from the PDF: numbers and a/b/c options may be merged on one line), an optional ANSWER KEY, optional ACTIVITIES (raw text) and numbered PASSAGES from the book.
Return ONLY JSON: {"bookQuestions":[...],"newQuestions":[...],"activities":[...]}
Question object: {"stem":"...","options":["...","..."],"answer":<0-based index of the correct option or null>,"explanation":"<one short Turkish sentence saying why>"}
- bookQuestions: every multiple-choice question in QUESTIONS FROM THE BOOK, cleaned up (keep the book's wording, fix broken spacing, drop the a/b/c letters). Use the ANSWER KEY when it gives the answer; otherwise set answer only if the PASSAGES clearly support it, else null. [] if there are none.
- newQuestions: new multiple-choice questions about the PASSAGES only (detail, main idea, inference, vocabulary in context), 4 options each, exactly one correct, plausible wrong options, at the book's level, in English. Write enough that bookQuestions with an answer plus newQuestions make ${TARGET} (at least 3 new questions). Do not repeat a book question.
- activities: the open tasks in ACTIVITIES (discussion, writing, vocabulary practice) as short self-contained English prompts without page references, at most 15; [] if none.`;

const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanQuestion = (q, source) => {
  if (!q || typeof q !== 'object') return null;
  const stem = str(q.stem, 500);
  const options = Array.isArray(q.options) ? q.options.map((o) => str(o, 240)).filter(Boolean) : [];
  const answer = Number(q.answer);
  if (!stem || options.length < 2 || options.length > 5 || new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  return { stem, options, answer, explanation: str(q.explanation, 300) || null, source };
};

const wordsOf = (t) => String(t || '').split(/\s+/).filter(Boolean).length;

export const makeBookQuiz = ({ rawQuery, nowFn, fetchFn, books }) => {
  const inflight = new Map();

  const rowOf = async (bookId) => {
    const { rows } = await rawQuery(
      `SELECT book_quiz_status AS status, book_quiz_questions AS questions, book_quiz_activities AS activities, book_quiz_error_code AS "errorCode",
              book_quiz_started_at AS "startedAt", book_quiz_updated_at AS "updatedAt"
         FROM content.book_quiz WHERE book_quiz_book_id = $1`, [bookId]);
    return rows[0] || null;
  };

  const spentTodayMicros = async () => {
    const { rows } = await rawQuery(
      `SELECT coalesce(sum(ai_usage_cost_micros), 0)::bigint AS spent FROM tutor.ai_usage
        WHERE ai_usage_feature = 'book_quiz' AND ai_usage_created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`);
    return Number(rows[0].spent) || 0;
  };

  /** Kitaba yayılan birkaç parça (ilk/son bölüm dahil, eşit aralıklı): soru için yeterli bağlam, az token. */
  const passagesOf = async (bookId) => {
    const { rows } = await rawQuery(
      `SELECT book_section_position AS position, book_section_word_count AS words FROM content.book_section
        WHERE book_section_book_id = $1 AND book_section_word_count >= 60 ORDER BY book_section_position`, [bookId]);
    if (!rows.length) return [];
    const n = Math.min(PASSAGES, rows.length);
    const picked = [...new Set(Array.from({ length: n }, (_, i) => rows[Math.round((i * (rows.length - 1)) / Math.max(1, n - 1))].position))];
    const { rows: secs } = await rawQuery(
      `SELECT book_section_position AS position, book_section_blocks AS blocks FROM content.book_section
        WHERE book_section_book_id = $1 AND book_section_position = ANY($2::int[]) ORDER BY book_section_position`, [bookId, picked]);
    return secs.map((s) => {
      const paras = (Array.isArray(s.blocks) ? s.blocks : []).filter((b) => b.t !== 'h').map((b) => String(b.x || '').trim()).filter(Boolean);
      // Bölümün ortasından ~300 kelime: başlık/giriş cümleleri yerine olay ve bilgi.
      const take = (from) => {
        const out = [];
        let words = 0;
        for (let i = from; i < paras.length && words < PASSAGE_WORDS; i += 1) {
          out.push(paras[i]);
          words += wordsOf(paras[i]);
        }
        return { text: out.join('\n'), words };
      };
      const mid = take(Math.floor(paras.length / 3));
      return (mid.words >= PASSAGE_WORDS / 2 ? mid : take(0)).text;
    }).filter(Boolean);
  };

  const markFailed = (bookId, code) => rawQuery(
    `UPDATE content.book_quiz SET book_quiz_status = 'failed', book_quiz_error_code = $2 WHERE book_quiz_book_id = $1`, [bookId, code]);

  const generate = async (book) => {
    try {
      const cap = dailyCapMicros();
      if (!cap || (await spentTodayMicros()) >= cap) {
        await markFailed(book.id, 'READING_QUIZ_BUSY');
        return;
      }
      const material = book.material && typeof book.material === 'object' ? book.material : {};
      const own = (material.questions || []).map((q) => q.text).join('\n\n').slice(0, 12000);
      const keys = (material.keys || []).join('\n').slice(0, 1500);
      const acts = (material.activities || []).map((a) => a.text).join('\n\n').slice(0, 8000);
      const passages = await passagesOf(book.id);
      if (!own && !passages.length) {
        await markFailed(book.id, 'READING_QUIZ_NO_TEXT');
        return;
      }
      const user = [
        `TITLE: ${book.title}${book.level ? `\nLEVEL: ${book.level}` : ''}`,
        own ? `QUESTIONS FROM THE BOOK:\n${own}` : 'QUESTIONS FROM THE BOOK: (none)',
        keys ? `ANSWER KEY:\n${keys}` : 'ANSWER KEY: (none)',
        acts ? `ACTIVITIES:\n${acts}` : 'ACTIVITIES: (none)',
        `PASSAGES:\n${passages.map((p, i) => `[${i + 1}]\n${p}`).join('\n\n')}`,
      ].join('\n\n');
      let res;
      try {
        res = await fetchInternal(`${tutorUrl()}/internal/ai/complete`, {
          method: 'POST', headers: internalHeaders(null), timeoutMs: TIMEOUT_MS, fetchFn,
          body: { feature: 'book_quiz', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], json: true, maxTokens: 4000, reasoning: 'none', providerSort: 'price' },
        });
      } catch {
        await markFailed(book.id, 'READING_QUIZ_UNAVAILABLE');
        return;
      }
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      const data = body?.data ?? body;
      if (!res.ok || body?.success === false || !data?.json) {
        console.warn(`[book-quiz] ${book.code}: ${res.status} ${body?.error?.code || 'no json'}`);
        await markFailed(book.id, 'READING_QUIZ_UNAVAILABLE');
        return;
      }
      const out = data.json;
      const fromBook = (Array.isArray(out.bookQuestions) ? out.bookQuestions : []).map((q) => cleanQuestion(q, 'book')).filter(Boolean);
      const fresh = (Array.isArray(out.newQuestions) ? out.newQuestions : []).map((q) => cleanQuestion(q, 'ai')).filter(Boolean);
      const seen = new Set();
      const questions = [...fromBook, ...fresh].filter((q) => {
        const k = q.stem.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, Math.max(TARGET, Math.min(MAX_QUESTIONS, fromBook.length + 3)));
      const activities = (Array.isArray(out.activities) ? out.activities : []).map((a) => str(a, 400)).filter(Boolean).slice(0, 15);
      if (!questions.length && !activities.length) {
        await markFailed(book.id, 'READING_QUIZ_UNAVAILABLE');
        return;
      }
      await rawQuery(
        `UPDATE content.book_quiz SET book_quiz_status = 'ready', book_quiz_questions = $2::jsonb, book_quiz_activities = $3::jsonb, book_quiz_model = $4,
                book_quiz_cost_micros = book_quiz_cost_micros + $5, book_quiz_error_code = NULL,
                book_quiz_metadata = $6::jsonb
          WHERE book_quiz_book_id = $1`,
        [book.id, JSON.stringify(questions.map((q, i) => ({ id: i + 1, ...q }))), JSON.stringify(activities), String(data.model || '').slice(0, 100) || null,
          Number(data.usage?.costMicros) || 0, JSON.stringify({ fromBook: fromBook.length, generated: fresh.length, finishReason: data.finishReason || null })]);
    } catch (e) {
      console.warn(`[book-quiz] ${book.code}: ${String(e.message).slice(0, 200)}`);
      await markFailed(book.id, 'READING_QUIZ_UNAVAILABLE').catch(() => {});
    }
  };

  /**
   * Kitabın soruları. Hazır değilse üretimi başlatır ve { status: 'generating' } döner (istemci birkaç saniyede bir yeniden sorar).
   * → { status: 'ready'|'generating'|'failed', questions: [{ id, stem, options, answer, explanation, source: 'book'|'ai' }], activities: [metin], errorCode }
   */
  const get = async ({ caller, code }) => {
    const b = await books.getBook({ caller, code });
    if (b.locked) throw new DomainError('READING_BOOK_LOCKED', 'This book requires Premium', undefined, 402);
    const ent = await getEntitlements(Number(caller.callerUserId)).catch(() => null);
    if (!ent?.features?.book_quiz?.enabled) throw new DomainError('READING_QUIZ_LOCKED', 'Book questions require a paid plan', undefined, 402);
    if (b.status !== 'ready') throw new DomainError('READING_QUIZ_NOT_READY', 'The book is not ready yet', undefined, 409);
    const { rows } = await rawQuery(
      `SELECT book_id AS id, book_code AS code, book_title AS title, book_level AS level, book_tenant_code AS "tenantCode", book_organization_id AS "organizationId",
              book_metadata->'quiz' AS material FROM content.book WHERE book_code = $1`, [Number(b.code)]);
    const book = rows[0];
    const row = await rowOf(book.id);
    const now = nowFn().getTime();
    const shape = (r) => ({ status: r.status, questions: r.status === 'ready' ? r.questions : [], activities: r.status === 'ready' ? r.activities : [], errorCode: r.status === 'failed' ? r.errorCode : null });
    if (row?.status === 'ready') return shape(row);
    if (row?.status === 'generating' && (inflight.has(book.id) || now - new Date(row.startedAt).getTime() < STALE_MS)) return shape(row);
    if (row?.status === 'failed' && now - new Date(row.updatedAt).getTime() < RETRY_AFTER_MS) return shape(row);
    // Üretimi tek istek başlatır: satır kilidiyle 'generating'e geçen kazanır.
    const { rows: claimed } = await rawQuery(
      `INSERT INTO content.book_quiz (book_quiz_tenant_code, book_quiz_organization_id, book_quiz_book_id, book_quiz_status, book_quiz_started_at, book_quiz_attempts, book_quiz_created_by)
       VALUES ($1, $2, $3, 'generating', now(), 1, $4)
       ON CONFLICT (book_quiz_book_id) DO UPDATE SET book_quiz_status = 'generating', book_quiz_started_at = now(), book_quiz_attempts = content.book_quiz.book_quiz_attempts + 1,
              book_quiz_error_code = NULL
        WHERE content.book_quiz.book_quiz_status <> 'ready'
          AND (content.book_quiz.book_quiz_status <> 'generating' OR content.book_quiz.book_quiz_started_at < now() - interval '3 minutes')
       RETURNING book_quiz_id`, [book.tenantCode, book.organizationId, book.id, Number(caller.callerUserId) || null]);
    if (claimed.length && !inflight.has(book.id)) {
      inflight.set(book.id, generate(book).finally(() => inflight.delete(book.id)));
    }
    return { status: 'generating', questions: [], activities: [], errorCode: null };
  };

  return Object.freeze({ get });
};
