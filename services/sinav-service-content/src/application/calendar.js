// ÖSYM sınav takvimi içe aktarma (SYS/CMS) ve oturum durumlarının tarihten güncellenmesi.
//   Haftalık tarama: ÖSYM ana sayfasında "<yıl> yılı sınav takvimi" duyurusunu ve içindeki PDF'i bulur, indirmeyi bir kez dener.
//   ÖSYM dosyayı otomatik istemcilere kapatırsa (ör. "Erişim Engellendi") kayıt `failed` olur ve bağlantı panelde görünür;
//   editör PDF'i tarayıcıdan indirip yükler. Öneriler doğrudan uygulanmaz; gözden geçiren onaylar.
//   Günlük iş: oturum durumu (announced → application_open → held → results_announced) tarihten hesaplanır.
import { createHash } from 'node:crypto';
import { DomainError, withTransaction, writeAudit, fetchInternal, internalHeaders } from 'app-shared';
import { iso, dateOnly, pageOf, reqCode, getPlatform, bumpCatalogVersion, userRef, asArray } from '../shared/helpers.js';
import { pdfToRows, parseCalendarRows, mentionsLanguageExams, matchCode, sessionProblems } from './calendar-parse.js';

const HOME_URL = () => process.env.OSYM_HOME_URL || 'https://www.osym.gov.tr/';
const FALLBACK_PDF = (y) => `https://dokuman.osym.gov.tr/pdfdokuman/${y}/GENEL/sinavtakvimi${y}.pdf`;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const FIELDS = ['name', 'date', 'applicationStart', 'applicationEnd', 'lateApplicationEnd', 'resultDate'];
const tutorUrl = () => `${(process.env.SERVICE_TUTOR_REST_URL || process.env.TUTOR_REST_URL || 'http://127.0.0.1:2005').replace(/\/$/, '')}/api/sinav-service-tutor/v1`;

export const todayIstanbul = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

/** Oturum durumu tarihten: tahmini kalır; sonuç günü sınavdan sonraysa `results_announced`, sınavdan sonra `held`, başvuru penceresinde `application_open`. */
export const statusFor = (s, today) => {
  if (s.isEstimated) return 'estimated';
  if (s.resultDate && today >= s.resultDate && today > s.date) return 'results_announced';
  if (today > s.date) return 'held';
  const close = s.lateApplicationEnd || s.applicationEnd;
  if (s.applicationStart && today >= s.applicationStart && (!close || today <= close)) return 'application_open';
  return 'announced';
};

const absUrl = (href, base) => { try { return new URL(href, base).toString(); } catch { return null; } };
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const DONE = ['held', 'results_announced'];

export const makeCalendar = ({ rawQuery, nowFn, fetchFn, onExamHeld = null }) => {
  const getText = async (url) => {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'text/html' } });
    if (!res.ok) return null;
    return res.text();
  };

  /** Ana sayfa → "<yıl> yılı sınav takvimi" duyuruları → PDF bağlantıları. */
  const discover = async () => {
    const found = [];
    const home = await getText(HOME_URL());
    if (!home) return found;
    const pages = [...new Set([...home.matchAll(/href="([^"]*osym-(\d{4})-yili-sinav-takvimi[^"]*)"/gi)].map((m) => `${m[2]}|${absUrl(m[1], HOME_URL())}`))];
    for (const entry of pages) {
      const [year, pageUrl] = entry.split('|');
      const html = pageUrl ? await getText(pageUrl) : null;
      const pdf = html && [...html.matchAll(/(https?:\/\/[^"'\s>]+\.pdf|\/[^"'\s>]+\.pdf)/gi)].map((m) => absUrl(m[1], pageUrl)).find((u) => /takvim/i.test(u));
      if (pdf) found.push({ year: Number(year), pageUrl, pdfUrl: pdf });
    }
    return found;
  };

  /** PDF'i indirir; PDF değilse (engelleme sayfası vb.) hata kodlu bir sonuç döner. */
  const fetchPdf = async (url) => {
    let res;
    try { res = await fetchFn(url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/pdf' } }); } catch (e) { return { error: 'OSYM_UNREACHABLE', message: e.message }; }
    if (!res.ok) return { error: res.status === 404 ? 'OSYM_PDF_NOT_FOUND' : 'OSYM_HTTP_ERROR', message: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES) return { error: 'OSYM_PDF_TOO_LARGE', message: `${buf.length} bayt` };
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      const blocked = /Erişim Engellendi|Access Denied/i.test(buf.toString('utf8', 0, 4000));
      return { error: blocked ? 'OSYM_PDF_BLOCKED' : 'OSYM_PDF_INVALID', message: blocked ? 'ÖSYM otomatik indirmeye izin vermedi' : 'Dosya PDF değil' };
    }
    return { buffer: buf };
  };

  /** Kural ayrıştırıcı boş dönerse yabancı dil satırlarını ucuz modele çözdürür. */
  const llmParse = async (rows) => {
    const lines = [];
    rows.forEach((r, i) => { if (/YDS|YÖKDİL/i.test(r)) lines.push(rows[i - 2] || '', rows[i - 1] || '', r, '---'); });
    const system = `[gen:calendar]
You extract Turkish ÖSYM exam calendar rows. Each exam is a block of 3 lines: (1) full name + application start date, (2) exam date, late application date or "-----", result date, (3) short code + application end date.
Return ONLY JSON {"sessions":[{"code": short code as written (e.g. "2027-YDS/1" or "(e-YDS 2027/3 İngilizce)"), "date","applicationStart","applicationEnd","lateApplicationEnd","resultDate"}]} with dates as YYYY-MM-DD or null. Include only YDS, e-YDS, YÖKDİL and e-YÖKDİL rows.`;
    const res = await fetchInternal(`${tutorUrl()}/internal/ai/complete`, {
      method: 'POST', headers: internalHeaders(null), timeoutMs: 60000, fetchFn,
      body: { feature: 'content_draft', model: process.env.EVAL_MODEL || undefined, json: true, maxTokens: 4000, messages: [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n').slice(0, 60000) }] },
    });
    const body = await res.json().catch(() => null);
    const data = body?.data ?? body;
    const list = (data?.json ?? null)?.sessions;
    if (!res.ok || !Array.isArray(list)) return [];
    return list.map((x) => ({ ...matchCode(String(x.code || '')), date: x.date, applicationStart: x.applicationStart, applicationEnd: x.applicationEnd, lateApplicationEnd: x.lateApplicationEnd, resultDate: x.resultDate }))
      .filter((s) => s.key && !s.skip && !sessionProblems(s).length);
  };

  /** Ayrıştırılan oturumları veritabanıyla karşılaştırır → öneriler. */
  const diff = async (sessions, { cancelEstimated }) => {
    const keys = sessions.map((s) => s.key);
    const years = [...new Set(sessions.map((s) => s.year))];
    const { rows } = await rawQuery(
      `SELECT s.exam_session_key AS key, e.exam_key AS exam, s.exam_session_delivery_mode AS "deliveryMode", s.exam_session_name AS name, s.exam_session_status AS status,
              s.exam_session_exam_date AS date, s.exam_session_application_start AS "applicationStart", s.exam_session_application_end AS "applicationEnd",
              s.exam_session_late_application_end AS "lateApplicationEnd", s.exam_session_result_date AS "resultDate", s.exam_session_is_estimated AS "isEstimated"
         FROM content.exam_session s JOIN content.exam e ON e.exam_id = s.exam_session_exam_id
        WHERE s.exam_session_key = ANY($1::varchar[]) OR (s.exam_session_is_estimated AND EXTRACT(YEAR FROM s.exam_session_exam_date)::int = ANY($2::int[]))`, [keys, years]);
    const norm = (r) => ({ ...r, ...Object.fromEntries(['date', 'applicationStart', 'applicationEnd', 'lateApplicationEnd', 'resultDate'].map((f) => [f, dateOnly(r[f])])) });
    const existing = new Map(rows.map((r) => [r.key, norm(r)]));
    const proposals = [];
    let same = 0;
    for (const s of sessions) {
      const cur = existing.get(s.key);
      const next = Object.fromEntries(FIELDS.map((f) => [f, s[f] ?? null]));
      if (!cur) { proposals.push({ action: 'create', key: s.key, exam: s.exam, deliveryMode: s.deliveryMode, ...next }); continue; }
      const changes = Object.fromEntries(FIELDS.filter((f) => (cur[f] ?? null) !== next[f]).map((f) => [f, { from: cur[f] ?? null, to: next[f] }]));
      if (cur.isEstimated) changes.isEstimated = { from: true, to: false };
      if (Object.keys(changes).length) proposals.push({ action: 'update', key: s.key, exam: cur.exam, deliveryMode: cur.deliveryMode, ...next, changes });
      else same += 1;
    }
    // Takvimde olmayan TAHMİNİ oturumlar iptal önerilir (yalnız ayrıştırma sorunsuzsa; yanlış iptali önlemek için).
    if (cancelEstimated) {
      for (const r of existing.values()) {
        if (r.isEstimated && !keys.includes(r.key) && r.status !== 'cancelled') proposals.push({ action: 'cancel', key: r.key, exam: r.exam, deliveryMode: r.deliveryMode, name: r.name, date: r.date });
      }
    }
    return { proposals, same };
  };

  const insertImport = async (fields) => {
    const p = await getPlatform(rawQuery);
    const { rows } = await rawQuery(
      `INSERT INTO content.exam_calendar_import (exam_calendar_import_tenant_code, exam_calendar_import_organization_id, exam_calendar_import_status, exam_calendar_import_source_url,
              exam_calendar_import_source_year, exam_calendar_import_source_hash, exam_calendar_import_parser, exam_calendar_import_proposals, exam_calendar_import_error,
              exam_calendar_import_metadata, exam_calendar_import_created_by, exam_calendar_import_updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING exam_calendar_import_code AS code`,
      [p.tenantCode, p.organizationId, fields.status, fields.sourceUrl || null, fields.year || null, fields.hash || null, fields.parser || null,
        JSON.stringify(fields.proposals || []), fields.error || null, JSON.stringify(fields.metadata || {}), fields.userId || null]);
    return Number(rows[0].code);
  };

  /** PDF → öneriler → kayıt. Aynı dosya daha önce işlendiyse o kayıt döner. */
  const importPdf = async ({ buffer, sourceUrl = null, year = null, userId = null, metadata = {} }) => {
    const hash = sha256(buffer);
    const dup = await rawQuery(
      `SELECT exam_calendar_import_code AS code FROM content.exam_calendar_import WHERE exam_calendar_import_source_hash = $1 AND exam_calendar_import_status <> 'failed' ORDER BY exam_calendar_import_id DESC LIMIT 1`, [hash]);
    if (dup.rows.length) return { code: Number(dup.rows[0].code), duplicate: true };
    let rows;
    try { rows = await pdfToRows(buffer); } catch (e) {
      return { code: await insertImport({ status: 'failed', sourceUrl, year, hash, error: `PDF okunamadı: ${e.message}`.slice(0, 2000), metadata, userId }) };
    }
    let { sessions, problems } = parseCalendarRows(rows);
    let parser = 'rules';
    if (!sessions.length && mentionsLanguageExams(rows)) {
      try { sessions = await llmParse(rows); parser = 'llm'; } catch { sessions = []; }
    }
    if (!sessions.length) {
      return { code: await insertImport({ status: 'failed', sourceUrl, year, hash, parser, error: 'Takvimde yabancı dil sınavı satırı bulunamadı', metadata: { ...metadata, problems }, userId }) };
    }
    const { proposals, same } = await diff(sessions, { cancelEstimated: !problems.length });
    const sourceYear = year || Math.max(...sessions.map((s) => s.year));
    const code = await insertImport({
      status: proposals.length ? 'pending' : 'no_change', sourceUrl, year: sourceYear, hash, parser, proposals,
      metadata: { ...metadata, parsedCount: sessions.length, unchangedCount: same, problems }, userId,
    });
    return { code };
  };

  /** Haftalık tarama (cron) ya da elle "şimdi tara". */
  const scan = async ({ caller = null } = {}) => {
    const thisYear = Number(todayIstanbul(nowFn()).slice(0, 4));
    let found = [];
    try { found = await discover(); } catch (e) { found = []; console.error('[calendar] keşif başarısız:', e.message); }
    for (const y of [thisYear, thisYear + 1]) if (!found.some((f) => f.year === y)) found.push({ year: y, pageUrl: null, pdfUrl: FALLBACK_PDF(y), fallback: true });
    const results = [];
    for (const f of found.filter((x) => x.year >= thisYear)) {
      const seen = await rawQuery(`SELECT exam_calendar_import_code AS code, exam_calendar_import_status AS status FROM content.exam_calendar_import WHERE exam_calendar_import_source_url = $1 ORDER BY exam_calendar_import_id DESC LIMIT 1`, [f.pdfUrl]);
      if (seen.rows.length && seen.rows[0].status !== 'failed') { results.push({ year: f.year, pdfUrl: f.pdfUrl, code: Number(seen.rows[0].code), outcome: 'already_imported' }); continue; }
      const got = await fetchPdf(f.pdfUrl);
      if (got.error) {
        // Tahmin edilen yedek adres yoksa sessiz geç (takvim henüz yayımlanmamış olabilir); duyurusu bulunan dosya indirilemiyorsa panelde görünsün.
        if (f.fallback) { results.push({ year: f.year, pdfUrl: f.pdfUrl, outcome: 'not_published' }); continue; }
        if (seen.rows.length) { results.push({ year: f.year, pdfUrl: f.pdfUrl, code: Number(seen.rows[0].code), outcome: 'still_blocked' }); continue; }
        const code = await insertImport({ status: 'failed', sourceUrl: f.pdfUrl, year: f.year, error: got.message, metadata: { reason: got.error, pageUrl: f.pageUrl, needsUpload: true }, userId: caller ? Number(caller.callerUserId) : null });
        results.push({ year: f.year, pdfUrl: f.pdfUrl, code, outcome: 'download_failed', reason: got.error });
        continue;
      }
      const r = await importPdf({ buffer: got.buffer, sourceUrl: f.pdfUrl, year: f.year, userId: caller ? Number(caller.callerUserId) : null, metadata: { pageUrl: f.pageUrl } });
      results.push({ year: f.year, pdfUrl: f.pdfUrl, code: r.code, outcome: r.duplicate ? 'already_imported' : 'imported' });
    }
    return { results };
  };

  /** Editör PDF'i tarayıcıdan indirip yükler (ÖSYM otomatik indirmeyi engellediğinde). */
  const upload = async ({ caller, pdfBase64, sourceUrl = null }) => {
    const buffer = Buffer.from(String(pdfBase64 || '').replace(/^data:[^,]*,/, ''), 'base64');
    if (buffer.length < 100 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new DomainError('CONTENT_CALENDAR_PDF_INVALID', 'pdfBase64 must be a PDF file', { field: 'pdfBase64' });
    if (buffer.length > MAX_PDF_BYTES) throw new DomainError('CONTENT_CALENDAR_PDF_INVALID', 'PDF is too large', { field: 'pdfBase64' });
    if (sourceUrl && !/^https:\/\/([a-z0-9-]+\.)*osym\.gov\.tr\//i.test(sourceUrl)) throw new DomainError('CONTENT_CALENDAR_PDF_INVALID', 'sourceUrl must be an osym.gov.tr address', { field: 'sourceUrl' });
    const r = await importPdf({ buffer, sourceUrl, userId: Number(caller.callerUserId), metadata: { uploaded: true } });
    await writeAudit({ caller, action: 'content.calendar_import.upload', schema: 'content', table: 'exam_calendar_import', entityCode: r.code, after: { sourceUrl, duplicate: !!r.duplicate } });
    return get({ code: r.code });
  };

  const SELECT = `
    SELECT c.exam_calendar_import_id AS id, c.exam_calendar_import_code AS code, c.exam_calendar_import_status AS status, c.exam_calendar_import_source_url AS "sourceUrl",
           c.exam_calendar_import_source_year AS year, c.exam_calendar_import_parser AS parser, c.exam_calendar_import_proposals AS proposals, c.exam_calendar_import_error AS error,
           c.exam_calendar_import_metadata AS metadata, c.exam_calendar_import_decided_at AS "decidedAt", c.exam_calendar_import_created_at AS "createdAt",
           u.user_account_code AS "deciderCode", u.user_account_display_name AS "deciderName"
      FROM content.exam_calendar_import c LEFT JOIN identity.user_account u ON u.user_account_id = c.exam_calendar_import_decided_by`;
  const dto = (r) => ({
    code: Number(r.code), status: r.status, sourceUrl: r.sourceUrl, year: r.year, parser: r.parser, proposals: r.proposals, error: r.error,
    pageUrl: r.metadata?.pageUrl || null, needsUpload: !!r.metadata?.needsUpload, parsedCount: r.metadata?.parsedCount ?? null, unchangedCount: r.metadata?.unchangedCount ?? null,
    problems: r.metadata?.problems || [], appliedKeys: r.metadata?.appliedKeys || null, decidedBy: userRef(r.deciderCode, r.deciderName), decidedAt: iso(r.decidedAt), createdAt: iso(r.createdAt),
  });

  const list = async ({ query = {} }) => {
    const { page, pageSize, offset } = pageOf(query);
    const params = [];
    let w = '';
    if (query.status) { params.push(asArray(query.status)); w = 'WHERE c.exam_calendar_import_status = ANY($1::varchar[])'; }
    const [rows, total] = await Promise.all([
      rawQuery(`${SELECT} ${w} ORDER BY c.exam_calendar_import_id DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
      rawQuery(`SELECT count(*)::int AS n FROM content.exam_calendar_import c ${w}`, params),
    ]);
    return { items: rows.rows.map(dto), page, pageSize, total: total.rows[0].n };
  };
  const get = async ({ code }) => {
    const { rows } = await rawQuery(`${SELECT} WHERE c.exam_calendar_import_code = $1`, [reqCode(code, 'CONTENT_CALENDAR_NOT_FOUND', 'Calendar import not found')]);
    if (!rows.length) throw new DomainError('CONTENT_CALENDAR_NOT_FOUND', 'Calendar import not found');
    return dto(rows[0]);
  };

  /** Onay: seçilen (ya da tüm) öneriler exam_session'a yazılır. */
  const apply = async ({ caller, code, keys }) => {
    const imp = await get({ code });
    if (imp.status !== 'pending') throw new DomainError('CONTENT_CALENDAR_NOT_PENDING', 'Only pending imports can be applied', { status: imp.status }, 409);
    const pick = Array.isArray(keys) && keys.length ? imp.proposals.filter((p) => keys.includes(p.key)) : imp.proposals;
    if (!pick.length) throw new DomainError('CONTENT_CALENDAR_NOT_PENDING', 'No proposal selected', { field: 'keys' });
    const today = todayIstanbul(nowFn());
    const userId = Number(caller.callerUserId);
    const p = await getPlatform(rawQuery);
    await withTransaction(async (tx) => {
      const q = (sql, params) => tx.query(sql, params);
      for (const x of pick) {
        if (x.action === 'cancel') {
          await q(`UPDATE content.exam_session SET exam_session_status='cancelled', exam_session_updated_by=$2 WHERE exam_session_key=$1 AND exam_session_tenant_code=$3`, [x.key, userId, p.tenantCode]);
          continue;
        }
        const status = statusFor({ ...x, isEstimated: false }, today);
        const v = [x.name, x.date, x.applicationStart, x.applicationEnd, x.lateApplicationEnd, x.resultDate, imp.sourceUrl, status, userId];
        if (x.action === 'update') {
          await q(
            `UPDATE content.exam_session SET exam_session_name=$1, exam_session_exam_date=$2, exam_session_application_start=$3, exam_session_application_end=$4,
                    exam_session_late_application_end=$5, exam_session_result_date=$6, exam_session_source_url=COALESCE($7, exam_session_source_url), exam_session_is_estimated=false,
                    exam_session_status=CASE WHEN exam_session_status='cancelled' THEN exam_session_status ELSE $8 END, exam_session_updated_by=$9
              WHERE exam_session_key=$10 AND exam_session_tenant_code=$11`, [...v, x.key, p.tenantCode]);
        } else {
          await q(
            `INSERT INTO content.exam_session (exam_session_tenant_code, exam_session_organization_id, exam_session_exam_id, exam_session_delivery_mode, exam_session_key, exam_session_name,
                    exam_session_exam_date, exam_session_application_start, exam_session_application_end, exam_session_late_application_end, exam_session_result_date,
                    exam_session_source_url, exam_session_status, exam_session_is_estimated, exam_session_created_by, exam_session_updated_by)
             SELECT $10, $11, e.exam_id, $12, $13, $1, $2, $3, $4, $5, $6, $7, $8, false, $9, $9 FROM content.exam e WHERE e.exam_key = $14`,
            [...v, p.tenantCode, p.organizationId, x.deliveryMode, x.key, x.exam]);
        }
      }
      await q(
        `UPDATE content.exam_calendar_import SET exam_calendar_import_status='applied', exam_calendar_import_decided_by=$2, exam_calendar_import_decided_at=$3, exam_calendar_import_updated_by=$2,
                exam_calendar_import_metadata = exam_calendar_import_metadata || $4::jsonb WHERE exam_calendar_import_code=$1`,
        [imp.code, userId, nowFn(), JSON.stringify({ appliedKeys: pick.map((x) => x.key) })]);
    });
    await bumpCatalogVersion();
    await writeAudit({ caller, action: 'content.calendar_import.apply', schema: 'content', table: 'exam_calendar_import', entityCode: imp.code, after: { keys: pick.map((x) => x.key) } });
    return get({ code });
  };

  const reject = async ({ caller, code, note = null }) => {
    const imp = await get({ code });
    if (!['pending', 'failed'].includes(imp.status)) throw new DomainError('CONTENT_CALENDAR_NOT_PENDING', 'Only pending or failed imports can be rejected', { status: imp.status }, 409);
    await rawQuery(
      `UPDATE content.exam_calendar_import SET exam_calendar_import_status='rejected', exam_calendar_import_decided_by=$2, exam_calendar_import_decided_at=$3, exam_calendar_import_updated_by=$2,
              exam_calendar_import_metadata = exam_calendar_import_metadata || $4::jsonb WHERE exam_calendar_import_code=$1`,
      [imp.code, Number(caller.callerUserId), nowFn(), JSON.stringify({ rejectNote: note ? String(note).slice(0, 500) : null })]);
    await writeAudit({ caller, action: 'content.calendar_import.reject', schema: 'content', table: 'exam_calendar_import', entityCode: imp.code, after: { note } });
    return get({ code });
  };

  /** Günlük (cron): durumu tarihten hesapla; yalnız değişenleri yaz. */
  const refreshSessionStatuses = async () => {
    const today = todayIstanbul(nowFn());
    const { rows } = await rawQuery(
      `SELECT exam_session_id AS id, exam_session_key AS key, exam_session_status AS status, exam_session_is_estimated AS "isEstimated", exam_session_exam_date AS date,
              exam_session_application_start AS "applicationStart", exam_session_application_end AS "applicationEnd", exam_session_late_application_end AS "lateApplicationEnd",
              exam_session_result_date AS "resultDate" FROM content.exam_session WHERE exam_session_status <> 'cancelled'`);
    let changed = 0;
    for (const r of rows) {
      const s = { ...r, date: dateOnly(r.date), applicationStart: dateOnly(r.applicationStart), applicationEnd: dateOnly(r.applicationEnd), lateApplicationEnd: dateOnly(r.lateApplicationEnd), resultDate: dateOnly(r.resultDate) };
      const next = statusFor(s, today);
      if (next !== r.status) {
        await rawQuery(`UPDATE content.exam_session SET exam_session_status=$2 WHERE exam_session_id=$1`, [r.id, next]);
        changed += 1;
        // Sınav yeni yapıldıysa (yapıldı/sonuç açıklandı'ya ilk geçiş) sınav sonrası soru yenilemesi.
        if (onExamHeld && DONE.includes(next) && !DONE.includes(r.status)) {
          try { await onExamHeld({ ...s, id: r.id, key: r.key }); } catch (e) { console.error(`[calendar] ${r.key} sınav sonrası iş:`, e.message); }
        }
      }
    }
    if (changed) await bumpCatalogVersion();
    return { changed };
  };

  return Object.freeze({ scan, upload, list, get, apply, reject, refreshSessionStatuses });
};
