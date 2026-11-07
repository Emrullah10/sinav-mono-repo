import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import multer from 'multer';
import { DomainError, withTransaction, getEntitlements, looksEnglish, splitSentences } from 'app-shared';
import { getPlatform, pageOf, reqCode, like, iso, num } from '../shared/helpers.js';
import { BOOK_LIMITS, EXTRACT_VERSION, isScanned } from './book-extract.js';
import { runBookWorker } from './book-worker.js';

// Kitap okuma. İki tür kitap tek modelde: hazır (catalog) ve kullanıcının yüklediği PDF (personal). Başkasının kişisel kitabı her uçta 404.
// PDF hattı: yükleme → dosya diske → status 'processing' → alt süreçte metin çıkarma → 'ready' ya da (metin yoksa) 'scanned' → isteğe bağlı OCR (book-ocr.js).
// Sınırlar env ile değişir: BOOK_LIMIT_FREE/PREMIUM (adet), BOOK_BYTES_FREE_MB/PREMIUM_MB, BOOK_STORAGE_MAX_GB (sunucu diski koruması).

const envInt = (name, def) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== '' && process.env[name] !== undefined ? n : def;
};
export const bookLimits = () => ({
  books: { free: envInt('BOOK_LIMIT_FREE', 2), premium: envInt('BOOK_LIMIT_PREMIUM', 30) },
  bytes: { free: envInt('BOOK_BYTES_FREE_MB', 100) * 1048576, premium: envInt('BOOK_BYTES_PREMIUM_MB', 1024) * 1048576 },
  ocrPages: { free: envInt('BOOK_OCR_PAGES_FREE', 0), premium: envInt('BOOK_OCR_PAGES_PREMIUM', 300) },
  storageBytes: envInt('BOOK_STORAGE_MAX_GB', 20) * 1073741824,
});
const FILE_TOKEN_TTL_SEC = 15 * 60;
const STUCK_MINUTES = 10;
const MAX_ATTEMPTS = 2;
const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const TOPICS = ['story', 'classic', 'academic', 'health', 'science', 'social'];

const userIdOf = (caller) => Number(caller?.callerUserId) || null;
const notFound = () => new DomainError('READING_BOOK_NOT_FOUND', 'Book not found', undefined, 404);
const titleFromFile = (name) => {
  const base = String(name || '').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'PDF').slice(0, 300);
};
// multer dosya adını latin1 okur; UTF-8'e çevrilir (Türkçe karakterli dosya adları bozulmasın).
// eslint-disable-next-line no-control-regex -- dosya adından kontrol karakterleri atılır
const fileNameOf = (f) => Buffer.from(String(f?.originalname || 'book.pdf'), 'latin1').toString('utf8').replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 255) || 'book.pdf';

const SEL = (userParam) => `b.book_id AS id, b.book_code AS code, b.book_kind AS kind, b.book_user_account_id AS "ownerId", b.book_title AS title, b.book_author AS author, b.book_description AS description,
  b.book_language AS language, b.book_level AS level, b.book_topic AS topic, b.book_access_tier AS "accessTier", b.book_license AS license, b.book_attribution AS attribution, b.book_source_url AS "sourceUrl",
  b.book_status AS status, b.book_error_code AS "errorCode", b.book_file_name AS "fileName", b.book_file_byte_size AS "byteSize", b.book_has_file AS "hasFile", b.book_page_count AS "pageCount",
  b.book_textless_page_count AS "textlessPageCount", b.book_ocr_page_total AS "ocrPageTotal", b.book_ocr_page_done AS "ocrPageDone", b.book_section_count AS "sectionCount", b.book_word_count AS "wordCount",
  b.book_published_at AS "publishedAt", b.book_created_at AS "createdAt", b.book_organization_id AS "organizationId", b.book_tenant_code AS "tenantCode",
  p.book_progress_section_position AS "pSection", p.book_progress_block_index AS "pBlock", p.book_progress_page_no AS "pPage", p.book_progress_percent AS "pPercent", p.book_progress_last_read_at AS "pLastRead", p.book_progress_finished_at AS "pFinished"
  FROM content.book b LEFT JOIN content.book_progress p ON p.book_progress_book_id = b.book_id AND p.book_progress_user_account_id = ${userParam}`;

const dto = (r, tier = 'free') => ({
  code: Number(r.code), kind: r.kind, title: r.title, author: r.author, description: r.description, language: r.language, level: r.level, topic: r.topic, accessTier: r.accessTier,
  license: r.license, attribution: r.attribution, sourceUrl: r.sourceUrl, status: r.status, errorCode: r.errorCode, fileName: r.fileName, byteSize: Number(r.byteSize) || 0, hasFile: !!r.hasFile,
  pageCount: Number(r.pageCount) || 0, sectionCount: Number(r.sectionCount) || 0, wordCount: Number(r.wordCount) || 0, readingMinutes: Math.max(1, Math.round((Number(r.wordCount) || 0) / 180)),
  ocr: { textlessPages: Number(r.textlessPageCount) || 0, total: Number(r.ocrPageTotal) || 0, done: Number(r.ocrPageDone) || 0 },
  locked: r.accessTier === 'premium' && tier !== 'premium', createdAt: iso(r.createdAt), publishedAt: iso(r.publishedAt),
  progress: r.pLastRead ? { sectionPosition: Number(r.pSection) || 0, blockIndex: Number(r.pBlock) || 0, pageNo: num(r.pPage), percent: Number(r.pPercent) || 0, lastReadAt: iso(r.pLastRead), finishedAt: iso(r.pFinished) } : null,
});

const secretKey = () => {
  const k = process.env.BOOK_FILE_SECRET || process.env.INTERNAL_API_KEY;
  if (!k) throw new DomainError('READING_FILE_UNAVAILABLE', 'File access is not configured', undefined, 503);
  return k;
};
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const signPayload = (payload) => b64(createHmac('sha256', secretKey()).update(`book-file|${payload}`).digest());

export const makeBooks = ({ rawQuery, nowFn, files }) => {
  const tierOf = async (uid) => {
    const ent = await getEntitlements(uid).catch(() => ({ tier: 'free' }));
    return ent.tier === 'premium' ? 'premium' : 'free';
  };

  /** Erişilebilir kitap: hazır (yayında) ya da kullanıcının kendi kitabı. Değilse 404. */
  const findBook = async (caller, codeRaw) => {
    const code = reqCode(codeRaw, 'READING_BOOK_NOT_FOUND', 'Book not found');
    const uid = userIdOf(caller);
    const { rows } = await rawQuery(`SELECT ${SEL('$2')} WHERE b.book_code = $1`, [code, uid]);
    const r = rows[0];
    if (!r) throw notFound();
    if (r.kind === 'personal' ? Number(r.ownerId) !== uid : r.status !== 'ready' || !r.publishedAt) throw notFound();
    return r;
  };

  // ── kota ──
  const quotaOf = async (uid, tier) => {
    const L = bookLimits();
    const { rows } = await rawQuery(
      `SELECT count(*)::int AS n, coalesce(sum(book_file_byte_size), 0)::bigint AS bytes FROM content.book WHERE book_user_account_id = $1 AND book_kind = 'personal' AND book_status <> 'failed'`, [uid]);
    const period = nowFn().toISOString().slice(0, 7);
    const usage = await rawQuery(`SELECT book_ocr_usage_pages_used AS used FROM content.book_ocr_usage WHERE book_ocr_usage_user_account_id = $1 AND book_ocr_usage_period = $2`, [uid, period]);
    return {
      tier,
      books: { used: rows[0].n, limit: L.books[tier], premiumLimit: L.books.premium },
      bytes: { used: Number(rows[0].bytes), limit: L.bytes[tier] },
      ocrPages: { used: Number(usage.rows[0]?.used) || 0, limit: L.ocrPages[tier], period },
      file: { maxBytes: BOOK_LIMITS.maxBytes, maxPages: BOOK_LIMITS.maxPages },
    };
  };

  // ── okuma ──
  const library = async ({ caller }) => {
    const uid = userIdOf(caller);
    const tier = await tierOf(uid);
    const [cont, mine, quota] = await Promise.all([
      rawQuery(`SELECT ${SEL('$1')} WHERE p.book_progress_user_account_id = $1 AND p.book_progress_finished_at IS NULL AND b.book_status = 'ready'
                 AND (b.book_user_account_id = $1 OR b.book_published_at IS NOT NULL) ORDER BY p.book_progress_last_read_at DESC LIMIT 6`, [uid]),
      rawQuery(`SELECT ${SEL('$1')} WHERE b.book_user_account_id = $1 AND b.book_kind = 'personal' ORDER BY b.book_created_at DESC`, [uid]),
      quotaOf(uid, tier),
    ]);
    return { continue: cont.rows.map((r) => dto(r, tier)), personal: mine.rows.map((r) => dto(r, tier)), quota };
  };

  const catalog = async ({ caller, query = {} }) => {
    const uid = userIdOf(caller);
    const tier = await tierOf(uid);
    const { page, pageSize, offset } = pageOf(query, { defSize: 24, maxSize: 60 });
    const where = [`b.book_kind = 'catalog'`, `b.book_status = 'ready'`, `b.book_published_at IS NOT NULL`];
    const params = [uid];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (LEVELS.includes(query.level)) add('b.book_level = ?', query.level);
    if (TOPICS.includes(query.topic)) add('b.book_topic = ?', query.topic);
    if (query.q) { const q = like(String(query.q).slice(0, 80)); params.push(q); where.push(`(b.book_title ILIKE $${params.length} OR b.book_author ILIKE $${params.length})`); }
    const w = where.join(' AND ');
    const [list, total] = await Promise.all([
      rawQuery(`SELECT ${SEL('$1')} WHERE ${w} ORDER BY array_position(ARRAY['A2','B1','B2','C1']::varchar[], b.book_level::varchar) NULLS LAST, b.book_title LIMIT ${pageSize} OFFSET ${offset}`, params),
      rawQuery(`SELECT count(*)::int AS n FROM content.book b LEFT JOIN content.book_progress p ON p.book_progress_book_id = b.book_id AND p.book_progress_user_account_id = $1 WHERE ${w}`, params),
    ]);
    return { items: list.rows.map((r) => dto(r, tier)), page, pageSize, total: total.rows[0].n };
  };

  const getBook = async ({ caller, code }) => {
    const r = await findBook(caller, code);
    const tier = await tierOf(userIdOf(caller));
    const { rows } = await rawQuery(
      `SELECT book_section_position AS position, book_section_title AS title, book_section_page_start AS "pageStart", book_section_page_end AS "pageEnd", book_section_word_count AS "wordCount",
              jsonb_array_length(book_section_blocks) AS "blockCount"
         FROM content.book_section WHERE book_section_book_id = $1 ORDER BY book_section_position`, [r.id]);
    return { ...dto(r, tier), sections: rows.map((s) => ({ position: s.position, title: s.title, pageStart: num(s.pageStart), pageEnd: num(s.pageEnd), wordCount: s.wordCount, blockCount: s.blockCount })) };
  };

  const getSection = async ({ caller, code, position }) => {
    const r = await findBook(caller, code);
    if (r.accessTier === 'premium' && (await tierOf(userIdOf(caller))) !== 'premium') throw new DomainError('READING_BOOK_LOCKED', 'This book requires Premium', undefined, 402);
    const { rows } = await rawQuery(
      `SELECT book_section_position AS position, book_section_title AS title, book_section_page_start AS "pageStart", book_section_page_end AS "pageEnd", book_section_word_count AS "wordCount", book_section_blocks AS blocks
         FROM content.book_section WHERE book_section_book_id = $1 AND book_section_position = $2`, [r.id, Number(position)]);
    if (!rows[0]) throw new DomainError('READING_SECTION_NOT_FOUND', 'Section not found', undefined, 404);
    return { ...rows[0], pageStart: num(rows[0].pageStart), pageEnd: num(rows[0].pageEnd) };
  };

  const saveProgress = async ({ caller, code, sectionPosition = 0, blockIndex = 0, pageNo = null, percent = 0 }) => {
    const r = await findBook(caller, code);
    const uid = userIdOf(caller);
    const pct = Math.min(100, Math.max(0, Number(percent) || 0));
    const now = nowFn();
    const p = await getPlatform(rawQuery);
    const org = Number(caller.callerOrganizationId) || p.organizationId;
    const { rows } = await rawQuery(
      `INSERT INTO content.book_progress (book_progress_tenant_code, book_progress_organization_id, book_progress_user_account_id, book_progress_book_id, book_progress_section_position, book_progress_block_index,
              book_progress_page_no, book_progress_percent, book_progress_started_at, book_progress_last_read_at, book_progress_finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9, CASE WHEN $8::numeric >= 99 THEN $9::timestamptz END)
       ON CONFLICT (book_progress_user_account_id, book_progress_book_id) DO UPDATE SET book_progress_section_position = EXCLUDED.book_progress_section_position,
              book_progress_block_index = EXCLUDED.book_progress_block_index, book_progress_page_no = EXCLUDED.book_progress_page_no, book_progress_percent = EXCLUDED.book_progress_percent,
              book_progress_last_read_at = EXCLUDED.book_progress_last_read_at,
              book_progress_finished_at = CASE WHEN EXCLUDED.book_progress_percent >= 99 THEN COALESCE(content.book_progress.book_progress_finished_at, EXCLUDED.book_progress_last_read_at) ELSE NULL END
       RETURNING book_progress_percent AS percent, book_progress_finished_at AS "finishedAt"`,
      [p.tenantCode, org, uid, r.id, Math.max(0, Number(sectionPosition) || 0), Math.max(0, Number(blockIndex) || 0), pageNo == null ? null : Number(pageNo) || null, pct, now]);
    return { percent: Number(rows[0].percent), finishedAt: iso(rows[0].finishedAt) };
  };

  // ── işleme kuyruğu ──
  let running = false;
  const applyResult = async (row, result, { ocr }) => {
    const scanned = !ocr && isScanned(result);
    const words = result.wordCount;
    if (!scanned && words === 0) throw Object.assign(new Error('No text'), { code: 'READING_PDF_NO_TEXT' });
    // Okunan kitap yeniden işlemede taranmışa dönmesin: hata sayılır, failBook eski hâline geri alır.
    if (row.reprocess && scanned) throw Object.assign(new Error('Reprocess would mark scanned'), { code: 'READING_PDF_NO_TEXT' });
    const sample = result.sections.flatMap((s) => s.blocks).filter((b) => b.t === 'p').slice(0, 60).map((b) => b.x).join('\n');
    const sents = splitSentences(sample).slice(0, 80);
    const english = sents.filter((s) => looksEnglish(s.text)).length;
    const language = !sents.length || english / sents.length >= 0.6 ? 'en' : 'other';
    await withTransaction(async (tx) => {
      await tx.query(`DELETE FROM content.book_section WHERE book_section_book_id = $1`, [row.id]);
      if (!scanned) {
        for (const s of result.sections) {
          await tx.query(
            `INSERT INTO content.book_section (book_section_tenant_code, book_section_organization_id, book_section_book_id, book_section_position, book_section_title, book_section_page_start, book_section_page_end, book_section_word_count, book_section_blocks)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.tenantCode, row.organizationId, row.id, s.position, s.title ? (s.part > 1 ? `${s.title} (${s.part})`.slice(0, 300) : s.title) : null, s.pageStart, s.pageEnd, s.wordCount, JSON.stringify(s.blocks)]);
        }
        // Yeniden işlemede bölümler değişir: okuma yeri kayıtlı PDF sayfasına göre yeni bölüm/bloğa taşınır (ilk işlemede kayıt yoktur).
        const { rows: marks } = await tx.query(`SELECT book_progress_id AS id, book_progress_page_no AS pg FROM content.book_progress WHERE book_progress_book_id = $1 AND book_progress_page_no IS NOT NULL`, [row.id]);
        for (const m of marks) {
          const s = [...result.sections].reverse().find((x) => x.pageStart <= m.pg) || result.sections[0];
          if (!s) continue;
          const at = s.blocks.findIndex((b) => b.pg >= m.pg);
          await tx.query(`UPDATE content.book_progress SET book_progress_section_position = $2, book_progress_block_index = $3 WHERE book_progress_id = $1`, [m.id, s.position, Math.max(0, at)]);
        }
      }
      if (ocr) await tx.query(`DELETE FROM content.book_ocr_page WHERE book_ocr_page_book_id = $1`, [row.id]);
      await tx.query(
        `UPDATE content.book SET book_status = $2, book_error_code = NULL, book_page_count = $3, book_textless_page_count = $4, book_section_count = $5, book_word_count = $6, book_language = $7,
                book_author = COALESCE(book_author, $8), book_processed_at = $9, book_processing_started_at = NULL,
                book_metadata = (book_metadata - 'reprocess') || $10::jsonb WHERE book_id = $1`,
        [row.id, scanned ? 'scanned' : 'ready', result.pageCount, result.textlessPages.length, scanned ? 0 : result.sections.length, scanned ? 0 : words, scanned ? row.language : language, result.author, nowFn(),
          JSON.stringify(scanned ? { textlessPages: result.textlessPages, extractVersion: EXTRACT_VERSION } : { extractVersion: EXTRACT_VERSION, skippedPages: result.skippedPages || [] })]);
    });
  };

  const failBook = async (row, code) => {
    // Yeniden işleme (çıkarma sürümü yükseldi) başarısız: eski bölümler yerinde, kitap eski hâline döner; dosya silinmez.
    if (row.reprocess) {
      await rawQuery(`UPDATE content.book SET book_status = 'ready', book_processing_started_at = NULL, book_metadata = book_metadata - 'reprocess' WHERE book_id = $1`, [row.id]);
      return;
    }
    // OCR sonrası kurulumda hata: dosya durur (orijinal okunabilir), kitap taranmış sayılır.
    const keepFile = row.hadOcr;
    await rawQuery(
      `UPDATE content.book SET book_status = $2, book_error_code = $3, book_processing_started_at = NULL, book_has_file = $4, book_file_byte_size = CASE WHEN $4 THEN book_file_byte_size ELSE 0 END WHERE book_id = $1`,
      [row.id, keepFile ? 'scanned' : 'failed', code, keepFile]);
    if (!keepFile) await files.remove(row.code).catch(() => {});
  };

  const processOne = async () => {
    const { rows } = await rawQuery(
      `UPDATE content.book SET book_processing_started_at = $1, book_processing_attempts = book_processing_attempts + 1
        WHERE book_id = (SELECT book_id FROM content.book WHERE book_status = 'processing' AND (book_processing_started_at IS NULL OR book_processing_started_at < $1::timestamptz - interval '${STUCK_MINUTES} minutes')
                          ORDER BY book_processing_attempts, book_id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING book_id AS id, book_code AS code, book_tenant_code AS "tenantCode", book_organization_id AS "organizationId", book_language AS language, book_processing_attempts AS attempts,
                  (book_metadata->>'reprocess') = 'true' AS reprocess`, [nowFn()]);
    const row = rows[0];
    if (!row) return false;
    const ocrRows = await rawQuery(`SELECT book_ocr_page_page_no AS pg, book_ocr_page_text AS text FROM content.book_ocr_page WHERE book_ocr_page_book_id = $1 AND book_ocr_page_status = 'done'`, [row.id]);
    row.hadOcr = ocrRows.rows.length > 0;
    if (row.attempts > MAX_ATTEMPTS) { await failBook(row, 'READING_PDF_TIMEOUT'); return true; }
    const ocrPages = Object.fromEntries(ocrRows.rows.map((p) => [p.pg, p.text || '']));
    try {
      const result = await runBookWorker({ op: 'extract', file: files.pathOf(row.code), ocrPages });
      await applyResult(row, result, { ocr: row.hadOcr });
    } catch (e) {
      console.warn(`[books] book ${row.code}: ${e.code || ''} ${String(e.message).slice(0, 200)}`);
      if (e.code === 'READING_PDF_TIMEOUT') {
        // Süre/bellek aşımı: bir kez daha denenir (sıraya geri), sonra başarısız.
        if (row.attempts >= MAX_ATTEMPTS) await failBook(row, 'READING_PDF_TIMEOUT');
        else await rawQuery(`UPDATE content.book SET book_processing_started_at = NULL WHERE book_id = $1`, [row.id]);
      } else {
        await failBook(row, /^READING_/.test(e.code || '') ? e.code : 'READING_PDF_INVALID');
      }
    }
    return true;
  };

  const processQueued = async () => {
    if (running) return { busy: true };
    running = true;
    let n = 0;
    try {
      while (await processOne()) n += 1;
    } finally {
      running = false;
    }
    return { processed: n };
  };
  const kick = () => { setImmediate(() => processQueued().catch((e) => console.error('[books] kuyruk', e.message))); };

  // ── yükleme ──
  const uploader = multer({
    storage: multer.diskStorage({
      destination: (_q, _f, cb) => files.ready.then(() => cb(null, files.tmpDir), cb),
      filename: (_q, _f, cb) => cb(null, `${randomUUID()}.upload`),
    }),
    limits: { fileSize: BOOK_LIMITS.maxBytes, files: 1, fields: 15 },
  }).single('file');
  const receive = (req, res) => new Promise((resolve, reject) => {
    uploader(req, res, (e) => {
      if (!e) return resolve(req.file);
      if (e.code === 'LIMIT_FILE_SIZE') return reject(new DomainError('READING_PDF_TOO_LARGE', 'PDF is too large', { maxBytes: BOOK_LIMITS.maxBytes }, 413));
      return reject(new DomainError('READING_PDF_INVALID', 'Upload failed'));
    });
  });
  const fileFacts = async (file) => {
    const fh = await open(file, 'r');
    try {
      const head = Buffer.alloc(5);
      await fh.read(head, 0, 5, 0);
      if (head.toString('latin1') !== '%PDF-') throw new DomainError('READING_PDF_INVALID', 'File is not a PDF');
    } finally { await fh.close(); }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  };

  /** Kişisel yükleme ya da CMS (asCatalog: alanlar aynı multipart gövdesinden okunur). */
  const upload = async ({ caller, req, res, asCatalog = false }) => {
    const uid = userIdOf(caller);
    const file = await receive(req, res);
    if (!file) throw new DomainError('READING_PDF_INVALID', 'file is required', { field: 'file' });
    try {
      if (!asCatalog && String(req.body?.rightsConfirmed) !== 'true') throw new DomainError('READING_RIGHTS_REQUIRED', 'Rights confirmation is required', { field: 'rightsConfirmed' });
      const sha = await fileFacts(file.path);
      const fileName = fileNameOf(file);
      const p = await getPlatform(rawQuery);
      const L = bookLimits();
      if (L.storageBytes && (await files.totalBytes()) + file.size > L.storageBytes) throw new DomainError('READING_STORAGE_FULL', 'Storage is full', undefined, 503);
      if (!asCatalog) {
        const tier = await tierOf(uid);
        const dup = await rawQuery(`SELECT ${SEL('$1')} WHERE b.book_user_account_id = $1 AND b.book_kind = 'personal' AND b.book_file_sha256 = $2`, [uid, sha]);
        if (dup.rows[0]) {
          if (dup.rows[0].status !== 'failed') return { ...dto(dup.rows[0], tier), duplicate: true };
          await rawQuery(`DELETE FROM content.book WHERE book_id = $1`, [dup.rows[0].id]);
        }
        const quota = await quotaOf(uid, tier);
        if (quota.books.used >= quota.books.limit) throw new DomainError('READING_BOOK_LIMIT', 'Book limit reached', { limit: quota.books.limit, tier }, 402);
        if (quota.bytes.used + file.size > quota.bytes.limit) throw new DomainError('READING_STORAGE_LIMIT', 'Storage limit reached', { limit: quota.bytes.limit, tier }, 402);
      }
      const m = asCatalog ? cmsMeta(req.body || {}) : {};
      const { rows } = await rawQuery(
        `INSERT INTO content.book (book_tenant_code, book_organization_id, book_kind, book_user_account_id, book_title, book_author, book_description, book_level, book_topic, book_license, book_attribution, book_source_url,
                book_file_name, book_file_sha256, book_file_byte_size, book_has_file, book_metadata, book_access_tier)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16,$17) RETURNING book_code AS code`,
        [p.tenantCode, asCatalog ? p.organizationId : Number(caller.callerOrganizationId), asCatalog ? 'catalog' : 'personal', asCatalog ? null : uid, m.title || titleFromFile(fileName), m.author || null, m.description || null,
          LEVELS.includes(m.level) ? m.level : null, TOPICS.includes(m.topic) ? m.topic : null, m.license || null, m.attribution || null, m.sourceUrl || null, fileName, sha, file.size,
          JSON.stringify(asCatalog ? {} : { rightsConfirmedAt: nowFn().toISOString() }), asCatalog && req.body?.accessTier === 'premium' ? 'premium' : 'free']);
      const code = Number(rows[0].code);
      await files.put(code, file.path);
      kick();
      const out = await rawQuery(`SELECT ${SEL('$2')} WHERE b.book_code = $1`, [code, uid]);
      return dto(out.rows[0]);
    } finally {
      await rm(file.path, { force: true }).catch(() => {});
    }
  };

  // ── yönetim ──
  const ownBook = async (caller, code) => {
    const r = await findBook(caller, code);
    if (r.kind !== 'personal') throw notFound();
    return r;
  };
  const rename = async ({ caller, code, title, author }) => {
    const r = await ownBook(caller, code);
    const t = String(title ?? r.title).replace(/\s+/g, ' ').trim();
    if (!t || t.length > 300) throw new DomainError('READING_TITLE_INVALID', 'Title must be 1-300 characters', { field: 'title' });
    const a = author === undefined ? r.author : String(author || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
    await rawQuery(`UPDATE content.book SET book_title = $2, book_author = $3 WHERE book_id = $1`, [r.id, t, a]);
    return getBook({ caller, code });
  };
  const remove = async ({ caller, code }) => {
    const r = await ownBook(caller, code);
    await rawQuery(`DELETE FROM content.book WHERE book_id = $1`, [r.id]);
    await files.remove(r.code).catch(() => {});
    return { deleted: true };
  };

  // ── orijinal PDF ──
  const fileUrl = async ({ caller, code }) => {
    const r = await findBook(caller, code);
    if (!r.hasFile) throw new DomainError('READING_FILE_NOT_FOUND', 'This book has no original file', undefined, 404);
    if (r.accessTier === 'premium' && (await tierOf(userIdOf(caller))) !== 'premium') throw new DomainError('READING_BOOK_LOCKED', 'This book requires Premium', undefined, 402);
    const exp = Math.floor(nowFn().getTime() / 1000) + FILE_TOKEN_TTL_SEC;
    const payload = `${Number(r.code)}.${exp}`;
    return { url: `/api/sinav-service-content/v1/public/book-files/${payload}.${signPayload(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
  };

  /** Süreli imzalı bağlantıyla dosya (Range destekli). pdf.js parça parça ister; oturum başlığı taşıyamayan WebView de kullanır. */
  const streamFile = async ({ token, req, res }) => {
    const [codeStr, expStr, sig] = String(token || '').split('.');
    const invalid = () => new DomainError('READING_FILE_NOT_FOUND', 'File link is invalid or expired', undefined, 404);
    if (!codeStr || !expStr || !sig) throw invalid();
    const expected = Buffer.from(signPayload(`${codeStr}.${expStr}`));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid();
    if (Number(expStr) < Math.floor(nowFn().getTime() / 1000)) throw invalid();
    const code = Number(codeStr);
    const { rows } = await rawQuery(`SELECT book_has_file AS "hasFile" FROM content.book WHERE book_code = $1`, [code]);
    if (!rows[0]?.hasFile) throw invalid();
    const size = await files.size(code);
    if (size == null) throw invalid();
    const base = { 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=600', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    let start = 0;
    let end = size - 1;
    let partial = false;
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), size - 1); } else { start = Math.max(0, size - Number(m[2])); }
      if (start > end || start >= size) {
        res.status(416).set({ ...base, 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      partial = true;
    }
    res.status(partial ? 206 : 200).set({ ...base, 'Content-Length': String(end - start + 1), ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    res.flushHeaders();
    await new Promise((resolve, reject) => {
      const s = files.stream(code, { start, end });
      s.on('error', reject);
      res.on('close', () => { s.destroy(); resolve(); });
      s.pipe(res);
    });
  };

  // ── bakım ──
  /** Gece: DB'de karşılığı kalmayan dosyalar (hesap silme CASCADE'i dahil) ve yarım kalan geçici yüklemeler silinir. */
  const gcFiles = async () => {
    const onDisk = await files.codes();
    let removed = 0;
    if (onDisk.length) {
      const { rows } = await rawQuery(`SELECT book_code AS code FROM content.book WHERE book_code = ANY($1::bigint[]) AND book_has_file`, [onDisk]);
      const live = new Set(rows.map((r) => Number(r.code)));
      for (const c of onDisk) if (!live.has(c)) { await files.remove(c).catch(() => {}); removed += 1; }
    }
    return { removed, tmp: await files.pruneTmp() };
  };

  // ── CMS ──
  const cmsList = async ({ query = {} }) => {
    const { page, pageSize, offset } = pageOf(query, { defSize: 30, maxSize: 100 });
    const { rows } = await rawQuery(`SELECT ${SEL('NULL::bigint')} WHERE b.book_kind = 'catalog' ORDER BY b.book_created_at DESC LIMIT ${pageSize} OFFSET ${offset}`);
    const total = await rawQuery(`SELECT count(*)::int AS n FROM content.book WHERE book_kind = 'catalog'`);
    return { items: rows.map((r) => dto(r, 'premium')), page, pageSize, total: total.rows[0].n };
  };
  const cmsMeta = (src) => ({
    title: String(src.title || '').trim().slice(0, 300) || null, author: String(src.author || '').trim().slice(0, 200) || null, description: String(src.description || '').trim() || null,
    level: LEVELS.includes(src.level) ? src.level : null, topic: TOPICS.includes(src.topic) ? src.topic : null, license: String(src.license || '').trim().slice(0, 120) || null,
    attribution: String(src.attribution || '').trim().slice(0, 300) || null, sourceUrl: /^https?:\/\//i.test(String(src.sourceUrl || '')) ? String(src.sourceUrl).slice(0, 500) : null,
  });
  const cmsUpload = ({ caller, req, res }) => upload({ caller, req, res, asCatalog: true });
  const cmsUpdate = async ({ code, body = {} }) => {
    const c = reqCode(code, 'READING_BOOK_NOT_FOUND', 'Book not found');
    const m = cmsMeta(body);
    if (!m.title) throw new DomainError('READING_TITLE_INVALID', 'Title is required', { field: 'title' });
    const { rows } = await rawQuery(
      `UPDATE content.book SET book_title=$2, book_author=$3, book_description=$4, book_level=$5, book_topic=$6, book_license=$7, book_attribution=$8, book_source_url=$9, book_access_tier=$10
        WHERE book_code=$1 AND book_kind='catalog' RETURNING book_code AS code`,
      [c, m.title, m.author, m.description, m.level, m.topic, m.license, m.attribution, m.sourceUrl, body.accessTier === 'premium' ? 'premium' : 'free']);
    if (!rows[0]) throw notFound();
    return { code: c };
  };
  const cmsPublish = async ({ code, published }) => {
    const c = reqCode(code, 'READING_BOOK_NOT_FOUND', 'Book not found');
    const { rows } = await rawQuery(
      `UPDATE content.book SET book_published_at = CASE WHEN $2 THEN COALESCE(book_published_at, $3) END WHERE book_code = $1 AND book_kind = 'catalog' AND (NOT $2 OR book_status = 'ready') RETURNING book_published_at AS at`,
      [c, !!published, nowFn()]);
    if (!rows[0]) throw new DomainError('READING_BOOK_NOT_READY', 'Book is not ready to publish', undefined, 409);
    return { code: c, publishedAt: iso(rows[0].at) };
  };

  return Object.freeze({
    library, catalog, getBook, getSection, saveProgress, upload, rename, remove, fileUrl, streamFile, processQueued, kick, gcFiles, cmsList, cmsUpload, cmsUpdate, cmsPublish, quotaOf, tierOf, ownBook,
  });
};
