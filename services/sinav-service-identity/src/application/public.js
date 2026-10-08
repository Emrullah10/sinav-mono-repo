import { DomainError, randomToken } from 'app-shared';
import { normalizeEmail, isEmail, getTenantCode, getPlatformOrgId, sha256, subjectHash } from '../shared/helpers.js';
import { render } from '../shared/email-templates.js';

const gatewayUrl = () => process.env.GATEWAY_REST_URL || 'http://127.0.0.1:2000';
const DOC_TYPES = ['kvkk_notice', 'privacy_policy', 'terms_of_use', 'cookie_policy', 'pre_information', 'distance_sales', 'cancellation_refund', 'marketing_consent_text'];

export const makePublic = ({ rawQuery, mailer }) => {
  const getLegalDocument = async ({ type, locale = 'tr' }) => {
    if (!DOC_TYPES.includes(type)) throw new DomainError('LEGAL_DOCUMENT_NOT_FOUND', 'Document not found');
    const { rows } = await rawQuery(
      `SELECT legal_document_code AS code, legal_document_doc_type AS type, legal_document_version AS version, legal_document_locale AS locale, legal_document_title AS title,
              legal_document_summary_md AS "summaryMd", legal_document_body_md AS "bodyMd", legal_document_published_at AS "publishedAt"
         FROM identity.legal_document WHERE legal_document_doc_type=$1 AND legal_document_is_current ORDER BY (legal_document_locale = $2) DESC LIMIT 1`, [type, locale]);
    if (!rows.length) throw new DomainError('LEGAL_DOCUMENT_NOT_FOUND', 'Document not found');
    return rows[0];
  };
  const listLegalDocuments = async ({ locale = 'tr' }) => (await rawQuery(
    `SELECT DISTINCT ON (legal_document_doc_type) legal_document_doc_type AS type, legal_document_title AS title, legal_document_version AS version, legal_document_published_at AS "publishedAt"
       FROM identity.legal_document WHERE legal_document_is_current ORDER BY legal_document_doc_type, (legal_document_locale = $1) DESC`, [locale])).rows;

  const joinWaitlist = async ({ email, examKey = null, source = null, utm = {}, marketingConsent = false }) => {
    const emailN = normalizeEmail(email);
    if (!isEmail(emailN)) throw new DomainError('AUTH_EMAIL_INVALID', 'Invalid email');
    const tenantCode = await getTenantCode(rawQuery);
    const orgId = await getPlatformOrgId(rawQuery);
    let examId = null;
    if (examKey) examId = (await rawQuery(`SELECT exam_id AS id FROM content.exam WHERE exam_key=$1`, [String(examKey)])).rows[0]?.id || null;
    let consentId = null;
    if (marketingConsent) {
      const c = await rawQuery(
        `INSERT INTO identity.consent (consent_tenant_code, consent_organization_id, consent_subject_hash, consent_consent_type, consent_granted, consent_legal_document_id, consent_source_platform)
         VALUES ($1,$2,$3,'marketing_email',true,(SELECT legal_document_id FROM identity.legal_document WHERE legal_document_doc_type='marketing_consent_text' AND legal_document_is_current LIMIT 1),'web')
         RETURNING consent_id AS id`, [tenantCode, orgId, subjectHash(emailN)]);
      consentId = c.rows[0].id;
    }
    const token = randomToken(24);
    const r = await rawQuery(
      `INSERT INTO identity.waitlist_entry (waitlist_entry_tenant_code, waitlist_entry_organization_id, waitlist_entry_email_normalized, waitlist_entry_exam_id, waitlist_entry_source,
                                            waitlist_entry_utm, waitlist_entry_marketing_consent_id, waitlist_entry_confirm_token_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (waitlist_entry_tenant_code, waitlist_entry_email_normalized) DO UPDATE SET waitlist_entry_confirm_token_hash = EXCLUDED.waitlist_entry_confirm_token_hash,
              waitlist_entry_unsubscribed_at = NULL
       RETURNING waitlist_entry_code AS code`, [tenantCode, orgId, emailN, examId, source ? String(source).slice(0, 60) : null, JSON.stringify(utm || {}), consentId, sha256(token)]);
    mailer.send({ to: emailN, ...render('waitlist_confirm', { url: `${gatewayUrl()}/api/sinav-service-identity/v1/public/waitlist/confirm?token=${token}` }) }).catch(() => {});
    return { joined: true, code: Number(r.rows[0].code) };
  };
  const confirmWaitlist = async ({ token }) => {
    const r = await rawQuery(`UPDATE identity.waitlist_entry SET waitlist_entry_confirmed_at = COALESCE(waitlist_entry_confirmed_at, now()) WHERE waitlist_entry_confirm_token_hash=$1 RETURNING waitlist_entry_code AS code`, [sha256(String(token || ''))]);
    if (!r.rows.length) throw new DomainError('WAITLIST_TOKEN_INVALID', 'Invalid token');
    return { confirmed: true };
  };

  const submitContact = async ({ caller = null, email, name, topic = 'other', subject, body, platform = 'web', appVersion }) => {
    const emailN = normalizeEmail(email);
    if (!isEmail(emailN)) throw new DomainError('AUTH_EMAIL_INVALID', 'Invalid email');
    if (!body || String(body).trim().length < 5 || String(body).length > 5000) throw new DomainError('CONTACT_BODY_INVALID', 'Message must be 5-5000 characters');
    const tenantCode = await getTenantCode(rawQuery);
    const orgId = await getPlatformOrgId(rawQuery);
    const t = ['account', 'payment', 'plan', 'tutor', 'exam_info', 'content_error', 'other'].includes(topic) ? topic : 'other';
    const r = await rawQuery(
      `INSERT INTO identity.contact_message (contact_message_tenant_code, contact_message_organization_id, contact_message_sender_organization_id, contact_message_user_account_id,
              contact_message_email_normalized, contact_message_name, contact_message_topic, contact_message_subject, contact_message_body, contact_message_client_platform, contact_message_app_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING contact_message_code AS code`,
      [tenantCode, orgId, caller?.callerOrganizationId ? Number(caller.callerOrganizationId) : null, caller?.callerUserId ? Number(caller.callerUserId) : null, emailN,
        name ? String(name).slice(0, 120) : null, t, subject ? String(subject).slice(0, 200) : null, String(body), ['web', 'ios', 'android'].includes(platform) ? platform : 'web', appVersion || null]);
    mailer.send({ to: emailN, ...render('contact_received', { subject }) }).catch(() => {});
    if (process.env.SUPPORT_EMAIL) mailer.send({ to: process.env.SUPPORT_EMAIL, subject: `[ODAK destek] ${t}: ${subject || ''}`, text: `${emailN}\n\n${body}` }).catch(() => {});
    return { received: true, code: Number(r.rows[0].code) };
  };

  return Object.freeze({ getLegalDocument, listLegalDocuments, joinWaitlist, confirmWaitlist, submitContact });
};
