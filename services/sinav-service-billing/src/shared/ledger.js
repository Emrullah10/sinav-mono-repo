import { LIVE_STATUSES, round2 } from './helpers.js';
import { splitVat } from './pricing.js';

/** Kullanıcının canlı aboneliğini satır kilidiyle okur (uq_subscription_live: kullanıcı başına en çok bir). */
export const lockLiveSubscription = async (tx, userId) =>
  (await tx.query(
    `SELECT subscription_id AS id, subscription_code AS code, subscription_status AS status, subscription_product_id AS "productId", subscription_price_id AS "priceId",
            subscription_current_period_start AS "periodStart", subscription_current_period_end AS "periodEnd", subscription_trial_ends_at AS "trialEndsAt",
            subscription_cancel_at_period_end AS "cancelAtPeriodEnd", subscription_channel AS channel, subscription_payment_method_id AS "paymentMethodId",
            subscription_metadata AS metadata
       FROM billing.subscription WHERE subscription_user_account_id = $1 AND subscription_status = ANY($2::varchar[]) FOR UPDATE`, [userId, LIVE_STATUSES])).rows[0] || null;

export const insertGrant = (tx, { user, productId, source, subscriptionId, startsAt, endsAt, sourceRef = null }) =>
  tx.query(
    `INSERT INTO billing.entitlement_grant (entitlement_grant_tenant_code, entitlement_grant_organization_id, entitlement_grant_user_account_id, entitlement_grant_product_id,
        entitlement_grant_source, entitlement_grant_subscription_id, entitlement_grant_source_ref, entitlement_grant_starts_at, entitlement_grant_ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [user.tenantCode, user.orgId, user.id, productId, source, subscriptionId, sourceRef, startsAt, endsAt]);

/**
 * Abonelik satırını oluşturur/günceller ve hak (grant) yazar.
 * `existing` varsa yerinde güncellenir (deneme → ücretli, değiştirme); eski grant'lar iptal edilir (`revokeOld`).
 */
export const writeSubscription = async (tx, {
  user, price, period, status, source, existing = null, trialEndsAt = null, paymentMethodId = null, lockedAmount = null, metadataPatch = {}, revokeOld = true, grantEndsAt = null, now,
}) => {
  let id; let code;
  if (existing) {
    const r = await tx.query(
      `UPDATE billing.subscription SET subscription_product_id=$2, subscription_price_id=$3, subscription_status=$4, subscription_current_period_start=$5, subscription_current_period_end=$6,
              subscription_trial_ends_at = COALESCE($7, subscription_trial_ends_at), subscription_cancel_at_period_end=false, subscription_canceled_at=NULL, subscription_cancel_reason=NULL,
              subscription_cancel_note=NULL, subscription_paused_until=NULL, subscription_exam_session_id=$8, subscription_payment_method_id=COALESCE($9, subscription_payment_method_id),
              subscription_locked_amount=$10, subscription_renewal_attempts=0, subscription_metadata = subscription_metadata || $11::jsonb, subscription_updated_by=$12
        WHERE subscription_id=$1 RETURNING subscription_id AS id, subscription_code AS code`,
      [existing.id, price.productId, price.id, status, period.start, period.end, trialEndsAt, period.examSessionId, paymentMethodId, lockedAmount, JSON.stringify(metadataPatch), user.id]);
    ({ id, code } = r.rows[0]);
    if (revokeOld) await tx.query(`UPDATE billing.entitlement_grant SET entitlement_grant_revoked_at = $2 WHERE entitlement_grant_subscription_id = $1 AND entitlement_grant_revoked_at IS NULL`, [id, now]);
  } else {
    const r = await tx.query(
      `INSERT INTO billing.subscription (subscription_tenant_code, subscription_organization_id, subscription_user_account_id, subscription_product_id, subscription_price_id, subscription_status,
          subscription_channel, subscription_current_period_start, subscription_current_period_end, subscription_trial_ends_at, subscription_exam_session_id, subscription_payment_method_id,
          subscription_locked_amount, subscription_metadata, subscription_created_by, subscription_updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,'web',$7,$8,$9,$10,$11,$12,$13::jsonb,$3,$3) RETURNING subscription_id AS id, subscription_code AS code`,
      [user.tenantCode, user.orgId, user.id, price.productId, price.id, status, period.start, period.end, trialEndsAt, period.examSessionId, paymentMethodId, lockedAmount, JSON.stringify(metadataPatch)]);
    ({ id, code } = r.rows[0]);
  }
  await insertGrant(tx, { user, productId: price.productId, source, subscriptionId: id, startsAt: period.start, endsAt: grantEndsAt || period.end });
  return { id, code };
};

export const insertInvoice = async (tx, { user, paymentId, total, snapshot, currency = 'TRY' }) => {
  const v = splitVat(total);
  const r = await tx.query(
    `INSERT INTO billing.invoice (invoice_tenant_code, invoice_organization_id, invoice_payment_id, invoice_user_account_id, invoice_status, invoice_subtotal, invoice_tax_amount, invoice_total, invoice_currency, invoice_billing_snapshot)
     VALUES ($1,$2,$3,$4,'pending_issue',$5,$6,$7,$8,$9::jsonb) RETURNING invoice_code AS code`,
    [user.tenantCode, user.orgId, paymentId, user.id, v.subtotal, v.tax, round2(total), currency, JSON.stringify(snapshot || {})]);
  return r.rows[0].code;
};

export const currentLegalDocs = async (run, locale = 'tr') => {
  const { rows } = await run(
    `SELECT legal_document_id AS id, legal_document_doc_type AS type, legal_document_locale AS locale FROM identity.legal_document
      WHERE legal_document_doc_type IN ('pre_information','distance_sales') AND legal_document_is_current ORDER BY (legal_document_locale = $1) DESC, legal_document_id DESC`, [locale]);
  const pick = (t) => rows.find((r) => r.type === t)?.id || null;
  return { preInfoId: pick('pre_information'), distanceSalesId: pick('distance_sales') };
};
