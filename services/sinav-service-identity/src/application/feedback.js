import { DomainError, withTransaction, storagePut } from 'app-shared';
import { getTenantCode, getPlatformOrgId } from '../shared/helpers.js';

// Uygulama içi geri bildirim (hata / öneri / kullanım senaryosu) + fotoğraf ve ses ekleri (storage.blob, anahtar feedback/{kod}/{sıra}).
const KINDS = ['bug', 'suggestion', 'other'];
const STATUSES = ['open', 'in_review', 'resolved', 'rejected'];
const PLATFORMS = ['web', 'ios', 'android'];
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_MS = 3 * 60 * 1000;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const DAILY_LIMIT = 30;
const KEY_PREFIX = 'feedback/';

const ascii = (buf, from, to) => buf.subarray(from, to).toString('latin1');

/** İçerikten tür tespiti; istemcinin söylediği türe güvenilmez. */
export const sniff = (buf) => {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', contentType: 'image/jpeg' };
  if (buf[0] === 0x89 && ascii(buf, 1, 4) === 'PNG') return { kind: 'image', contentType: 'image/png' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { kind: 'image', contentType: 'image/webp' };
  if (ascii(buf, 4, 8) === 'ftyp') return { kind: 'audio', contentType: 'audio/mp4' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'audio', contentType: 'audio/webm' };
  if (ascii(buf, 0, 4) === 'OggS') return { kind: 'audio', contentType: 'audio/ogg' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') return { kind: 'audio', contentType: 'audio/wav' };
  if (ascii(buf, 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0)) return { kind: 'audio', contentType: 'audio/mpeg' };
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return { kind: 'audio', contentType: 'audio/aac' };
  return null;
};

const invalid = (code, message, details) => new DomainError(code, message, details, 400);

const cleanContext = (context) => {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
  const out = {};
  for (const [k, v] of Object.entries(context).slice(0, 20)) {
    if (['string', 'number', 'boolean'].includes(typeof v)) out[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 300) : v;
  }
  return out;
};

/** Ekleri çözer ve doğrular: en çok 3 görsel + 1 ses. */
const decodeAttachments = (list) => {
  if (list == null) return [];
  if (!Array.isArray(list)) throw invalid('FEEDBACK_ATTACHMENT_INVALID', 'attachments must be a list');
  const out = [];
  let total = 0;
  for (const a of list) {
    const data = typeof a?.data === 'string' ? a.data.replace(/^data:[^;]+;base64,/, '') : '';
    const buf = Buffer.from(data, 'base64');
    const type = sniff(buf);
    if (!type) throw invalid('FEEDBACK_ATTACHMENT_INVALID', 'Unsupported attachment');
    const limit = type.kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    if (buf.length > limit) throw invalid('FEEDBACK_ATTACHMENT_TOO_LARGE', 'Attachment too large', { kind: type.kind, maxBytes: limit });
    total += buf.length;
    const durationMs = type.kind === 'audio' ? Math.max(0, Math.round(Number(a.durationMs) || 0)) : null;
    if (durationMs && durationMs > MAX_AUDIO_MS + 2000) throw invalid('FEEDBACK_ATTACHMENT_TOO_LARGE', 'Recording too long', { kind: 'audio', maxMs: MAX_AUDIO_MS });
    out.push({ ...type, buf, durationMs, source: ['camera', 'library', 'screenshot', 'paste', 'file'].includes(a.source) ? a.source : null });
  }
  if (out.filter((a) => a.kind === 'image').length > MAX_IMAGES || out.filter((a) => a.kind === 'audio').length > 1) {
    throw invalid('FEEDBACK_ATTACHMENT_LIMIT', 'Too many attachments', { maxImages: MAX_IMAGES, maxAudio: 1 });
  }
  if (total > MAX_TOTAL_BYTES) throw invalid('FEEDBACK_ATTACHMENT_TOO_LARGE', 'Attachments too large', { maxBytes: MAX_TOTAL_BYTES });
  return out;
};

export const makeFeedback = ({ rawQuery, mailer }) => {
  const submit = async ({ caller, kind = 'bug', message = '', screen, platform = 'web', appVersion, locale, context, attachments }) => {
    const k = KINDS.includes(kind) ? kind : 'other';
    const text = String(message || '').trim();
    if (text.length > 5000) throw invalid('FEEDBACK_MESSAGE_INVALID', 'Message must be at most 5000 characters');
    const files = decodeAttachments(attachments);
    if (text.length < 3 && !files.length) throw invalid('FEEDBACK_EMPTY', 'Write a few words or add a photo or recording');
    const userId = caller?.callerUserId ? Number(caller.callerUserId) : null;
    const senderOrgId = caller?.callerOrganizationId ? Number(caller.callerOrganizationId) : null;
    if (userId) {
      const { rows } = await rawQuery(`SELECT count(*)::int AS n FROM identity.feedback WHERE feedback_user_account_id=$1 AND feedback_created_at > now() - interval '1 day'`, [userId]);
      if (rows[0].n >= DAILY_LIMIT) throw new DomainError('FEEDBACK_RATE_LIMITED', 'Daily feedback limit reached', { limit: DAILY_LIMIT }, 429);
    }
    const tenantCode = await getTenantCode(rawQuery);
    const orgId = await getPlatformOrgId(rawQuery);
    const code = await withTransaction(async (tx) => {
      const r = await tx.query(
        `INSERT INTO identity.feedback (feedback_tenant_code, feedback_organization_id, feedback_sender_organization_id, feedback_user_account_id, feedback_kind, feedback_message,
                feedback_screen, feedback_client_platform, feedback_app_version, feedback_locale, feedback_context, feedback_attachment_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING feedback_code AS code`,
        // created_by bilerek boş: hesap silinirken aynı satırdaki üçüncü kullanıcı başvurusu SET NULL zincirinde FK hatası verir (contact_message gibi).
        [tenantCode, orgId, senderOrgId, userId, k, text, screen ? String(screen).slice(0, 200) : null, PLATFORMS.includes(platform) ? platform : 'web',
          appVersion ? String(appVersion).slice(0, 20) : null, locale ? String(locale).slice(0, 10) : null, cleanContext(context), files.length]);
      const fbCode = Number(r.rows[0].code);
      // Ekler aynı işlemde: biri yazılamazsa geri bildirim de yazılmaz (yarım kayıt kalmaz).
      for (const [i, f] of files.entries()) {
        await storagePut({
          key: `${KEY_PREFIX}${fbCode}/${i}`, contentType: f.contentType, data: f.buf, ownerSchema: 'identity', ownerCode: fbCode, organizationId: senderOrgId,
          metadata: { kind: f.kind, index: i, ...(f.durationMs ? { durationMs: f.durationMs } : {}), ...(f.source ? { source: f.source } : {}) }, run: tx.query.bind(tx),
        });
      }
      return fbCode;
    });
    if (process.env.SUPPORT_EMAIL) {
      const summary = text ? text.slice(0, 80) : `(${files.length} ek)`;
      mailer.send({
        to: process.env.SUPPORT_EMAIL,
        subject: `[ODAK geri bildirim] ${k}: ${summary}`,
        text: `#${code} · ${k} · ${platform}${appVersion ? ` ${appVersion}` : ''}${screen ? ` · ${screen}` : ''}\n\n${text || '(metin yok)'}\n\nEk: ${files.map((f) => f.kind).join(', ') || 'yok'}\nCMS → Bildirimler → Geri bildirim`,
      }).catch(() => {});
    }
    return { received: true, code };
  };

  const attachmentsOf = async (codes) => {
    if (!codes.length) return new Map();
    const { rows } = await rawQuery(
      `SELECT blob_owner_code AS "feedbackCode", blob_content_type AS "contentType", blob_byte_size AS "byteSize", blob_metadata AS meta
         FROM storage.blob WHERE blob_owner_schema='identity' AND blob_owner_code = ANY($1::bigint[]) AND blob_key LIKE 'db://feedback/%' ORDER BY blob_key`, [codes]);
    const map = new Map();
    for (const r of rows) {
      const list = map.get(Number(r.feedbackCode)) || [];
      list.push({ index: Number(r.meta?.index ?? list.length), kind: r.meta?.kind || (String(r.contentType).startsWith('audio') ? 'audio' : 'image'), contentType: r.contentType,
        byteSize: Number(r.byteSize), durationMs: r.meta?.durationMs || null, source: r.meta?.source || null });
      map.set(Number(r.feedbackCode), list);
    }
    return map;
  };

  const SELECT = `SELECT f.feedback_code AS code, f.feedback_kind AS kind, f.feedback_message AS message, f.feedback_screen AS screen, f.feedback_client_platform AS platform,
            f.feedback_app_version AS "appVersion", f.feedback_locale AS locale, f.feedback_context AS context, f.feedback_attachment_count AS "attachmentCount",
            f.feedback_status AS status, f.feedback_resolution_note AS "resolutionNote", f.feedback_handled_at AS "handledAt", f.feedback_created_at AS "createdAt",
            u.user_account_code AS "userCode", u.user_account_email_normalized AS email, u.user_account_display_name AS "displayName", (u.user_account_status = 'guest') AS "isGuest"
       FROM identity.feedback f LEFT JOIN identity.user_account u ON u.user_account_id = f.feedback_user_account_id`;
  const shape = (r, att) => ({
    code: Number(r.code), kind: r.kind, message: r.message, screen: r.screen, platform: r.platform, appVersion: r.appVersion, locale: r.locale, context: r.context || {},
    status: r.status, resolutionNote: r.resolutionNote, handledAt: r.handledAt, createdAt: r.createdAt,
    sender: r.userCode ? { code: Number(r.userCode), email: r.email || null, displayName: r.displayName || null, isGuest: !!r.isGuest } : null,
    attachments: att || [],
  });

  const adminList = async ({ status, kind, platform, page = 1, pageSize = 20 }) => {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const where = [];
    const args = [];
    const statuses = String(status || '').split(',').filter((s) => STATUSES.includes(s));
    if (statuses.length) { args.push(statuses); where.push(`f.feedback_status = ANY($${args.length}::text[])`); }
    if (KINDS.includes(kind)) { args.push(kind); where.push(`f.feedback_kind = $${args.length}`); }
    if (PLATFORMS.includes(platform)) { args.push(platform); where.push(`f.feedback_client_platform = $${args.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await rawQuery(`SELECT count(*)::int AS n FROM identity.feedback f ${w}`, args)).rows[0].n;
    const { rows } = await rawQuery(`${SELECT} ${w} ORDER BY f.feedback_created_at DESC LIMIT ${size} OFFSET ${(p - 1) * size}`, args);
    const att = await attachmentsOf(rows.map((r) => Number(r.code)));
    return { items: rows.map((r) => shape(r, att.get(Number(r.code)))), page: p, pageSize: size, total };
  };

  const adminGet = async ({ code }) => {
    const { rows } = await rawQuery(`${SELECT} WHERE f.feedback_code=$1`, [Number(code)]);
    if (!rows.length) throw new DomainError('FEEDBACK_NOT_FOUND', 'Feedback not found', null, 404);
    const att = await attachmentsOf([Number(code)]);
    return shape(rows[0], att.get(Number(code)));
  };

  const adminAttachment = async ({ code, index }) => {
    const { rows } = await rawQuery(
      `SELECT blob_content_type AS "contentType", blob_data AS data FROM storage.blob WHERE blob_key=$1 AND blob_owner_schema='identity' AND blob_owner_code=$2`,
      [`db://${KEY_PREFIX}${Number(code)}/${Number(index)}`, Number(code)]);
    if (!rows.length) throw new DomainError('FEEDBACK_NOT_FOUND', 'Attachment not found', null, 404);
    return rows[0];
  };

  const adminUpdate = async ({ caller, code, status, note }) => {
    if (!STATUSES.includes(status)) throw invalid('FEEDBACK_STATUS_INVALID', 'Invalid status');
    const r = await rawQuery(
      `UPDATE identity.feedback SET feedback_status=$2::varchar, feedback_resolution_note=COALESCE($3::text, feedback_resolution_note), feedback_handled_by=$4::bigint,
              feedback_handled_at = CASE WHEN $2::varchar IN ('resolved','rejected') THEN now() ELSE feedback_handled_at END, feedback_updated_by=$4::bigint
        WHERE feedback_code=$1 RETURNING feedback_code`,
      [Number(code), status, note ? String(note).slice(0, 2000) : null, caller?.callerUserId ? Number(caller.callerUserId) : null]);
    if (!r.rowCount) throw new DomainError('FEEDBACK_NOT_FOUND', 'Feedback not found', null, 404);
    return adminGet({ code });
  };

  return Object.freeze({ submit, adminList, adminGet, adminAttachment, adminUpdate });
};
