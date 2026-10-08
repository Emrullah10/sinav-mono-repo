import datasources from 'app-datasource';
import { rawQuery } from 'app-shared';
import {
  toNum, round2, iso, upper, addMonths, dayAfterIstanbul, dateOnly, todayIstanbul, DAY_MS, DEFAULT_EXAM_MONTHS, VAT_RATE,
} from './helpers.js';

export const redis = () => datasources.coreAppRedis?.client;

const PRICE_SELECT = `
  SELECT pr.price_id AS id, pr.price_code AS code, pr.price_key AS "priceKey", pr.price_amount AS amount, pr.price_currency AS currency,
         pr.price_interval AS "interval", pr.price_interval_count AS "intervalCount", pr.price_period_end_rule AS "periodEndRule",
         pr.price_max_installments AS "maxInstallments", pr.price_is_active AS "isActive", pr.price_valid_from AS "validFrom", pr.price_valid_to AS "validTo",
         pr.price_campaign_id AS "campaignId", pr.price_metadata AS metadata,
         p.product_id AS "productId", p.product_key AS "productKey", p.product_name AS "productName", p.product_kind AS kind,
         p.product_status AS "productStatus", p.product_trial_days AS "trialDays", p.product_is_public AS "productIsPublic"
    FROM billing.price pr JOIN billing.product p ON p.product_id = pr.price_product_id`;

const normPrice = (r) => (r ? { ...r, amount: toNum(r.amount), intervalCount: Number(r.intervalCount), maxInstallments: Number(r.maxInstallments), trialDays: Number(r.trialDays) } : null);
export const loadPriceByKey = async (key, run = rawQuery) => normPrice((await run(`${PRICE_SELECT} WHERE pr.price_key = $1`, [String(key || '')])).rows[0]);
export const loadPriceById = async (id, run = rawQuery) => normPrice((await run(`${PRICE_SELECT} WHERE pr.price_id = $1`, [id])).rows[0]);

export const loadCampaignById = async (id, run = rawQuery) =>
  (await run(
    `SELECT campaign_id AS id, campaign_code AS code, campaign_key AS "campaignKey", campaign_name AS name, campaign_kind AS kind, campaign_status AS status,
            campaign_capacity AS capacity, campaign_starts_at AS "startsAt", campaign_ends_at AS "endsAt", campaign_launch_date AS "launchDate", campaign_terms_md AS "termsMd"
       FROM billing.campaign WHERE campaign_id = $1`, [id])).rows[0] || null;

export const campaignOpen = (c, now = new Date()) =>
  !!c && c.status === 'active' && (!c.startsAt || new Date(c.startsAt) <= now) && (!c.endsAt || new Date(c.endsAt) > now);

export const priceWindowOpen = (p, now = new Date()) =>
  p.isActive && new Date(p.validFrom) <= now && (!p.validTo || new Date(p.validTo) > now);

// ── Redis 20: billing:campaign:{key}:sold  (eksikse Postgres COUNT) ──
const soldKey = (campaignKey) => `billing:campaign:${campaignKey}:sold`;
export const countSoldDb = async (campaignId, run = rawQuery) =>
  Number((await run(`SELECT count(*)::int AS n FROM billing.payment WHERE payment_campaign_id = $1 AND payment_status = 'succeeded'`, [campaignId])).rows[0].n);
export const getCampaignSold = async (campaign) => {
  const r = redis();
  try {
    const v = r ? await r.get(soldKey(campaign.campaignKey)) : null;
    if (v !== null && v !== undefined) return Math.max(0, Number(v) || 0);
  } catch { /* Postgres */ }
  const n = await countSoldDb(campaign.id);
  try { if (r) await r.set(soldKey(campaign.campaignKey), String(n), 'NX'); } catch { /* best-effort */ }
  return n;
};
export const bumpCampaignSold = async (campaign, delta) => {
  const r = redis();
  if (!r) return;
  try {
    if (await r.exists(soldKey(campaign.campaignKey))) await r.incrby(soldKey(campaign.campaignKey), delta);
    else await r.set(soldKey(campaign.campaignKey), String(await countSoldDb(campaign.id)), 'NX');
  } catch { /* reconcile işi düzeltir */ }
};
export const reconcileCampaignSold = async (campaign) => {
  const n = await countSoldDb(campaign.id);
  try { await redis()?.set(soldKey(campaign.campaignKey), String(n)); } catch { /* best-effort */ }
  return n;
};

// ── Sınav oturumu: kullanıcının kayıtlı oturumu ya da en yakın gelecek oturum ──
const EXAM_SQL = `SELECT s.exam_session_id AS id, s.exam_session_key AS key, s.exam_session_exam_date AS "examDate", s.exam_session_exam_id AS "examId"
  FROM content.exam_session s`;
export const nextExamSession = async ({ userId = null, now = new Date(), run = rawQuery } = {}) => {
  const today = todayIstanbul(now);
  if (userId) {
    const own = (await run(
      `SELECT s.exam_session_id AS id, s.exam_session_key AS key, s.exam_session_exam_date AS "examDate", s.exam_session_exam_id AS "examId"
         FROM learning.enrollment e JOIN content.exam_session s ON s.exam_session_id = e.enrollment_exam_session_id
        WHERE e.enrollment_user_account_id = $1 AND e.enrollment_is_active AND s.exam_session_status <> 'cancelled' AND s.exam_session_exam_date >= $2::date
        ORDER BY s.exam_session_exam_date LIMIT 1`, [Number(userId), today])).rows[0];
    if (own) return { ...own, examDate: dateOnly(own.examDate) };
  }
  const g = (await run(`${EXAM_SQL} WHERE s.exam_session_status <> 'cancelled' AND s.exam_session_exam_date >= $1::date ORDER BY s.exam_session_exam_date LIMIT 1`, [today])).rows[0];
  return g ? { ...g, examDate: dateOnly(g.examDate) } : null;
};

export const monthsUntilExam = (exam, now = new Date()) => {
  if (!exam) return DEFAULT_EXAM_MONTHS;
  const days = (dayAfterIstanbul(exam.examDate).getTime() - now.getTime()) / DAY_MS;
  return Math.max(1, Math.round(days / 30.4375));
};

/** Dönem sonu: interval kuralı ya da sınav günü +1 gün (Istanbul 00:00). */
export const computePeriod = (price, start, exam) => {
  if (price.periodEndRule === 'next_exam_session') {
    if (exam) return { start, end: dayAfterIstanbul(exam.examDate), examSessionId: exam.id };
    return { start, end: addMonths(start, DEFAULT_EXAM_MONTHS), examSessionId: null };
  }
  const n = price.intervalCount || 1;
  if (price.interval === 'year') return { start, end: addMonths(start, 12 * n), examSessionId: null };
  if (price.interval === 'month') return { start, end: addMonths(start, n), examSessionId: null };
  return { start, end: addMonths(start, 12), examSessionId: null };
};

export const monthlyEquivalent = (price, exam, now = new Date()) => {
  if (!(price.amount > 0)) return price.amount === 0 ? 0 : null;
  if (price.periodEndRule === 'next_exam_session') return Math.round(price.amount / monthsUntilExam(exam, now));
  if (price.interval === 'year') return Math.round(price.amount / (12 * (price.intervalCount || 1)));
  if (price.interval === 'month') return Math.round(price.amount / (price.intervalCount || 1));
  return null;
};

// ── KDV: tutarlar KDV dahil ──
export const splitVat = (total) => {
  const net = round2(total / (1 + VAT_RATE()));
  return { subtotal: net, tax: round2(total - net), total: round2(total) };
};

// ── Kupon ──
const COUPON_SQL = `SELECT coupon_id AS id, coupon_code AS code, coupon_key AS key, coupon_discount_type AS "discountType", coupon_discount_value AS "discountValue",
  coupon_currency AS currency, coupon_status AS status, coupon_valid_from AS "validFrom", coupon_valid_to AS "validTo", coupon_max_redemptions AS "maxRedemptions",
  coupon_per_user_limit AS "perUserLimit" FROM billing.coupon WHERE coupon_key = $1`;

export const evaluateCoupon = async ({ couponKey, price, userId, now = new Date(), run = rawQuery }) => {
  const key = upper(couponKey);
  const c = (await run(COUPON_SQL, [key])).rows[0];
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.status !== 'active') return { ok: false, reason: 'inactive' };
  if (c.validFrom && new Date(c.validFrom) > now) return { ok: false, reason: 'not_started' };
  if (c.validTo && new Date(c.validTo) <= now) return { ok: false, reason: 'expired' };
  const restr = (await run(`SELECT count(*)::int AS n, count(*) FILTER (WHERE coupon_product_product_id = $2)::int AS hit FROM billing.coupon_product WHERE coupon_product_coupon_id = $1`, [c.id, price.productId])).rows[0];
  if (restr.n > 0 && restr.hit === 0) return { ok: false, reason: 'not_applicable' };
  if (c.discountType === 'amount' && c.currency && c.currency !== price.currency) return { ok: false, reason: 'currency_mismatch' };
  if (c.maxRedemptions) {
    const used = Number((await run(`SELECT count(*)::int AS n FROM billing.coupon_redemption WHERE coupon_redemption_coupon_id = $1`, [c.id])).rows[0].n);
    if (used >= c.maxRedemptions) return { ok: false, reason: 'limit_reached' };
  }
  if (userId) {
    const mine = Number((await run(`SELECT count(*)::int AS n FROM billing.coupon_redemption WHERE coupon_redemption_coupon_id = $1 AND coupon_redemption_user_account_id = $2`, [c.id, Number(userId)])).rows[0].n);
    if (mine >= c.perUserLimit) return { ok: false, reason: 'already_used' };
  }
  const value = toNum(c.discountValue);
  const discount = c.discountType === 'percent' ? round2((price.amount * value) / 100) : Math.min(price.amount, round2(value));
  return { ok: true, coupon: { id: c.id, key: c.key, discountType: c.discountType, discountValue: value }, discount: Math.min(price.amount, discount) };
};

export const priceDto = (p, { exam = null, now = new Date(), campaign = null } = {}) => ({
  priceKey: p.priceKey,
  amount: p.amount,
  currency: p.currency,
  interval: p.interval,
  intervalCount: p.intervalCount,
  periodEndRule: p.periodEndRule,
  maxInstallments: p.maxInstallments,
  monthlyEquivalent: monthlyEquivalent(p, exam, now),
  periodMonths: p.periodEndRule === 'next_exam_session' ? monthsUntilExam(exam, now) : p.interval === 'year' ? 12 * p.intervalCount : p.interval === 'month' ? p.intervalCount : null,
  periodEndsAt: p.periodEndRule === 'next_exam_session' && exam ? iso(dayAfterIstanbul(exam.examDate)) : null,
  campaign,
});
