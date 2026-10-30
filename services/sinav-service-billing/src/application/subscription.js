import { DomainError, withTransaction, writeAudit, invalidateEntitlements, getEntitlements } from 'app-shared';
import { toNum, iso, fmtDateTr, notifyUser, findUser, LIVE_STATUSES, addDays, GRACE_DAYS, dateOnly, systemCaller } from '../shared/helpers.js';
import { monthlyEquivalent, nextExamSession, redis, loadPriceById } from '../shared/pricing.js';
import { insertGrant } from '../shared/ledger.js';

const CANCEL_REASONS = ['exam_done', 'too_expensive', 'not_using', 'content_insufficient', 'technical_issue', 'other'];
const STORE = { app_store: 'billing.store.manage_in_app_store', google_play: 'billing.store.manage_in_google_play' };

const SUB_SQL = `SELECT s.subscription_id AS id, s.subscription_code AS code, s.subscription_user_account_id AS "userId", s.subscription_status AS status, s.subscription_channel AS channel,
  s.subscription_current_period_start AS "periodStart", s.subscription_current_period_end AS "periodEnd", s.subscription_trial_ends_at AS "trialEndsAt",
  s.subscription_cancel_at_period_end AS "cancelAtPeriodEnd", s.subscription_canceled_at AS "canceledAt", s.subscription_cancel_reason AS "cancelReason",
  s.subscription_paused_until AS "pausedUntil", s.subscription_payment_method_id AS "paymentMethodId", s.subscription_renewal_attempts AS "renewalAttempts",
  s.subscription_locked_amount AS "lockedAmount", s.subscription_metadata AS metadata, s.subscription_price_id AS "priceId",
  p.product_key AS "productKey", p.product_name AS "planName", p.product_kind AS kind
  FROM billing.subscription s JOIN billing.product p ON p.product_id = s.subscription_product_id`;

export const makeSubscription = ({ rawQuery, nowFn, checkoutFn }) => {
  const loadSub = async (uid) =>
    (await rawQuery(`${SUB_SQL} WHERE s.subscription_user_account_id = $1 ORDER BY (s.subscription_status = ANY($2::varchar[])) DESC, s.subscription_id DESC LIMIT 1`, [uid, LIVE_STATUSES])).rows[0] || null;
  const loadLive = async (uid) => (await rawQuery(`${SUB_SQL} WHERE s.subscription_user_account_id = $1 AND s.subscription_status = ANY($2::varchar[])`, [uid, LIVE_STATUSES])).rows[0] || null;

  const getSubscription = async ({ caller }) => {
    const uid = Number(caller.callerUserId);
    const [s, ent, exam] = await Promise.all([loadSub(uid), getEntitlements(uid), nextExamSession({ userId: uid, now: nowFn(), run: rawQuery })]);
    if (!s) {
      return { tier: ent.tier, hasSubscription: false, status: 'none', plan: { productKey: ent.productKey, name: ent.productKey === 'free' ? 'Ücretsiz' : ent.productKey, kind: null }, subscription: null, paymentMethod: null, store: null, validUntil: ent.validUntil, nextExamDate: exam?.examDate || null };
    }
    const price = await loadPriceById(s.priceId, rawQuery);
    const live = LIVE_STATUSES.includes(s.status);
    const amount = s.lockedAmount !== null ? toNum(s.lockedAmount) : price.amount;
    const pm = s.paymentMethodId ? (await rawQuery(
      `SELECT payment_method_code AS code, payment_method_card_brand AS brand, payment_method_card_last4 AS last4, payment_method_exp_month AS "expMonth", payment_method_exp_year AS "expYear"
         FROM billing.payment_method WHERE payment_method_id = $1 AND payment_method_status = 'active'`, [s.paymentMethodId])).rows[0] : null;
    const isStore = !!STORE[s.channel];
    const willRenew = live && s.kind === 'subscription' && !s.cancelAtPeriodEnd && s.status !== 'paused' && (isStore || !!pm);
    const graceEndsAt = s.status === 'past_due' ? addDays(s.periodEnd, GRACE_DAYS) : null;
    return {
      tier: ent.tier, hasSubscription: live, status: s.status,
      plan: { productKey: s.productKey, name: s.planName, kind: s.kind, priceKey: price.priceKey, amount, currency: price.currency, interval: price.interval, intervalCount: price.intervalCount, periodEndRule: price.periodEndRule,
        monthlyEquivalent: monthlyEquivalent({ ...price, amount }, exam, nowFn()) },
      subscription: {
        code: String(s.code), status: s.status, channel: s.channel, currentPeriodStart: iso(s.periodStart), currentPeriodEnd: iso(s.periodEnd), trialEndsAt: s.status === 'trialing' ? iso(s.trialEndsAt) : null,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd, canceledAt: iso(s.canceledAt), cancelReason: s.cancelReason, pausedUntil: s.pausedUntil ? dateOnly(s.pausedUntil) : null,
        willRenew, renewalDate: willRenew ? iso(s.periodEnd) : null, renewalAmount: willRenew ? amount : null, renewalAttempts: s.renewalAttempts,
        graceEndsAt: iso(graceEndsAt), accessUntil: iso(graceEndsAt || s.periodEnd),
      },
      paymentMethod: pm ? { code: String(pm.code), brand: pm.brand, last4: pm.last4, expMonth: pm.expMonth, expYear: pm.expYear } : null,
      store: STORE[s.channel] ? { managed: true, channel: s.channel, noteKey: STORE[s.channel] } : { managed: false, channel: s.channel, noteKey: null },
      validUntil: ent.validUntil, nextExamDate: exam?.examDate || null,
    };
  };

  const assertReason = (reason) => {
    if (!CANCEL_REASONS.includes(reason)) throw new DomainError('BILLING_CANCEL_REASON_INVALID', 'Cancel reason invalid', { allowed: CANCEL_REASONS });
  };

  const priceBrief = async (priceId) => {
    if (!priceId) return null;
    const p = await loadPriceById(priceId, rawQuery);
    return p ? { priceKey: p.priceKey, amount: p.amount, currency: p.currency, interval: p.interval, intervalCount: p.intervalCount, monthlyEquivalent: monthlyEquivalent(p, null, nowFn()), productKey: p.productKey, productName: p.productName } : null;
  };

  const listCancelOffers = async ({ caller, reason }) => {
    assertReason(reason);
    const uid = Number(caller.callerUserId);
    const s = await loadLive(uid);
    const exam = await nextExamSession({ userId: uid, now: nowFn(), run: rawQuery });
    const { rows } = await rawQuery(
      `SELECT retention_offer_code AS code, retention_offer_kind AS kind, retention_offer_price_id AS "priceId", retention_offer_params AS params, retention_offer_title AS title, retention_offer_body AS body
         FROM billing.retention_offer WHERE retention_offer_cancel_reason = $1 AND retention_offer_is_active ORDER BY retention_offer_sort_order, retention_offer_id`, [reason]);
    const offers = [];
    for (const o of rows) {
      if (o.kind === 'pause_until_next_exam' && !exam) continue;
      offers.push({ offerKey: String(o.code), kind: o.kind, title: o.title, body: o.body, params: o.params || {}, price: await priceBrief(o.priceId), pauseUntil: o.kind === 'pause_until_next_exam' ? exam?.examDate || null : null });
    }
    return {
      reason, offers,
      cancelEffective: s ? { until: iso(s.periodEnd), cancelable: ['trialing', 'active', 'past_due'].includes(s.status) && s.channel === 'web', store: STORE[s.channel] ? { managed: true, channel: s.channel, noteKey: STORE[s.channel] } : null } : null,
    };
  };

  const cancelSubscription = async ({ caller, reason, note }) => {
    assertReason(reason);
    const uid = Number(caller.callerUserId);
    const s = await loadLive(uid);
    if (!s) throw new DomainError('SUBSCRIPTION_NOT_FOUND', 'No active subscription');
    if (s.channel !== 'web') throw new DomainError('BILLING_STORE_MANAGED', 'Manage this subscription in the store', { channel: s.channel, noteKey: STORE[s.channel] || null }, 409);
    if (s.cancelAtPeriodEnd) throw new DomainError('BILLING_SUBSCRIPTION_ALREADY_CANCELED', 'Subscription is already canceled', { until: iso(s.periodEnd) });
    const now = nowFn();
    const noteText = note ? String(note).slice(0, 1000) : null;
    let until = s.periodEnd;
    if (s.status === 'paused') {
      await withTransaction(async (tx) => {
        await tx.query(`UPDATE billing.subscription SET subscription_status='canceled', subscription_canceled_at=$2, subscription_cancel_reason=$3, subscription_cancel_note=$4, subscription_updated_by=$5 WHERE subscription_id=$1`, [s.id, now, reason, noteText, uid]);
      });
      until = now;
    } else {
      await rawQuery(`UPDATE billing.subscription SET subscription_cancel_at_period_end=true, subscription_canceled_at=$2, subscription_cancel_reason=$3, subscription_cancel_note=$4, subscription_updated_by=$5 WHERE subscription_id=$1 AND subscription_cancel_at_period_end=false`, [s.id, now, reason, noteText, uid]);
      if (s.status === 'past_due') until = addDays(s.periodEnd, GRACE_DAYS);
    }
    await invalidateEntitlements(uid);
    await writeAudit({ caller, action: 'billing.subscription.cancel', schema: 'billing', table: 'subscription', entityCode: Number(s.code), after: { reason, until: iso(until) } });
    const date = fmtDateTr(until);
    await notifyUser({ userId: uid, kind: 'subscription_canceled', title: 'Aboneliğin iptal edildi', body: `Premium ${date} tarihine kadar sürer.`, deepLink: '/ben/abonelik',
      payload: { until: date, planName: s.planName }, dedupeKey: `subscription_canceled:${s.code}:${now.getTime()}` });
    return { canceled: true, until: iso(until), subscription: (await getSubscription({ caller })).subscription };
  };

  const resumeFromPause = async (tx, s, now) => {
    const remaining = Math.max(0, Number(s.metadata?.pausedRemainingMs) || 0);
    const status = s.metadata?.pausedFromStatus === 'trialing' ? 'trialing' : 'active';
    const end = new Date(now.getTime() + remaining);
    const price = await loadPriceById(s.priceId, tx.query.bind(tx));
    const user = await findUser(s.userId, tx.query.bind(tx));
    await tx.query(
      `UPDATE billing.subscription SET subscription_status=$2, subscription_paused_until=NULL, subscription_current_period_start=$3, subscription_current_period_end=$4,
              subscription_trial_ends_at = CASE WHEN $2 = 'trialing' THEN $4 ELSE subscription_trial_ends_at END, subscription_metadata = subscription_metadata - 'pausedRemainingMs' - 'pausedFromStatus' - 'pausedAt'
        WHERE subscription_id=$1`, [s.id, status, now, end]);
    await insertGrant(tx, { user, productId: price.productId, source: status === 'trialing' ? 'trial' : 'subscription', subscriptionId: s.id, startsAt: now, endsAt: end });
    return end;
  };

  const resumeSubscription = async ({ caller }) => {
    const uid = Number(caller.callerUserId);
    const s = await loadLive(uid);
    if (!s) throw new DomainError('SUBSCRIPTION_NOT_FOUND', 'No active subscription');
    const now = nowFn();
    if (s.status === 'paused') {
      await withTransaction((tx) => resumeFromPause(tx, s, now));
    } else if (s.cancelAtPeriodEnd) {
      await rawQuery(`UPDATE billing.subscription SET subscription_cancel_at_period_end=false, subscription_canceled_at=NULL, subscription_cancel_reason=NULL, subscription_cancel_note=NULL, subscription_updated_by=$2 WHERE subscription_id=$1`, [s.id, uid]);
    } else {
      throw new DomainError('BILLING_NOTHING_TO_RESUME', 'Subscription is not canceled or paused');
    }
    await invalidateEntitlements(uid);
    await writeAudit({ caller, action: 'billing.subscription.resume', schema: 'billing', table: 'subscription', entityCode: Number(s.code) });
    return { resumed: true, subscription: (await getSubscription({ caller })).subscription };
  };

  const acceptOffer = async ({ caller, offerKey, body = {}, headers = {} }) => {
    const uid = Number(caller.callerUserId);
    const o = (await rawQuery(
      `SELECT retention_offer_code AS code, retention_offer_kind AS kind, retention_offer_price_id AS "priceId", retention_offer_params AS params, retention_offer_cancel_reason AS reason
         FROM billing.retention_offer WHERE retention_offer_code = $1 AND retention_offer_is_active`, [Number(offerKey) || 0])).rows[0];
    if (!o) throw new DomainError('OFFER_NOT_FOUND', 'Offer not found');
    const s = await loadLive(uid);
    if (!s) throw new DomainError('SUBSCRIPTION_NOT_FOUND', 'No active subscription');
    if (s.channel !== 'web') throw new DomainError('BILLING_STORE_MANAGED', 'Manage this subscription in the store', { channel: s.channel }, 409);
    const now = nowFn();

    if (o.kind === 'pause_until_next_exam') {
      if (!['active', 'trialing'].includes(s.status) || s.kind !== 'subscription') throw new DomainError('BILLING_OFFER_NOT_APPLICABLE', 'Offer is not applicable', { status: s.status });
      const exam = await nextExamSession({ userId: uid, now, run: rawQuery });
      if (!exam) throw new DomainError('BILLING_NO_UPCOMING_EXAM', 'No upcoming exam session to pause until');
      await withTransaction(async (tx) => {
        await tx.query(
          `UPDATE billing.subscription SET subscription_status='paused', subscription_paused_until=$2::date, subscription_cancel_at_period_end=false, subscription_canceled_at=NULL, subscription_cancel_reason=NULL,
                  subscription_cancel_note=NULL, subscription_metadata = subscription_metadata || $3::jsonb, subscription_updated_by=$4 WHERE subscription_id=$1`,
          [s.id, exam.examDate, JSON.stringify({ pausedRemainingMs: Math.max(0, new Date(s.periodEnd) - now), pausedFromStatus: s.status, pausedAt: iso(now) }), uid]);
        await tx.query(`UPDATE billing.entitlement_grant SET entitlement_grant_revoked_at=$2 WHERE entitlement_grant_subscription_id=$1 AND entitlement_grant_revoked_at IS NULL`, [s.id, now]);
      });
      await invalidateEntitlements(uid);
      await writeAudit({ caller, action: 'billing.subscription.pause', schema: 'billing', table: 'subscription', entityCode: Number(s.code), after: { pausedUntil: exam.examDate, offer: String(o.code) } });
      return { outcome: 'paused', pausedUntil: exam.examDate, subscription: (await getSubscription({ caller })).subscription };
    }

    if (o.kind === 'discounted_annual') {
      const price = await loadPriceById(o.priceId, rawQuery);
      if (!price) throw new DomainError('PRICE_NOT_FOUND', 'Offer price not found');
      try { await redis()?.set(`billing:offer:${uid}:${price.priceKey}`, String(o.code), 'EX', 3600); } catch { /* best-effort */ }
      if (body.acceptPreInfo === true && body.acceptDistanceSales === true) {
        const chk = await checkoutFn({ caller, body: { ...body, priceKey: price.priceKey, startTrial: false }, headers, allowReplace: true });
        return { outcome: 'checkout_created', checkout: chk };
      }
      return { outcome: 'checkout_required', priceKey: price.priceKey, price: await priceBrief(price.id), validForSeconds: 3600 };
    }

    // shorter_daily_plan: günlük plan tercihi öğrenme servisinde; billing yalnız iptali durdurur.
    if (s.cancelAtPeriodEnd) {
      await rawQuery(`UPDATE billing.subscription SET subscription_cancel_at_period_end=false, subscription_canceled_at=NULL, subscription_cancel_reason=NULL WHERE subscription_id=$1`, [s.id]);
      await invalidateEntitlements(uid);
    }
    await writeAudit({ caller, action: 'billing.offer.accept', schema: 'billing', table: 'retention_offer', entityCode: Number(o.code) });
    return { outcome: 'client_action', action: 'shorter_daily_plan', params: o.params || {} };
  };

  return Object.freeze({ getSubscription, listCancelOffers, cancelSubscription, resumeSubscription, acceptOffer, resumeFromPause, loadSub });
};
