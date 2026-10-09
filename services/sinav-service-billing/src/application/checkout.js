import { DomainError, withTransaction, writeAudit, invalidateEntitlements } from 'app-shared';
import {
  toNum, iso, round2, upper, randId, findUser, systemCaller, notifyUser, publicAppUrl, publicApiUrl, fmtDateTr, LIVE_STATUSES, addDays,
} from '../shared/helpers.js';
import {
  loadPriceByKey, loadPriceById, loadCampaignById, campaignOpen, priceWindowOpen, getCampaignSold, bumpCampaignSold, evaluateCoupon, splitVat,
  nextExamSession, computePeriod, redis,
} from '../shared/pricing.js';
import { lockLiveSubscription, writeSubscription, insertInvoice, currentLegalDocs } from '../shared/ledger.js';
import { normalizeProfile, loadProfile, saveProfile, snapshotOf } from './profile.js';
import { renderThreeDsPage } from '../ports/payment-fake.js';

const lockKey = (uid) => `billing:checkout:lock:${uid}`;
const PAY_SQL = `SELECT p.payment_id AS id, p.payment_code AS code, p.payment_user_account_id AS "userId", p.payment_status AS status, p.payment_provider AS provider,
  p.payment_price_id AS "priceId", p.payment_campaign_id AS "campaignId", p.payment_coupon_id AS "couponId", p.payment_subscription_id AS "subscriptionId",
  p.payment_amount AS amount, p.payment_discount_amount AS discount, p.payment_tax_amount AS tax, p.payment_currency AS currency, p.payment_installment_count AS installments,
  p.payment_provider_payment_id AS "providerPaymentId", p.payment_action_url AS "actionUrl", p.payment_failure_code AS "failureCode", p.payment_failure_reason_key AS "failureReasonKey",
  p.payment_paid_at AS "paidAt", p.payment_created_at AS "createdAt", p.payment_metadata AS metadata, p.payment_billing_snapshot AS snapshot,
  p.payment_pre_info_document_id AS "preInfoId", p.payment_distance_sales_document_id AS "distanceSalesId", p.payment_consents_accepted_at AS "consentsAt"
  FROM billing.payment p`;

export const makeCheckout = ({ rawQuery, nowFn, provider }) => {
  const loadPayment = async (code, run = rawQuery) => {
    const p = (await run(`${PAY_SQL} WHERE p.payment_code = $1`, [Number(code) || 0])).rows[0];
    return p ? { ...p, amount: toNum(p.amount), discount: toNum(p.discount), tax: toNum(p.tax), installments: Number(p.installments) } : null;
  };

  const releaseLock = async (uid) => { try { await redis()?.del(lockKey(uid)); } catch { /* TTL 2 dk */ } };

  const paymentState = async (p) => {
    const price = await loadPriceById(p.priceId, rawQuery);
    const inv = (await rawQuery(`SELECT invoice_code AS code, invoice_status AS status FROM billing.invoice WHERE invoice_payment_id = $1`, [p.id])).rows[0];
    const sub = p.subscriptionId ? (await rawQuery(`SELECT subscription_code AS code, subscription_status AS status, subscription_current_period_end AS "periodEnd", subscription_trial_ends_at AS "trialEndsAt" FROM billing.subscription WHERE subscription_id=$1`, [p.subscriptionId])).rows[0] : null;
    return {
      paymentCode: String(p.code), status: p.status, amount: p.amount, discountAmount: p.discount, taxAmount: p.tax, currency: p.currency, installmentCount: p.installments,
      planName: price?.productName || null, productKey: price?.productKey || null, priceKey: price?.priceKey || null,
      actionUrl: p.status === 'requires_action' ? p.actionUrl : null,
      failureCode: p.failureCode, failureReasonKey: p.failureReasonKey,
      paidAt: iso(p.paidAt), createdAt: iso(p.createdAt),
      card: p.metadata?.card ? { brand: p.metadata.card.brand, last4: p.metadata.card.last4 } : null,
      invoice: inv ? { code: String(inv.code), status: inv.status } : null,
      subscription: sub ? { code: String(sub.code), status: sub.status, validUntil: iso(sub.periodEnd), trialEndsAt: iso(sub.trialEndsAt) } : null,
    };
  };

  // ── Başarı / başarısızlık sonlandırma (callback + sıfır tutarlı ödeme) ──
  const completeSuccess = async ({ payment, token = null, card = null }) => {
    const user = await findUser(payment.userId, rawQuery);
    const now = nowFn();
    const price = await loadPriceById(payment.priceId, rawQuery);
    const exam = price.periodEndRule === 'next_exam_session' ? await nextExamSession({ userId: payment.userId, now, run: rawQuery }) : null;
    const saveCard = !!payment.metadata?.saveCard && !!token && !!card;
    const res = await withTransaction(async (tx) => {
      const upd = await tx.query(
        `UPDATE billing.payment SET payment_status='succeeded', payment_paid_at=$2, payment_metadata = payment_metadata - 'token' WHERE payment_id=$1 AND payment_status IN ('requires_action','pending') RETURNING payment_id`,
        [payment.id, now]);
      if (!upd.rows.length) return { already: true };
      let pmId = null;
      if (saveCard) {
        await tx.query(`UPDATE billing.payment_method SET payment_method_is_default=false WHERE payment_method_user_account_id=$1 AND payment_method_is_default`, [user.id]);
        const pm = await tx.query(
          `INSERT INTO billing.payment_method (payment_method_tenant_code, payment_method_organization_id, payment_method_user_account_id, payment_method_provider, payment_method_provider_token,
              payment_method_card_brand, payment_method_card_last4, payment_method_exp_month, payment_method_exp_year, payment_method_holder_name, payment_method_is_default, payment_method_created_by, payment_method_updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$3,$3) RETURNING payment_method_id AS id`,
          [user.tenantCode, user.orgId, user.id, payment.provider, token, card.brand, card.last4, card.expMonth, card.expYear, card.holder]);
        pmId = pm.rows[0].id;
      }
      const existing = await lockLiveSubscription(tx, user.id);
      const period = computePeriod(price, now, exam);
      const sub = await writeSubscription(tx, {
        user, price, period, status: 'active', source: 'subscription', existing, paymentMethodId: pmId,
        lockedAmount: price.campaignId ? price.amount : null, now,
        metadataPatch: { lastPaymentCode: String(payment.code), consents: { preInfoDocumentId: payment.preInfoId, distanceSalesDocumentId: payment.distanceSalesId, acceptedAt: iso(payment.consentsAt) } },
      });
      await tx.query(`UPDATE billing.payment SET payment_subscription_id=$2, payment_payment_method_id=$3 WHERE payment_id=$1`, [payment.id, sub.id, pmId]);
      const invoiceCode = await insertInvoice(tx, { user, paymentId: payment.id, total: payment.amount, snapshot: payment.snapshot?.billing || payment.snapshot, currency: payment.currency });
      if (payment.couponId) {
        await tx.query(`INSERT INTO billing.coupon_redemption (coupon_redemption_tenant_code, coupon_redemption_organization_id, coupon_redemption_coupon_id, coupon_redemption_payment_id, coupon_redemption_user_account_id)
                        VALUES ($1,$2,$3,$4,$5)`, [user.tenantCode, user.orgId, payment.couponId, payment.id, user.id]);
      }
      return { subscriptionCode: sub.code, invoiceCode, validUntil: period.end };
    });
    if (res.already) return res;
    await invalidateEntitlements(user.id);
    await releaseLock(user.id);
    if (payment.campaignId) { const c = await loadCampaignById(payment.campaignId, rawQuery); if (c) await bumpCampaignSold(c, 1); }
    await writeAudit({ caller: systemCaller(user), action: 'billing.payment.succeeded', schema: 'billing', table: 'payment', entityCode: Number(payment.code),
      after: { amount: payment.amount, priceKey: price.priceKey, subscription: String(res.subscriptionCode) } });
    await notifyUser({
      userId: user.id, kind: 'payment_receipt', title: 'Ödemen alındı', body: `${price.productName} · ${payment.amount} TL`, deepLink: '/ben/abonelik',
      payload: { planName: price.productName, amount: payment.amount, validUntil: fmtDateTr(res.validUntil), paymentCode: String(payment.code) }, dedupeKey: `payment_receipt:${payment.code}`,
    });
    return res;
  };

  const completeFailure = async ({ payment, failureCode, failureReasonKey }) => {
    const upd = await rawQuery(
      `UPDATE billing.payment SET payment_status='failed', payment_failure_code=$2, payment_failure_reason_key=$3, payment_metadata = payment_metadata - 'token'
        WHERE payment_id=$1 AND payment_status IN ('requires_action','pending') RETURNING payment_id`, [payment.id, failureCode, failureReasonKey]);
    if (!upd.rows.length) return { already: true };
    await releaseLock(payment.userId);
    const user = await findUser(payment.userId, rawQuery);
    await writeAudit({ caller: systemCaller(user), action: 'billing.payment.failed', schema: 'billing', table: 'payment', entityCode: Number(payment.code), after: { failureCode } });
    await notifyUser({
      userId: payment.userId, kind: 'payment_failed', title: 'Ödemen alınamadı', body: 'Ödeme tamamlanmadı. Tekrar deneyebilir ya da başka kart kullanabilirsin.', deepLink: `/odeme/sonuc?payment=${payment.code}`,
      payload: { paymentCode: String(payment.code), failureReasonKey }, dedupeKey: `payment_failed:${payment.code}`, channels: ['in_app'],
    });
    return { failed: true };
  };

  // ── POST /checkout ──
  const startTrial = async ({ user, price, body, caller, consents }) => {
    if (!(price.trialDays > 0) || price.kind !== 'subscription') throw new DomainError('BILLING_TRIAL_NOT_AVAILABLE', 'Product has no trial');
    const used = (await rawQuery(
      `SELECT EXISTS (SELECT 1 FROM billing.subscription WHERE subscription_user_account_id=$1 AND subscription_trial_ends_at IS NOT NULL)
           OR EXISTS (SELECT 1 FROM billing.entitlement_grant WHERE entitlement_grant_user_account_id=$1 AND entitlement_grant_source='trial') AS used`, [user.id])).rows[0].used;
    if (used) throw new DomainError('BILLING_TRIAL_ALREADY_USED', 'Trial already used');
    const now = nowFn();
    const trialEnds = addDays(now, price.trialDays);
    let tok = null;
    if (body.card && typeof provider.tokenizeCard === 'function') tok = await provider.tokenizeCard(body.card);
    const res = await withTransaction(async (tx) => {
      const live = await lockLiveSubscription(tx, user.id);
      if (live) throw new DomainError('BILLING_SUBSCRIPTION_ALREADY_ACTIVE', 'Subscription already exists', { status: live.status });
      let pmId = null;
      if (tok) {
        const pm = await tx.query(
          `INSERT INTO billing.payment_method (payment_method_tenant_code, payment_method_organization_id, payment_method_user_account_id, payment_method_provider, payment_method_provider_token,
              payment_method_card_brand, payment_method_card_last4, payment_method_exp_month, payment_method_exp_year, payment_method_holder_name, payment_method_is_default, payment_method_created_by, payment_method_updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$3,$3) RETURNING payment_method_id AS id`,
          [user.tenantCode, user.orgId, user.id, provider.name, tok.token, tok.card.brand, tok.card.last4, tok.card.expMonth, tok.card.expYear, tok.card.holder]);
        pmId = pm.rows[0].id;
      }
      return writeSubscription(tx, {
        user, price, period: { start: now, end: trialEnds, examSessionId: null }, status: 'trialing', source: 'trial', trialEndsAt: trialEnds, paymentMethodId: pmId, now,
        metadataPatch: { trial: true, consents: { preInfoDocumentId: consents.preInfoId, distanceSalesDocumentId: consents.distanceSalesId, acceptedAt: iso(now) } },
      });
    });
    await invalidateEntitlements(user.id);
    await writeAudit({ caller, action: 'billing.trial.start', schema: 'billing', table: 'subscription', entityCode: Number(res.code), after: { priceKey: price.priceKey, trialEndsAt: iso(trialEnds) } });
    return { paymentCode: null, status: 'trialing', actionUrl: null, subscriptionCode: String(res.code), trialEndsAt: iso(trialEnds), hasPaymentMethod: !!tok };
  };

  const checkout = async ({ caller, body = {}, headers = {}, allowReplace = false }) => {
    const uid = Number(caller.callerUserId);
    const user = await findUser(uid, rawQuery);
    if (!user) throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found');
    if (user.status === 'guest') throw new DomainError('ACCOUNT_GUEST_FORBIDDEN', 'Guest cannot purchase', null, 403);
    if (!body.priceKey) throw new DomainError('BILLING_PRICE_REQUIRED', 'priceKey required');
    const price = await loadPriceByKey(body.priceKey, rawQuery);
    const now = nowFn();
    if (!price || price.productStatus !== 'active' || !priceWindowOpen(price, now)) throw new DomainError('PRICE_NOT_FOUND', 'Price not found');
    if (price.metadata?.offerOnly) {
      const ok = await redis()?.get(`billing:offer:${uid}:${price.priceKey}`).catch(() => null);
      if (!ok) throw new DomainError('PRICE_NOT_FOUND', 'Price not found');
    }
    let campaign = null;
    if (price.campaignId) {
      campaign = await loadCampaignById(price.campaignId, rawQuery);
      if (!campaignOpen(campaign, now)) throw new DomainError('CAMPAIGN_CLOSED', 'Campaign is closed', null, 409);
      if (campaign.capacity && (await getCampaignSold(campaign)) >= campaign.capacity) throw new DomainError('CAMPAIGN_SOLD_OUT', 'Campaign sold out', null, 409);
    }

    if (body.acceptPreInfo !== true || body.acceptDistanceSales !== true) throw new DomainError('BILLING_CONSENT_REQUIRED', 'Pre-information and distance sales consents required');
    const docs = await currentLegalDocs(rawQuery, user.locale || 'tr');
    if (!docs.preInfoId || !docs.distanceSalesId) throw new DomainError('BILLING_LEGAL_NOT_CONFIGURED', 'Legal documents are not published');

    const rawKey = headers['idempotency-key'] || body.idempotencyKey;
    const idemKey = rawKey ? `u${uid}:${String(rawKey).slice(0, 60)}` : `auto:${uid}:${randId(10)}`;
    if (rawKey) {
      const dup = (await rawQuery(`${PAY_SQL} WHERE p.payment_idempotency_key = $1`, [idemKey])).rows[0];
      if (dup) return { ...(await paymentState({ ...dup, amount: toNum(dup.amount), discount: toNum(dup.discount), tax: toNum(dup.tax), installments: Number(dup.installments) })), replayed: true };
    }

    const r = redis();
    if (r) {
      const got = await r.set(lockKey(uid), idemKey, 'EX', 120, 'NX').catch(() => 'OK');
      if (!got) {
        const pend = (await rawQuery(`${PAY_SQL} WHERE p.payment_user_account_id=$1 AND p.payment_status='requires_action' ORDER BY p.payment_id DESC LIMIT 1`, [uid])).rows[0];
        throw new DomainError('BILLING_CHECKOUT_IN_PROGRESS', 'Another checkout is in progress', pend ? { paymentCode: String(pend.code), actionUrl: pend.actionUrl } : null, 409);
      }
    }
    try {
      if (body.startTrial) return await startTrial({ user, price, body, caller, consents: docs }).finally(() => releaseLock(uid));

      const live = (await rawQuery(
        `SELECT subscription_status AS status, subscription_cancel_at_period_end AS "cancelAtPeriodEnd", subscription_channel AS channel FROM billing.subscription
          WHERE subscription_user_account_id=$1 AND subscription_status = ANY($2::varchar[])`, [uid, LIVE_STATUSES])).rows[0];
      if (live && !(live.status === 'trialing' || live.cancelAtPeriodEnd || allowReplace)) {
        throw new DomainError('BILLING_SUBSCRIPTION_ALREADY_ACTIVE', 'You already have a subscription', { status: live.status, channel: live.channel });
      }
      if (live && live.channel !== 'web') throw new DomainError('BILLING_SUBSCRIPTION_ALREADY_ACTIVE', 'Subscription is managed by the store', { status: live.status, channel: live.channel });

      // Fatura profili: gövdeden (kaydedilir) ya da kayıtlıdan
      const saved = await loadProfile(rawQuery, uid);
      if (!body.billingProfile && !saved) throw new DomainError('BILLING_PROFILE_REQUIRED', 'Billing profile required');
      const profile = body.billingProfile ? normalizeProfile(body.billingProfile, saved) : normalizeProfile(saved, saved);

      let discount = 0; let couponId = null;
      if (body.couponCode) {
        const ev = await evaluateCoupon({ couponKey: body.couponCode, price, userId: uid, now });
        if (!ev.ok) throw new DomainError('BILLING_COUPON_INVALID', 'Coupon is not valid', { reason: ev.reason });
        discount = ev.discount; couponId = ev.coupon.id;
      }
      const total = round2(price.amount - discount);
      const vat = splitVat(total);
      let installments = Number(body.installmentCount || 1);
      if (!Number.isInteger(installments) || installments < 1 || installments > price.maxInstallments) throw new DomainError('BILLING_INSTALLMENT_INVALID', 'Installment count not allowed', { max: price.maxInstallments });
      if (total <= 0) installments = 1;

      const snapshot = { billing: snapshotOf(profile), priceKey: price.priceKey, listAmount: price.amount, coupon: body.couponCode ? upper(body.couponCode) : null };
      const payment = await withTransaction(async (tx) => {
        if (body.billingProfile) await saveProfile(tx, { caller, userId: uid, data: profile });
        const ins = await tx.query(
          `INSERT INTO billing.payment (payment_tenant_code, payment_organization_id, payment_user_account_id, payment_price_id, payment_campaign_id, payment_coupon_id, payment_provider, payment_status,
              payment_amount, payment_discount_amount, payment_tax_amount, payment_currency, payment_installment_count, payment_idempotency_key, payment_pre_info_document_id,
              payment_distance_sales_document_id, payment_consents_accepted_at, payment_billing_snapshot, payment_metadata, payment_created_by, payment_updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$3,$3) RETURNING payment_id AS id, payment_code AS code`,
          [user.tenantCode, user.orgId, uid, price.id, price.campaignId, couponId, provider.name, total, discount, vat.tax, price.currency, installments, idemKey, docs.preInfoId, docs.distanceSalesId,
            now, JSON.stringify(snapshot), JSON.stringify({ saveCard: body.saveCard === undefined ? price.kind === 'subscription' : !!body.saveCard })]);
        return ins.rows[0];
      });
      const full = await loadPayment(payment.code, rawQuery);

      if (total <= 0) {
        await completeSuccess({ payment: full });
        return paymentState(await loadPayment(payment.code, rawQuery));
      }
      let intent;
      try {
        intent = await provider.createPayment({
          paymentCode: payment.code, amount: total, currency: price.currency, installmentCount: installments, card: body.card,
          buyer: { id: uid, email: user.email, name: profile.fullName }, returnUrl: `${publicAppUrl()}/odeme/sonuc?payment=${payment.code}`,
        });
      } catch (e) {
        await rawQuery(`UPDATE billing.payment SET payment_status='failed', payment_failure_code=$2, payment_failure_reason_key='billing.failure.generic' WHERE payment_id=$1`, [payment.id, String(e.code || 'provider_error').slice(0, 60)]);
        throw e;
      }
      await rawQuery(
        `UPDATE billing.payment SET payment_status='requires_action', payment_provider_payment_id=$2, payment_action_url=$3, payment_metadata = payment_metadata || $4::jsonb WHERE payment_id=$1`,
        [payment.id, intent.providerPaymentId, intent.actionUrl, JSON.stringify({ card: intent.card || null, token: intent.token || null, allowReplace })]);
      await writeAudit({ caller, action: 'billing.checkout.start', schema: 'billing', table: 'payment', entityCode: Number(payment.code), after: { priceKey: price.priceKey, amount: total } });
      return { paymentCode: String(payment.code), status: 'requires_action', actionUrl: intent.actionUrl, amount: total, currency: price.currency };
    } catch (e) {
      await releaseLock(uid);
      throw e;
    }
  };

  const cancelPayment = async ({ caller, code }) => {
    const p = await loadPayment(code);
    if (!p || String(p.userId) !== String(caller.callerUserId)) throw new DomainError('PAYMENT_NOT_FOUND', 'Payment not found');
    const upd = await rawQuery(`UPDATE billing.payment SET payment_status='canceled', payment_metadata = payment_metadata - 'token' WHERE payment_id=$1 AND payment_status IN ('pending','requires_action') RETURNING payment_id`, [p.id]);
    if (!upd.rows.length) throw new DomainError('PAYMENT_NOT_PENDING', 'Payment is not pending');
    await releaseLock(p.userId);
    return paymentState(await loadPayment(code));
  };

  const getPayment = async ({ caller, code }) => {
    const p = await loadPayment(code);
    if (!p || String(p.userId) !== String(caller.callerUserId)) throw new DomainError('PAYMENT_NOT_FOUND', 'Payment not found');
    return paymentState(p);
  };

  // ── Sahte 3DS sayfası ve callback ──
  const requireFake = () => { if (provider.name !== 'fake') throw new DomainError('NOT_FOUND', 'Not found', null, 404); };

  const renderFake3ds = async ({ code, t, json }) => {
    requireFake();
    if (!provider.verifyPageToken?.(code, t)) throw new DomainError('BILLING_CALLBACK_SIGNATURE_INVALID', 'Invalid link', null, 403);
    const p = await loadPayment(code);
    if (!p) throw new DomainError('PAYMENT_NOT_FOUND', 'Payment not found');
    if (p.status !== 'requires_action') return { redirectTo: `${publicAppUrl()}/odeme/sonuc?payment=${p.code}` };
    const price = await loadPriceById(p.priceId, rawQuery);
    return { html: renderThreeDsPage({ provider, payment: { code: p.code, amount: p.amount }, planName: price?.productName || '', apiBase: publicApiUrl(), json }) };
  };

  const handleCallback = async ({ code, body = {}, query = {} }) => {
    const p = await loadPayment(code);
    if (!p) throw new DomainError('PAYMENT_NOT_FOUND', 'Payment not found');
    const event = { decision: body.decision, sig: body.sig };
    if (!provider.verifyEvent({ paymentCode: p.code, event })) throw new DomainError('BILLING_CALLBACK_SIGNATURE_INVALID', 'Invalid callback signature', null, 403);
    const json = query.json === '1' || body.json === '1' || body.json === true;
    const ev = await rawQuery(
      `INSERT INTO billing.provider_event (provider_event_tenant_code, provider_event_provider, provider_event_event_id, provider_event_event_type, provider_event_signature_valid, provider_event_payload, provider_event_payment_id)
       SELECT payment_tenant_code, $2, $3, $4, true, $5::jsonb, payment_id FROM billing.payment WHERE payment_id=$1
       ON CONFLICT (provider_event_provider, provider_event_event_id) DO NOTHING RETURNING provider_event_id AS id`,
      [p.id, provider.name, `${p.code}:${event.decision}`, `3ds.${event.decision}`, JSON.stringify({ decision: event.decision })]);
    let error = null;
    if (ev.rows.length) {
      try {
        const out = await provider.retrieve({ providerPaymentId: p.providerPaymentId, paymentCode: p.code, event, context: p.metadata });
        if (out.status === 'succeeded') await completeSuccess({ payment: p, token: out.token || p.metadata?.token, card: out.card || p.metadata?.card });
        else await completeFailure({ payment: p, failureCode: out.failureCode || 'generic', failureReasonKey: out.failureReasonKey || 'billing.failure.generic' });
        await rawQuery(`UPDATE billing.provider_event SET provider_event_status='processed', provider_event_processed_at=now() WHERE provider_event_id=$1`, [ev.rows[0].id]);
      } catch (e) {
        error = e;
        await rawQuery(`UPDATE billing.provider_event SET provider_event_status='failed', provider_event_error=$2 WHERE provider_event_id=$1`, [ev.rows[0].id, String(e.message).slice(0, 500)]);
      }
    }
    if (error) throw error;
    const state = await paymentState(await loadPayment(code));
    return json ? { json: state } : { redirectTo: `${publicAppUrl()}/odeme/sonuc?payment=${p.code}` };
  };

  /** Süresi geçen (30 dk) bekleyen ödemeleri kapatır — sweep işi. */
  const expireStalePayments = async () => {
    const { rows } = await rawQuery(
      `UPDATE billing.payment SET payment_status='canceled', payment_failure_code='timeout', payment_failure_reason_key='billing.failure.timeout', payment_metadata = payment_metadata - 'token'
        WHERE payment_status IN ('pending','requires_action') AND payment_created_at < now() - interval '30 minutes' RETURNING payment_id`);
    return { changed: rows.length };
  };

  return Object.freeze({ checkout, cancelPayment, getPayment, renderFake3ds, handleCallback, expireStalePayments, completeSuccess, completeFailure });
};
