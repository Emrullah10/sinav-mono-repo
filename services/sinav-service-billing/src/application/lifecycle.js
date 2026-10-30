import { withTransaction, writeAudit, invalidateEntitlements } from 'app-shared';
import { iso, toNum, findUser, systemCaller, notifyUser, fmtDateTr, addDays, GRACE_DAYS, MAX_RENEWAL_ATTEMPTS, todayIstanbul } from '../shared/helpers.js';
import { loadPriceById, computePeriod, reconcileCampaignSold, splitVat } from '../shared/pricing.js';
import { insertGrant, insertInvoice, currentLegalDocs } from '../shared/ledger.js';
import { loadProfile, snapshotOf } from './profile.js';

const RENEWABLE_SQL = `
  SELECT s.subscription_id AS id, s.subscription_code AS code, s.subscription_user_account_id AS "userId", s.subscription_status AS status, s.subscription_price_id AS "priceId",
         s.subscription_current_period_start AS "periodStart", s.subscription_current_period_end AS "periodEnd", s.subscription_renewal_attempts AS attempts,
         s.subscription_locked_amount AS "lockedAmount", s.subscription_metadata AS metadata, s.subscription_payment_method_id AS "paymentMethodId",
         pm.payment_method_provider AS provider, pm.payment_method_provider_token AS token
    FROM billing.subscription s
    JOIN billing.product p ON p.product_id = s.subscription_product_id
    JOIN billing.payment_method pm ON pm.payment_method_id = s.subscription_payment_method_id AND pm.payment_method_status = 'active'
   WHERE p.product_kind = 'subscription' AND NOT s.subscription_cancel_at_period_end`;

export const makeLifecycle = ({ rawQuery, nowFn, provider, subscription, checkout }) => {
  const invalidateMany = async (ids) => { for (const id of new Set(ids.map(Number))) await invalidateEntitlements(id); };

  /** Tek yenileme denemesi (kayıtlı kartla sahte/gerçek sağlayıcı `charge`). */
  const renewOne = async (sub) => {
    const now = nowFn();
    const user = await findUser(sub.userId, rawQuery);
    const price = await loadPriceById(sub.priceId, rawQuery);
    const amount = sub.lockedAmount !== null && sub.lockedAmount !== undefined ? toNum(sub.lockedAmount) : price.amount;
    const attempt = Number(sub.attempts) + 1;
    const docs = sub.metadata?.consents?.preInfoDocumentId ? { preInfoId: sub.metadata.consents.preInfoDocumentId, distanceSalesId: sub.metadata.consents.distanceSalesDocumentId } : await currentLegalDocs(rawQuery, user.locale || 'tr');
    if (!docs.preInfoId || !docs.distanceSalesId) { console.error('[billing] renewal skipped: legal docs missing', sub.code); return { skipped: true }; }
    const saved = await loadProfile(rawQuery, user.id);
    const profile = saved ? snapshotOf(saved) : { fullName: user.displayName, email: user.email };
    const idem = `renew:${sub.code}:${new Date(sub.periodEnd).getTime()}:${attempt}`;
    const vat = splitVat(amount);
    const ins = await rawQuery(
      `INSERT INTO billing.payment (payment_tenant_code, payment_organization_id, payment_user_account_id, payment_subscription_id, payment_price_id, payment_campaign_id, payment_payment_method_id,
          payment_provider, payment_status, payment_amount, payment_discount_amount, payment_tax_amount, payment_currency, payment_installment_count, payment_idempotency_key,
          payment_pre_info_document_id, payment_distance_sales_document_id, payment_consents_accepted_at, payment_billing_snapshot, payment_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,0,$10,$11,1,$12,$13,$14,$15,$16::jsonb,$17::jsonb)
       ON CONFLICT (payment_idempotency_key) DO NOTHING RETURNING payment_id AS id, payment_code AS code`,
      [user.tenantCode, user.orgId, user.id, sub.id, price.id, price.campaignId, sub.paymentMethodId, sub.provider, amount, vat.tax, price.currency, idem, docs.preInfoId, docs.distanceSalesId,
        sub.metadata?.consents?.acceptedAt || iso(now), JSON.stringify({ billing: profile, priceKey: price.priceKey, renewal: true }), JSON.stringify({ renewal: true, attempt })]);
    if (!ins.rows.length) return { skipped: true };
    const pay = ins.rows[0];

    let out;
    try {
      out = amount > 0 ? await provider.charge({ token: sub.token, amount, currency: price.currency, installmentCount: 1, idempotencyKey: idem, description: price.productName }) : { status: 'succeeded', providerPaymentId: null };
    } catch (e) {
      out = { status: 'failed', failureCode: 'provider_error', failureReasonKey: 'billing.failure.generic', providerPaymentId: null };
      console.error('[billing] charge error', e.message);
    }

    if (out.status === 'succeeded') {
      const wasPastDue = sub.status === 'past_due';
      const start = wasPastDue ? now : new Date(sub.periodEnd);
      const period = computePeriod(price, start, null);
      await withTransaction(async (tx) => {
        await tx.query(`UPDATE billing.payment SET payment_status='succeeded', payment_paid_at=$2, payment_provider_payment_id=$3 WHERE payment_id=$1`, [pay.id, now, out.providerPaymentId]);
        await tx.query(
          `UPDATE billing.subscription SET subscription_status='active', subscription_current_period_start=$2, subscription_current_period_end=$3, subscription_renewal_attempts=0,
                  subscription_metadata = (subscription_metadata - 'lastAttemptAt') || $4::jsonb WHERE subscription_id=$1`,
          [sub.id, period.start, period.end, JSON.stringify({ lastPaymentCode: String(pay.code) })]);
        await insertGrant(tx, { user, productId: price.productId, source: 'subscription', subscriptionId: sub.id, startsAt: period.start, endsAt: period.end });
        await insertInvoice(tx, { user, paymentId: pay.id, total: amount, snapshot: profile, currency: price.currency });
      });
      await invalidateEntitlements(user.id);
      await writeAudit({ caller: systemCaller(user), action: 'billing.renewal.succeeded', schema: 'billing', table: 'payment', entityCode: Number(pay.code), after: { amount } });
      await notifyUser({ userId: user.id, kind: 'payment_receipt', title: 'Ödemen alındı', body: `${price.productName} · ${amount} TL`, deepLink: '/ben/abonelik',
        payload: { planName: price.productName, amount, validUntil: fmtDateTr(period.end), paymentCode: String(pay.code) }, dedupeKey: `payment_receipt:${pay.code}` });
      return { ok: true };
    }

    await withTransaction(async (tx) => {
      await tx.query(`UPDATE billing.payment SET payment_status='failed', payment_failure_code=$2, payment_failure_reason_key=$3 WHERE payment_id=$1`, [pay.id, out.failureCode || 'generic', out.failureReasonKey || 'billing.failure.generic']);
      await tx.query(
        `UPDATE billing.subscription SET subscription_status='past_due', subscription_renewal_attempts = subscription_renewal_attempts + 1,
                subscription_metadata = subscription_metadata || $2::jsonb WHERE subscription_id=$1`, [sub.id, JSON.stringify({ lastAttemptAt: iso(now) })]);
      if (sub.status !== 'past_due') {
        // 3 günlük ek süre: erişim dönem sonu + grace'e uzatılır
        await tx.query(
          `UPDATE billing.entitlement_grant SET entitlement_grant_ends_at = $2 WHERE entitlement_grant_subscription_id=$1 AND entitlement_grant_revoked_at IS NULL AND entitlement_grant_ends_at = $3`,
          [sub.id, addDays(sub.periodEnd, GRACE_DAYS), sub.periodEnd]);
      }
    });
    await invalidateEntitlements(user.id);
    await writeAudit({ caller: systemCaller(user), action: 'billing.renewal.failed', schema: 'billing', table: 'payment', entityCode: Number(pay.code), after: { failureCode: out.failureCode, attempt } });
    if (attempt === 1) {
      await notifyUser({ userId: user.id, kind: 'payment_failed', title: 'Ödemen alınamadı', body: 'Kartını güncellersen devam edebilirsin; 3 günlük ek süren var.', deepLink: '/ben/abonelik',
        payload: { planName: price.productName, amount, failureReasonKey: out.failureReasonKey, graceEndsAt: fmtDateTr(addDays(sub.periodEnd, GRACE_DAYS)) }, dedupeKey: `payment_failed:renew:${sub.code}:${new Date(sub.periodEnd).getTime()}` });
    }
    return { ok: false };
  };

  const renewals = async () => {
    const { rows } = await rawQuery(
      `${RENEWABLE_SQL} AND (
          (s.subscription_status IN ('trialing','active') AND s.subscription_current_period_end <= now())
       OR (s.subscription_status = 'past_due' AND s.subscription_renewal_attempts < $1 AND now() < s.subscription_current_period_end + make_interval(days => $2)
           AND COALESCE((s.subscription_metadata->>'lastAttemptAt')::timestamptz, 'epoch') < now() - interval '20 hours'))
      ORDER BY s.subscription_current_period_end LIMIT 50`, [MAX_RENEWAL_ATTEMPTS, GRACE_DAYS]);
    let changed = 0;
    for (const sub of rows) {
      try { const r = await renewOne(sub); if (!r.skipped) changed += 1; } catch (e) { console.error('[billing] renewal failed', sub.code, e.message); }
    }
    return { changed };
  };

  /** Yeni kart eklenince past_due aboneliği hemen yeniden dener. */
  const retryPastDue = async (subscriptionCode) => {
    const sub = (await rawQuery(`${RENEWABLE_SQL} AND s.subscription_code = $1 AND s.subscription_status = 'past_due'`, [subscriptionCode])).rows[0];
    if (!sub) return null;
    const r = await renewOne({ ...sub, attempts: Math.min(Number(sub.attempts), MAX_RENEWAL_ATTEMPTS - 1) });
    return { retried: true, ok: !!r.ok };
  };

  /** Dakikalık süpürme: biten abonelikler/haklar, bekleyen ödeme zaman aşımı, dondurma sonu, Redis hak önbelleği. */
  const sweep = async () => {
    const users = [];
    const track = (r) => { for (const row of r.rows) users.push(row.uid); return r.rows.length; };
    let changed = 0;
    changed += track(await rawQuery(
      `UPDATE billing.subscription SET subscription_status='canceled' WHERE subscription_status IN ('trialing','active','past_due') AND subscription_cancel_at_period_end
          AND subscription_current_period_end + CASE WHEN subscription_status='past_due' THEN make_interval(days => ${GRACE_DAYS}) ELSE interval '0' END <= now() RETURNING subscription_user_account_id AS uid`));
    changed += track(await rawQuery(
      `UPDATE billing.subscription s SET subscription_status='expired' FROM billing.product p
        WHERE p.product_id = s.subscription_product_id AND s.subscription_status = 'active' AND p.product_kind <> 'subscription' AND s.subscription_current_period_end <= now()
        RETURNING s.subscription_user_account_id AS uid`));
    changed += track(await rawQuery(
      `UPDATE billing.subscription s SET subscription_status='expired' FROM billing.product p
        WHERE p.product_id = s.subscription_product_id AND p.product_kind = 'subscription' AND s.subscription_status IN ('trialing','active') AND NOT s.subscription_cancel_at_period_end
          AND s.subscription_channel = 'web' AND s.subscription_current_period_end <= now()
          AND NOT EXISTS (SELECT 1 FROM billing.payment_method pm WHERE pm.payment_method_id = s.subscription_payment_method_id AND pm.payment_method_status = 'active')
        RETURNING s.subscription_user_account_id AS uid`));
    changed += track(await rawQuery(
      `UPDATE billing.subscription SET subscription_status='expired' WHERE subscription_status='past_due' AND subscription_channel = 'web' AND subscription_current_period_end + make_interval(days => ${GRACE_DAYS}) <= now() RETURNING subscription_user_account_id AS uid`));
    // dondurma sonu
    const paused = (await rawQuery(
      `SELECT s.subscription_id AS id, s.subscription_code AS code, s.subscription_user_account_id AS "userId", s.subscription_price_id AS "priceId", s.subscription_metadata AS metadata
         FROM billing.subscription s WHERE s.subscription_status='paused' AND s.subscription_paused_until <= $1::date`, [todayIstanbul(nowFn())])).rows;
    for (const s of paused) {
      try { await withTransaction((tx) => subscription.resumeFromPause(tx, s, nowFn())); users.push(s.userId); changed += 1; } catch (e) { console.error('[billing] resume pause failed', s.code, e.message); }
    }
    const stale = await checkout.expireStalePayments();
    changed += stale.changed;
    // Biten haklar için ent:{userId} önbelleğini düşür
    const ended = await rawQuery(`SELECT DISTINCT entitlement_grant_user_account_id AS uid FROM billing.entitlement_grant WHERE entitlement_grant_ends_at > now() - interval '3 minutes' AND entitlement_grant_ends_at <= now()`);
    track(ended);
    await invalidateMany(users);
    return { changed };
  };

  const trialEnding = async () => {
    const { rows } = await rawQuery(
      `SELECT s.subscription_code AS code, s.subscription_user_account_id AS "userId", s.subscription_trial_ends_at AS "trialEndsAt", s.subscription_payment_method_id IS NOT NULL AS "hasMethod",
              s.subscription_price_id AS "priceId"
         FROM billing.subscription s WHERE s.subscription_status='trialing' AND NOT s.subscription_cancel_at_period_end AND s.subscription_channel = 'web'
          AND s.subscription_trial_ends_at > now() AND s.subscription_trial_ends_at <= now() + interval '2 days'`);
    let changed = 0;
    for (const s of rows) {
      const price = await loadPriceById(s.priceId, rawQuery);
      const date = fmtDateTr(s.trialEndsAt);
      const ok = await notifyUser({
        userId: s.userId, kind: 'trial_ending', title: `Ücretsiz deneme ${date} tarihinde bitiyor`,
        body: s.hasMethod ? `Sonra ${price.amount} TL/ay. Devam etmek istemiyorsan şimdi iptal edebilirsin.` : 'Devam etmek için bir ödeme yöntemi eklemen gerekiyor.',
        deepLink: '/ben/abonelik', payload: { date, planName: price.productName, amount: price.amount, hasPaymentMethod: s.hasMethod }, dedupeKey: `trial_ending:${s.code}`,
      });
      if (ok) changed += 1;
    }
    return { changed };
  };

  const reconcileCampaigns = async () => {
    const { rows } = await rawQuery(`SELECT campaign_id AS id, campaign_key AS "campaignKey" FROM billing.campaign`);
    for (const c of rows) await reconcileCampaignSold(c);
    return { changed: 0 };
  };

  const dailyExpire = async () => {
    const a = await sweep();
    const b = await reconcileCampaigns();
    return { changed: a.changed + b.changed };
  };

  return Object.freeze({ sweep, renewals, retryPastDue, trialEnding, reconcileCampaigns, dailyExpire, renewOne });
};
