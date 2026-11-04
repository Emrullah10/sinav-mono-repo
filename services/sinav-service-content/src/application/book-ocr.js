import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DomainError, withTransaction, fetchInternal, internalHeaders } from 'app-shared';
import { reqCode } from '../shared/helpers.js';
import { bookLimits } from './books.js';
import { runBookWorker } from './book-worker.js';

// Taranmış PDF → metin. Ücretli iş: kullanıcı onaylar (POST /reading/books/{code}/ocr), sayfa hakkı DB'de satır kilidiyle ayrılır, işlenemeyen sayfa iade edilir.
// Cron dakikada en çok PAGES_PER_TICK sayfa işler (AIGW 60 rpm'e yer bırakır); günlük dolar tavanı dolunca iş ertesi güne kalır (BOOK_OCR_DAILY_USD, varsayılan 0.5, 0: kapalı).
// Tüm sayfalar bitince kitap yeniden 'processing' olur: metin kurma adımı OCR metnini de alarak aynı koddan geçer (books.js).

const tutorUrl = () => `${(process.env.SERVICE_TUTOR_REST_URL || process.env.TUTOR_REST_URL || 'http://127.0.0.1:2005').replace(/\/$/, '')}/api/sinav-service-tutor/v1`;
const PAGES_PER_TICK = 20;
const CONCURRENCY = 3;
const MAX_PAGE_ATTEMPTS = 3;
const MAX_SLICE_BYTES = 7 * 1024 * 1024; // base64 + JSON, tutor ve AIGW'nin 10 MB gövde sınırına sığsın
const TIMEOUT_MS = 150000;
const dailyCapMicros = () => {
  const v = process.env.BOOK_OCR_DAILY_USD;
  const n = v === undefined || v === '' ? 0.5 : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) : 0;
};

export const makeBookOcr = ({ rawQuery, nowFn, fetchFn, files, books }) => {
  const periodOf = () => nowFn().toISOString().slice(0, 7);

  /** Kullanıcı onayı: Premium + aylık sayfa hakkı. Yalnız metni olmayan sayfalar işlenir ve hakkından düşer. */
  const start = async ({ caller, code }) => {
    const r = await books.ownBook(caller, reqCode(code, 'READING_BOOK_NOT_FOUND', 'Book not found'));
    if (r.status !== 'scanned') throw new DomainError('READING_OCR_NOT_APPLICABLE', 'This book does not need OCR', { status: r.status }, 409);
    if (!r.hasFile) throw new DomainError('READING_FILE_NOT_FOUND', 'Original file is missing', undefined, 404);
    const uid = Number(caller.callerUserId);
    const tier = await books.tierOf(uid);
    const limit = bookLimits().ocrPages[tier];
    if (!limit) throw new DomainError('READING_OCR_PREMIUM', 'OCR requires Premium', { tier }, 402);
    const meta = await rawQuery(`SELECT book_metadata->'textlessPages' AS pages FROM content.book WHERE book_id = $1`, [r.id]);
    const pages = Array.isArray(meta.rows[0]?.pages) ? meta.rows[0].pages.map(Number).filter(Number.isInteger) : [];
    if (!pages.length) throw new DomainError('READING_OCR_NOT_APPLICABLE', 'This book does not need OCR', undefined, 409);
    const period = periodOf();
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO content.book_ocr_usage (book_ocr_usage_tenant_code, book_ocr_usage_organization_id, book_ocr_usage_user_account_id, book_ocr_usage_period) VALUES ($1,$2,$3,$4)
         ON CONFLICT (book_ocr_usage_user_account_id, book_ocr_usage_period) DO NOTHING`, [r.tenantCode, r.organizationId, uid, period]);
      const lock = await tx.query(`SELECT book_ocr_usage_pages_used AS used FROM content.book_ocr_usage WHERE book_ocr_usage_user_account_id = $1 AND book_ocr_usage_period = $2 FOR UPDATE`, [uid, period]);
      const used = Number(lock.rows[0].used) || 0;
      if (used + pages.length > limit) throw new DomainError('READING_OCR_QUOTA', 'Monthly OCR page limit reached', { limit, used, needed: pages.length }, 402);
      const up = await tx.query(`UPDATE content.book SET book_status = 'ocr_queued', book_error_code = NULL, book_ocr_page_total = $2, book_ocr_page_done = 0 WHERE book_id = $1 AND book_status = 'scanned' RETURNING book_id`, [r.id, pages.length]);
      if (!up.rows.length) throw new DomainError('READING_OCR_NOT_APPLICABLE', 'This book does not need OCR', undefined, 409);
      await tx.query(`UPDATE content.book_ocr_usage SET book_ocr_usage_pages_used = book_ocr_usage_pages_used + $3 WHERE book_ocr_usage_user_account_id = $1 AND book_ocr_usage_period = $2`, [uid, period, pages.length]);
      await tx.query(`DELETE FROM content.book_ocr_page WHERE book_ocr_page_book_id = $1`, [r.id]);
      await tx.query(
        `INSERT INTO content.book_ocr_page (book_ocr_page_tenant_code, book_ocr_page_organization_id, book_ocr_page_book_id, book_ocr_page_page_no) SELECT $1, $2, $3, unnest($4::int[])`,
        [r.tenantCode, r.organizationId, r.id, pages]);
    });
    return books.getBook({ caller, code });
  };

  const spentTodayMicros = async () => {
    const { rows } = await rawQuery(
      `SELECT coalesce(sum(ai_usage_cost_micros), 0)::bigint AS spent FROM tutor.ai_usage
        WHERE ai_usage_feature = 'book_ocr' AND ai_usage_created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`);
    return Number(rows[0].spent) || 0;
  };

  const refund = async (bookOwnerId, createdPeriod, n) => {
    if (n <= 0 || !bookOwnerId) return;
    await rawQuery(`UPDATE content.book_ocr_usage SET book_ocr_usage_pages_used = GREATEST(0, book_ocr_usage_pages_used - $3) WHERE book_ocr_usage_user_account_id = $1 AND book_ocr_usage_period = $2`, [bookOwnerId, createdPeriod, n]);
  };

  const ocrOne = async (book, page, file) => {
    const slice = await readFile(file);
    if (slice.length > MAX_SLICE_BYTES) return { failed: true, permanent: true };
    let res;
    try {
      res = await fetchInternal(`${tutorUrl()}/internal/ai/ocr-page`, {
        method: 'POST', headers: internalHeaders(null), timeoutMs: TIMEOUT_MS, fetchFn, body: { pdfBase64: slice.toString('base64'), pageNo: page.pageNo },
      });
    } catch (e) {
      console.warn(`[book-ocr] ${book.code}/${page.pageNo}: erişilemedi ${String(e.message).slice(0, 160)}`);
      return { failed: true };
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok || body?.success === false) {
      console.warn(`[book-ocr] ${book.code}/${page.pageNo}: ${res.status} ${body?.error?.code || ''}`);
      // Bütçe/hız sınırı: sayfanın suçu değil, hak harcanmaz; bu tur durur.
      return { failed: true, stop: res.status === 429 || res.status === 402 || body?.error?.code === 'LLM_RATE_LIMITED' };
    }
    const data = body?.data ?? body;
    return { text: String(data?.text || ''), costMicros: Number(data?.usage?.costMicros) || 0 };
  };

  const settle = async (book) => {
    const { rows } = await rawQuery(
      `SELECT count(*) FILTER (WHERE book_ocr_page_status = 'pending')::int AS pending, count(*) FILTER (WHERE book_ocr_page_status = 'done')::int AS done, count(*) FILTER (WHERE book_ocr_page_status = 'failed')::int AS failed
         FROM content.book_ocr_page WHERE book_ocr_page_book_id = $1`, [book.id]);
    const { pending, done, failed } = rows[0];
    await rawQuery(`UPDATE content.book SET book_ocr_page_done = $2 WHERE book_id = $1`, [book.id, done + failed]);
    if (pending > 0) return;
    if (!done) {
      await rawQuery(`UPDATE content.book SET book_status = 'scanned', book_error_code = 'READING_OCR_FAILED' WHERE book_id = $1`, [book.id]);
      return;
    }
    await rawQuery(`UPDATE content.book SET book_status = 'processing', book_processing_started_at = NULL, book_processing_attempts = 0 WHERE book_id = $1`, [book.id]);
    books.kick();
  };

  /** Bir tur: en uzun süredir beklemiş kitabın sayfaları. Tur sonunda kitap güncellendiği için kitaplar sırayla ilerler; uzun kitap kısa olanı bekletmez. */
  const tick = async () => {
    const cap = dailyCapMicros();
    if (!cap) return { paused: 'disabled' };
    const spent = await spentTodayMicros();
    if (spent >= cap) return { paused: 'daily-cap', spent };
    const q = await rawQuery(
      `SELECT b.book_id AS id, b.book_code AS code, b.book_user_account_id AS "ownerId" FROM content.book b
        WHERE b.book_status IN ('ocr_queued','ocr_running') AND EXISTS (SELECT 1 FROM content.book_ocr_page p WHERE p.book_ocr_page_book_id = b.book_id AND p.book_ocr_page_status = 'pending')
        ORDER BY b.book_updated_at, b.book_id LIMIT 1`);
    const book = q.rows[0];
    if (!book) return { idle: true };
    await rawQuery(`UPDATE content.book SET book_status = 'ocr_running' WHERE book_id = $1`, [book.id]);
    const pend = await rawQuery(
      `SELECT book_ocr_page_id AS id, book_ocr_page_page_no AS "pageNo", book_ocr_page_attempts AS attempts FROM content.book_ocr_page
        WHERE book_ocr_page_book_id = $1 AND book_ocr_page_status = 'pending' ORDER BY book_ocr_page_page_no LIMIT $2`, [book.id, PAGES_PER_TICK]);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sinav-book-ocr-'));
    let processed = 0;
    let stopped = false;
    const period = periodOf();
    try {
      let sliced;
      try {
        sliced = await runBookWorker({ op: 'slice', file: files.pathOf(book.code), pages: pend.rows.map((p) => p.pageNo), outDir: dir });
      } catch (e) {
        console.warn(`[book-ocr] ${book.code}: sayfa ayrılamadı ${e.code || e.message}`);
        sliced = { files: {} };
      }
      const queue = [...pend.rows];
      const worker = async () => {
        while (queue.length && !stopped) {
          const page = queue.shift();
          const file = sliced.files[page.pageNo];
          const out = file ? await ocrOne(book, page, file) : { failed: true, permanent: true };
          if (out.stop) { stopped = true; return; }
          if (out.failed) {
            const attempts = Number(page.attempts) + 1;
            const final = out.permanent || attempts >= MAX_PAGE_ATTEMPTS;
            await rawQuery(`UPDATE content.book_ocr_page SET book_ocr_page_attempts = $2, book_ocr_page_status = $3 WHERE book_ocr_page_id = $1`, [page.id, attempts, final ? 'failed' : 'pending']);
            if (final) await refund(book.ownerId, period, 1);
          } else {
            await rawQuery(`UPDATE content.book_ocr_page SET book_ocr_page_status = 'done', book_ocr_page_text = $2, book_ocr_page_cost_micros = $3 WHERE book_ocr_page_id = $1`, [page.id, out.text, out.costMicros]);
          }
          processed += 1;
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      await settle(book);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    return { book: Number(book.code), processed, stopped };
  };

  return Object.freeze({ start, tick });
};
