import { DomainError, fetchInternal, internalHeaders, INTERNAL_TIMEOUTS, writeAudit } from 'app-shared';
import { CMS_STATUSES, requireCode, clip } from '../shared/helpers.js';

const identityBase = () => (process.env.SERVICE_IDENTITY_REST_URL || 'http://127.0.0.1:2001').replace(/\/+$/, '');
const REPORT_REASON_LABELS_TR = { wrong_info: 'Yanlış bilgi', unclear: 'Anlaşılmıyor', off_topic: 'Konu dışı', inappropriate: 'Uygunsuz', other: 'Diğer' };

export const makeCms = ({ rawQuery }) => {
  const listReports = async ({ caller, status, limit = 50, cursor }) => {
    if (status && !CMS_STATUSES.includes(status)) throw new DomainError('TUTOR_REPORT_STATUS_INVALID', 'Unknown status');
    const lim = Math.min(100, Math.max(1, Number(limit) || 50));
    const cur = cursor && /^\d{1,18}$/.test(String(cursor)) ? String(cursor) : null;
    const { rows } = await rawQuery(
      `SELECT r.message_report_id AS id, r.message_report_code AS code, r.message_report_reason AS reason, r.message_report_note AS note, r.message_report_status AS status,
              r.message_report_message_snapshot AS snapshot, m.message_code AS "messageCode", r.message_report_created_at AS "createdAt", r.message_report_resolved_at AS "resolvedAt",
              r.message_report_resolution_note AS "resolutionNote"
         FROM tutor.message_report r LEFT JOIN tutor.message m ON m.message_id = r.message_report_message_id
        WHERE r.message_report_tenant_code=$1 AND ($2::varchar IS NULL OR r.message_report_status=$2::varchar) AND ($3::bigint IS NULL OR r.message_report_id < $3::bigint)
        ORDER BY r.message_report_id DESC LIMIT $4`, [Number(caller.callerTenantCode) || 1, status || null, cur, lim + 1]);
    const page = rows.slice(0, lim);
    const parse = (s) => { try { return JSON.parse(s); } catch { return { assistantMessage: s }; } };
    return {
      reports: page.map((r) => ({
        code: String(r.code), reason: r.reason, note: r.note, status: r.status, messageCode: r.messageCode ? String(r.messageCode) : null,
        snapshot: parse(r.snapshot), createdAt: r.createdAt, resolvedAt: r.resolvedAt, resolutionNote: r.resolutionNote,
      })),
      nextCursor: rows.length > lim ? String(page[page.length - 1].id) : null,
    };
  };

  const notifyReporter = async (caller, report, outcome, note) => {
    if (!report.reporterId) return;
    const resolved = outcome === 'resolved';
    try {
      await fetchInternal(`${identityBase()}/api/sinav-service-identity/v1/internal/notifications`, {
        method: 'POST', headers: internalHeaders(caller), timeoutMs: INTERNAL_TIMEOUTS.bestEffort(),
        body: {
          userAccountId: Number(report.reporterId), kind: 'report_resolved',
          title: resolved ? 'Bildirdiğin yanıtı inceledik' : 'Bildirimini inceledik',
          body: clip(note || (resolved ? 'Öğretmen yanıtıyla ilgili bildirimin için teşekkürler; gerekli düzeltmeyi yaptık.' : 'Bildirimini inceledik; bu yanıtta bir değişiklik gerekmedi.'), 190),
          deepLink: '/ogretmen', payload: { source: 'tutor_message', reportCode: String(report.code), outcome, reason: REPORT_REASON_LABELS_TR[report.reason] || report.reason },
          dedupeKey: `report_resolved:tutor:${report.code}`, channels: ['in_app'],
        },
      });
    } catch (e) { console.error('[tutor] bildirim gönderilemedi', e.code || e.message); }
  };

  const resolveReport = async ({ caller, code, status = 'resolved', note }) => {
    const c = requireCode(code, 'TUTOR_REPORT_NOT_FOUND');
    if (!['resolved', 'rejected', 'in_review'].includes(status)) throw new DomainError('TUTOR_REPORT_STATUS_INVALID', 'status must be resolved, rejected or in_review');
    const res = await rawQuery(
      `UPDATE tutor.message_report SET message_report_status=$2::varchar, message_report_resolved_by=$3, message_report_resolved_at = CASE WHEN $2::varchar='in_review' THEN NULL ELSE now() END,
              message_report_resolution_note=$4, message_report_updated_by=$3, message_report_updated_at=now()
        WHERE message_report_code=$1 AND message_report_tenant_code=$5 AND message_report_status IN ('open','in_review')
        RETURNING message_report_code AS code, message_report_reason AS reason, message_report_reporter_user_account_id AS "reporterId", message_report_status AS status`,
      [c, status, Number(caller.callerUserId), note ? clip(String(note).trim(), 2000) : null, Number(caller.callerTenantCode) || 1]);
    if (!res.rows.length) {
      const ex = await rawQuery(`SELECT 1 FROM tutor.message_report WHERE message_report_code=$1`, [c]);
      if (!ex.rows.length) throw new DomainError('TUTOR_REPORT_NOT_FOUND', 'Report not found');
      throw new DomainError('TUTOR_REPORT_NOT_EDITABLE', 'Report is already closed');
    }
    const rep = res.rows[0];
    await writeAudit({ caller, action: 'tutor.message_report.resolve', schema: 'tutor', table: 'message_report', entityCode: Number(c), after: { status, note: note || null } });
    if (status !== 'in_review') await notifyReporter(caller, rep, status, note);
    return { code: String(rep.code), status: rep.status };
  };

  return Object.freeze({ listReports, resolveReport });
};
