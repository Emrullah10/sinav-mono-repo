import { DomainError, getEntitlements } from 'app-shared';
import { FEATURES, iso, toNum, findUser, LIVE_STATUSES } from '../shared/helpers.js';
import {
  nextExamSession, monthsUntilExam, priceDto, priceWindowOpen, campaignOpen, getCampaignSold, redis,
} from '../shared/pricing.js';
import { localDate } from 'app-shared';

const toCampaignDto = async (c) => {
  const sold = await getCampaignSold(c);
  const remaining = c.capacity ? Math.max(0, c.capacity - sold) : null;
  return {
    campaignKey: c.campaignKey, name: c.name, kind: c.kind, status: c.status, capacity: c.capacity, sold, remaining,
    soldOut: c.capacity ? sold >= c.capacity : false, launchDate: c.launchDate ? String(c.launchDate instanceof Date ? iso(c.launchDate).slice(0, 10) : c.launchDate).slice(0, 10) : null,
    startsAt: iso(c.startsAt), endsAt: iso(c.endsAt),
  };
};

// Redis 19'u OKUMA-ONLY okur (app-shared peekUsage eksik anahtarı billing süreci tohum fonksiyonu olmadan 0 ile
// kurardı ve learning/tutor'un Postgres tohumlamasını bozardı). Anahtar yoksa dönem sayısı 0 kabul edilir.
const readUsage = async (userId, feature, f, tz, now = new Date()) => {
  const period = f.period || 'day';
  const d = localDate(now, tz);
  const periodKey = period === 'month' ? d.slice(0, 7) : d;
  let used = 0;
  try {
    const v = await redis()?.get(`usage:${userId}:${feature}:${periodKey}`);
    used = Number(v) || 0;
  } catch { /* Redis yoksa 0 */ }
  return { enabled: !!f.enabled, limit: f.limit ?? null, period: f.limit === null || f.limit === undefined ? null : period, used, remaining: f.limit === null || f.limit === undefined ? null : Math.max(0, f.limit - used), periodKey };
};

export const makeCatalog = ({ rawQuery, nowFn }) => {
  const loadProducts = async ({ onlyPublic = true } = {}) => {
    const now = nowFn();
    const exam = await nextExamSession({ now, run: rawQuery });
    const { rows: prods } = await rawQuery(
      `SELECT product_id AS id, product_key AS "productKey", product_name AS name, product_description AS description, product_kind AS kind,
              product_trial_days AS "trialDays", product_badge_key AS "badgeKey", product_sort_order AS "sortOrder"
         FROM billing.product WHERE product_status = 'active' AND ($1::boolean = false OR product_is_public) ORDER BY product_sort_order, product_id`, [onlyPublic]);
    const { rows: prices } = await rawQuery(
      `SELECT pr.price_id AS id, pr.price_product_id AS "productId", pr.price_key AS "priceKey", pr.price_amount AS amount, pr.price_currency AS currency,
              pr.price_interval AS "interval", pr.price_interval_count AS "intervalCount", pr.price_period_end_rule AS "periodEndRule",
              pr.price_max_installments AS "maxInstallments", pr.price_is_active AS "isActive", pr.price_valid_from AS "validFrom", pr.price_valid_to AS "validTo",
              pr.price_campaign_id AS "campaignId", pr.price_metadata AS metadata
         FROM billing.price pr WHERE pr.price_is_active ORDER BY pr.price_amount, pr.price_id`);
    const { rows: feats } = await rawQuery(
      `SELECT product_feature_product_id AS "productId", product_feature_feature AS feature, product_feature_limit_value AS "limit",
              product_feature_limit_period AS period, product_feature_is_enabled AS enabled FROM billing.product_feature`);
    const { rows: camps } = await rawQuery(
      `SELECT campaign_id AS id, campaign_key AS "campaignKey", campaign_name AS name, campaign_kind AS kind, campaign_status AS status, campaign_capacity AS capacity,
              campaign_starts_at AS "startsAt", campaign_ends_at AS "endsAt", campaign_launch_date AS "launchDate" FROM billing.campaign`);
    const campById = new Map(camps.map((c) => [String(c.id), c]));
    const campDtos = new Map();
    const out = [];
    for (const p of prods) {
      const plist = [];
      for (const pr of prices.filter((x) => String(x.productId) === String(p.id))) {
        const price = { ...pr, amount: toNum(pr.amount), intervalCount: Number(pr.intervalCount), maxInstallments: Number(pr.maxInstallments) };
        if (!priceWindowOpen(price, now) || price.metadata?.offerOnly) continue;
        let campaign = null;
        if (price.campaignId) {
          const c = campById.get(String(price.campaignId));
          if (!c || !campaignOpen(c, now)) continue;
          if (!campDtos.has(c.id)) campDtos.set(c.id, await toCampaignDto(c));
          campaign = campDtos.get(c.id);
        }
        plist.push(priceDto(price, { exam, now, campaign }));
      }
      out.push({
        productKey: p.productKey, name: p.name, description: p.description, kind: p.kind, tier: p.productKey === 'free' ? 'free' : 'premium',
        badgeKey: p.badgeKey, recommended: p.badgeKey === 'recommended', trialDays: Number(p.trialDays), sortOrder: p.sortOrder,
        prices: plist,
        features: feats.filter((f) => String(f.productId) === String(p.id)).map((f) => ({ feature: f.feature, enabled: f.enabled, limit: f.limit, period: f.period })),
      });
    }
    return { products: out, nextExam: exam ? { sessionKey: exam.key, examDate: exam.examDate, months: monthsUntilExam(exam, now) } : null, generatedAt: iso(now) };
  };

  const listPublicProducts = async () => loadProducts({ onlyPublic: true });

  const getPublicCampaign = async ({ key }) => {
    const c = (await rawQuery(
      `SELECT campaign_id AS id, campaign_key AS "campaignKey", campaign_name AS name, campaign_kind AS kind, campaign_status AS status, campaign_capacity AS capacity,
              campaign_starts_at AS "startsAt", campaign_ends_at AS "endsAt", campaign_launch_date AS "launchDate", campaign_terms_md AS "termsMd"
         FROM billing.campaign WHERE campaign_key = $1 AND campaign_status <> 'retired'`, [String(key)])).rows[0];
    if (!c) throw new DomainError('CAMPAIGN_NOT_FOUND', 'Campaign not found');
    const now = nowFn();
    const exam = await nextExamSession({ now, run: rawQuery });
    const { rows: prices } = await rawQuery(
      `SELECT pr.price_id AS id, pr.price_key AS "priceKey", pr.price_amount AS amount, pr.price_currency AS currency, pr.price_interval AS "interval",
              pr.price_interval_count AS "intervalCount", pr.price_period_end_rule AS "periodEndRule", pr.price_max_installments AS "maxInstallments",
              pr.price_is_active AS "isActive", pr.price_valid_from AS "validFrom", pr.price_valid_to AS "validTo", p.product_key AS "productKey", p.product_name AS "productName"
         FROM billing.price pr JOIN billing.product p ON p.product_id = pr.price_product_id WHERE pr.price_campaign_id = $1 ORDER BY pr.price_amount`, [c.id]);
    const dto = await toCampaignDto(c);
    return {
      ...dto, termsMd: c.termsMd, open: campaignOpen(c, now) && !dto.soldOut,
      prices: prices.filter((p) => priceWindowOpen({ ...p, amount: toNum(p.amount) }, now)).map((p) => ({
        productKey: p.productKey, productName: p.productName,
        ...priceDto({ ...p, amount: toNum(p.amount), intervalCount: Number(p.intervalCount), maxInstallments: Number(p.maxInstallments) }, { exam, now }),
      })),
    };
  };

  const buildEntitlementView = async (userId, { includeUsage = true } = {}) => {
    const ent = await getEntitlements(userId);
    const user = await findUser(userId, rawQuery);
    const tz = user?.timezone || 'Europe/Istanbul';
    const plan = (await rawQuery(`SELECT product_name AS name FROM billing.product WHERE product_key = $1`, [ent.productKey])).rows[0];
    const features = {};
    for (const f of FEATURES) {
      const base = ent.features[f] || { enabled: false, limit: 0, period: 'day' };
      features[f] = includeUsage ? { feature: f, ...(await readUsage(userId, f, base, tz, nowFn())) } : { feature: f, enabled: base.enabled, limit: base.limit, period: base.period };
    }
    const trialProduct = (await rawQuery(`SELECT product_key AS "productKey", product_trial_days AS "trialDays" FROM billing.product WHERE product_status='active' AND product_trial_days > 0 ORDER BY product_sort_order LIMIT 1`)).rows[0];
    const had = (await rawQuery(
      `SELECT EXISTS (SELECT 1 FROM billing.subscription WHERE subscription_user_account_id=$1 AND subscription_trial_ends_at IS NOT NULL)
           OR EXISTS (SELECT 1 FROM billing.entitlement_grant WHERE entitlement_grant_user_account_id=$1 AND entitlement_grant_source='trial') AS had,
              EXISTS (SELECT 1 FROM billing.subscription WHERE subscription_user_account_id=$1 AND subscription_status = ANY($2::varchar[])) AS live`, [Number(userId), LIVE_STATUSES])).rows[0];
    const trialEndsAt = ent.trialEndsAt || null;
    return {
      tier: ent.tier, planName: plan?.name || ent.productKey, productKey: ent.productKey, source: ent.source, validUntil: ent.validUntil,
      subscriptionStatus: ent.subscriptionStatus, cancelAtPeriodEnd: ent.cancelAtPeriodEnd, periodEnd: ent.periodEnd,
      trial: {
        active: !!trialEndsAt, endsAt: trialEndsAt,
        daysLeft: trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt) - nowFn()) / 86400000)) : null,
        eligible: !!trialProduct && !had.had && !had.live && ent.tier === 'free',
        trialDays: trialProduct ? Number(trialProduct.trialDays) : 0, productKey: trialProduct?.productKey || null,
      },
      features,
    };
  };

  const getMyEntitlements = async ({ caller }) => buildEntitlementView(Number(caller.callerUserId));

  const getInternalEntitlements = async ({ userId }) => {
    const id = Number(userId);
    if (!id) throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found');
    const ent = await getEntitlements(id);
    const plan = (await rawQuery(`SELECT product_name AS name FROM billing.product WHERE product_key = $1`, [ent.productKey])).rows[0];
    return { ...ent, planName: plan?.name || ent.productKey };
  };

  return Object.freeze({ listPublicProducts, getPublicCampaign, getMyEntitlements, getInternalEntitlements, buildEntitlementView });
};
