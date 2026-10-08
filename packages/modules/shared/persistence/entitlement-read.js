import datasources from 'app-datasource';
import { rawQuery } from './tx.js';

// Erişim = etkin hakların birleşimi (billing.entitlement_grant) + ücretsiz ürünün limitleri.
// Redis 21: ent:{userId} (10 dk; billing hak/abonelik değişince DEL). Asıl kaynak Postgres.
export const FREE_PRODUCT_KEY = 'free';
const TTL = 600;
const key = (userId) => `ent:${userId}`;
const redis = () => datasources.coreAppRedis?.client;

const loadFromDb = async (userId) => {
  const { rows: free } = await rawQuery(
    `SELECT f.product_feature_feature AS feature, f.product_feature_limit_value AS lim, f.product_feature_limit_period AS period, f.product_feature_is_enabled AS enabled
       FROM billing.product p JOIN billing.product_feature f ON f.product_feature_product_id = p.product_id
      WHERE p.product_key = $1`, [FREE_PRODUCT_KEY]);
  const features = {};
  for (const r of free) features[r.feature] = { enabled: r.enabled, limit: r.lim, period: r.period };

  const { rows: grants } = await rawQuery(
    `SELECT p.product_key AS "productKey", g.entitlement_grant_source AS source, g.entitlement_grant_ends_at AS "endsAt",
            g.entitlement_grant_subscription_id AS "subscriptionId"
       FROM billing.entitlement_grant g JOIN billing.product p ON p.product_id = g.entitlement_grant_product_id
      WHERE g.entitlement_grant_user_account_id = $1 AND g.entitlement_grant_revoked_at IS NULL
        AND g.entitlement_grant_starts_at <= now() AND (g.entitlement_grant_ends_at IS NULL OR g.entitlement_grant_ends_at > now())
      ORDER BY g.entitlement_grant_ends_at DESC NULLS FIRST`, [userId]);
  let tier = 'free';
  let productKey = FREE_PRODUCT_KEY;
  let validUntil = null;
  let source = null;
  if (grants.length) {
    tier = 'premium';
    productKey = grants[0].productKey;
    source = grants[0].source;
    validUntil = grants[0].endsAt;
    const { rows: pf } = await rawQuery(
      `SELECT f.product_feature_feature AS feature, f.product_feature_limit_value AS lim, f.product_feature_limit_period AS period, f.product_feature_is_enabled AS enabled
         FROM billing.entitlement_grant g JOIN billing.product_feature f ON f.product_feature_product_id = g.entitlement_grant_product_id
        WHERE g.entitlement_grant_user_account_id = $1 AND g.entitlement_grant_revoked_at IS NULL
          AND g.entitlement_grant_starts_at <= now() AND (g.entitlement_grant_ends_at IS NULL OR g.entitlement_grant_ends_at > now())`, [userId]);
    for (const r of pf) {
      const cur = features[r.feature];
      const unlimited = r.lim === null;
      if (!cur || unlimited || (cur.limit !== null && r.lim > cur.limit) || (!cur.enabled && r.enabled)) {
        features[r.feature] = { enabled: r.enabled, limit: r.lim, period: r.period };
      }
    }
  }
  const { rows: sub } = await rawQuery(
    `SELECT subscription_trial_ends_at AS "trialEndsAt", subscription_status AS status, subscription_cancel_at_period_end AS "cancelAtPeriodEnd",
            subscription_current_period_end AS "periodEnd"
       FROM billing.subscription WHERE subscription_user_account_id = $1 AND subscription_status IN ('trialing','active','past_due','paused')
      ORDER BY subscription_created_at DESC LIMIT 1`, [userId]);
  return {
    tier, productKey, source, features,
    validUntil: validUntil ? new Date(validUntil).toISOString() : null,
    trialEndsAt: sub[0]?.status === 'trialing' && sub[0].trialEndsAt ? new Date(sub[0].trialEndsAt).toISOString() : null,
    subscriptionStatus: sub[0]?.status || null,
    cancelAtPeriodEnd: !!sub[0]?.cancelAtPeriodEnd,
    periodEnd: sub[0]?.periodEnd ? new Date(sub[0].periodEnd).toISOString() : null,
  };
};

export const getEntitlements = async (userId) => {
  const r = redis();
  try {
    const hit = r ? await r.get(key(userId)) : null;
    if (hit) return JSON.parse(hit);
  } catch { /* Redis yoksa Postgres */ }
  const value = await loadFromDb(userId);
  try {
    if (r) {
      const ttl = value.validUntil ? Math.max(30, Math.min(TTL, Math.floor((new Date(value.validUntil) - Date.now()) / 1000))) : TTL;
      await r.set(key(userId), JSON.stringify(value), 'EX', ttl);
    }
  } catch { /* önbellek best-effort */ }
  return value;
};

export const invalidateEntitlements = async (userId) => {
  try {
    await redis()?.del(key(userId));
  } catch { /* best-effort */ }
};
