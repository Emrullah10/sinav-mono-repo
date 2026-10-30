// Mağaza satın almaları (Apple App Store / Google Play) — RevenueCat üzerinden.
//   webhook : RevenueCat olayları → abonelik + hak (entitlement_grant). Aynı olay iki kez işlenmez (provider_event).
//   sync    : satın alma/geri yüklemeden hemen sonra uygulama çağırır; RevenueCat REST'ten güncel durumu çekip aynı yazıcıdan geçirir.
// RevenueCat app_user_id'si bizim user_account_code'umuzdur. Erişimin tek kaynağı entitlement_grant'tır.
import { DomainError, withTransaction, writeAudit, invalidateEntitlements, getEntitlements } from 'app-shared';
import { findUser, systemCaller, safeEq, LIVE_STATUSES } from '../shared/helpers.js';
import { loadPriceById, nextExamSession, computePeriod } from '../shared/pricing.js';
import { lockLiveSubscription, writeSubscription, insertGrant } from '../shared/ledger.js';

const CHANNEL = { APP_STORE: 'app_store', PLAY_STORE: 'google_play', MAC_APP_STORE: 'app_store' };
const STORE_CHANNELS = ['app_store', 'google_play'];
const ACTIVATE = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SYNC']);
const apiBase = () => (process.env.REVENUECAT_API_BASE || 'https://api.revenuecat.com').replace(/\/$/, '');
const ms = (v) => (v === null || v === undefined || v === '' ? null : new Date(Number(v)));
const msOrIso = (v) => (typeof v === 'number' ? new Date(v) : v ? new Date(v) : null);

export const makeStore = ({ rawQuery, nowFn, fetchFn = globalThis.fetch }) => {
  const mappingFor = async (run, channel, storeId) =>
    (await run(
      `SELECT sp.store_product_product_id AS "productId", p.product_key AS "productKey", p.product_kind AS kind
         FROM billing.store_product sp JOIN billing.product p ON p.product_id = sp.store_product_product_id
        WHERE sp.store_product_channel = $1 AND sp.store_product_store_id = $2 AND sp.store_product_is_active`, [channel, String(storeId)])).rows[0] || null;

  const priceOfProduct = async (run, productId) => {
    const r = (await run(`SELECT price_id AS id FROM billing.price WHERE price_product_id = $1 AND price_is_active ORDER BY price_id DESC LIMIT 1`, [productId])).rows[0];
    return r ? loadPriceById(r.id, run) : null;
  };

  const latestStoreSub = async (tx, userId) =>
    (await tx.query(
      `SELECT subscription_id AS id, subscription_status AS status, subscription_channel AS channel, subscription_current_period_end AS "periodEnd"
         FROM billing.subscription WHERE subscription_user_account_id = $1 AND subscription_channel = ANY($2::varchar[]) ORDER BY subscription_id DESC LIMIT 1 FOR UPDATE`,
      [userId, STORE_CHANNELS])).rows[0] || null;

  const revokeGrants = (tx, subscriptionId, at) =>
    tx.query(`UPDATE billing.entitlement_grant SET entitlement_grant_revoked_at = $2 WHERE entitlement_grant_subscription_id = $1 AND entitlement_grant_revoked_at IS NULL`, [subscriptionId, at]);

  /** Satın alma/yenileme/geri yükleme → abonelik + hak. Dönüş: { outcome } */
  const activate = async (tx, { user, ev, now }) => {
    const channel = CHANNEL[ev.store];
    if (!channel) return { outcome: 'ignored', reason: `bilinmeyen mağaza: ${ev.store}` };
    const map = await mappingFor(tx.query.bind(tx), channel, ev.product_id);
    if (!map) return { outcome: 'ignored', reason: `eşlenmemiş ürün: ${ev.product_id}` };
    const price = await priceOfProduct(tx.query.bind(tx), map.productId);
    if (!price) return { outcome: 'ignored', reason: 'fiyat yok' };
    const start = ms(ev.purchased_at_ms) || now;
    let period;
    if (price.periodEndRule === 'next_exam_session') {
      const exam = await nextExamSession({ userId: user.id, now: start, run: tx.query.bind(tx) });
      period = computePeriod(price, start, exam);
    } else {
      const end = ms(ev.expiration_at_ms);
      period = end ? { start, end, examSessionId: null } : computePeriod(price, start, null);
    }
    if (!(period.end > period.start)) return { outcome: 'ignored', reason: 'geçersiz dönem' };
    if (period.end <= now) return { outcome: 'ignored', reason: 'dönem zaten bitmiş' };
    const trial = ev.period_type === 'TRIAL';
    const ref = String(ev.original_transaction_id || ev.transaction_id || ev.id || '').slice(0, 120) || null;
    const patch = { store: { channel, productId: String(ev.product_id), environment: ev.environment || null, periodType: ev.period_type || null, eventType: ev.type } };
    const existing = await lockLiveSubscription(tx, user.id);
    if (existing && !STORE_CHANNELS.includes(existing.channel)) {
      // Canlı web aboneliği var: ona dokunma; ödenen süre kadar ayrı hak yaz, çakışma işaretle.
      await insertGrant(tx, { user, productId: map.productId, source: 'manual', subscriptionId: null, startsAt: period.start, endsAt: period.end, sourceRef: ref });
      return { outcome: 'conflict', reason: 'canlı web aboneliği var; mağaza satın alması ayrı hak olarak yazıldı', until: period.end };
    }
    const grantSource = trial ? 'trial' : 'subscription';
    const r = await writeSubscription(tx, {
      user, price, period, status: trial ? 'trialing' : 'active', source: grantSource, existing, trialEndsAt: trial ? period.end : null,
      metadataPatch: patch, now, channel, providerRef: ref,
    });
    return { outcome: 'processed', subscriptionCode: r.code, until: period.end };
  };

  /** Olay tipine göre yazım. Her dalda `{ outcome, reason? }` döner. */
  const applyEvent = async (tx, { user, ev, now }) => {
    if (ACTIVATE.has(ev.type)) {
      const r = await activate(tx, { user, ev, now });
      // Senkron/yenileme sırasında iptal bayrağı (otomatik yenileme kapalı) olayın kendisinde gelebilir.
      if (r.outcome === 'processed' && ev.unsubscribe_detected) {
        await tx.query(`UPDATE billing.subscription SET subscription_cancel_at_period_end = true, subscription_canceled_at = $2 WHERE subscription_code = $1`, [r.subscriptionCode, now]);
      }
      return r;
    }
    const sub = await latestStoreSub(tx, user.id);
    if (!sub) return { outcome: 'ignored', reason: 'mağaza aboneliği yok' };
    switch (ev.type) {
      case 'CANCELLATION': {
        if (ev.cancel_reason === 'CUSTOMER_SUPPORT') { // iade
          await tx.query(`UPDATE billing.subscription SET subscription_status='canceled', subscription_canceled_at=$2, subscription_cancel_at_period_end=false WHERE subscription_id=$1`, [sub.id, now]);
          await revokeGrants(tx, sub.id, now);
          return { outcome: 'processed', reason: 'iade: erişim kaldırıldı' };
        }
        await tx.query(`UPDATE billing.subscription SET subscription_cancel_at_period_end=true, subscription_canceled_at=$2 WHERE subscription_id=$1 AND subscription_status = ANY($3::varchar[])`, [sub.id, now, LIVE_STATUSES]);
        return { outcome: 'processed' };
      }
      case 'BILLING_ISSUE': {
        const grace = ms(ev.grace_period_expiration_at_ms) || ms(ev.expiration_at_ms);
        await tx.query(`UPDATE billing.subscription SET subscription_status='past_due' WHERE subscription_id=$1 AND subscription_status IN ('trialing','active')`, [sub.id]);
        if (grace && grace > now) await tx.query(`UPDATE billing.entitlement_grant SET entitlement_grant_ends_at = GREATEST(entitlement_grant_ends_at, $2) WHERE entitlement_grant_subscription_id = $1 AND entitlement_grant_revoked_at IS NULL`, [sub.id, grace]);
        return { outcome: 'processed' };
      }
      case 'SUBSCRIPTION_PAUSED':
        await tx.query(`UPDATE billing.subscription SET subscription_metadata = subscription_metadata || '{"storePaused":true}'::jsonb WHERE subscription_id=$1`, [sub.id]);
        return { outcome: 'processed' };
      case 'EXPIRATION':
        if (LIVE_STATUSES.includes(sub.status)) await tx.query(`UPDATE billing.subscription SET subscription_status='expired' WHERE subscription_id=$1`, [sub.id]);
        await revokeGrants(tx, sub.id, now);
        return { outcome: 'processed' };
      default:
        return { outcome: 'ignored', reason: `işlenmeyen olay: ${ev.type}` };
    }
  };

  const markEvent = (id, status, error = null, metadata = {}) =>
    rawQuery(`UPDATE billing.provider_event SET provider_event_status=$2, provider_event_processed_at=now(), provider_event_error=$3, provider_event_metadata = provider_event_metadata || $4::jsonb WHERE provider_event_id=$1`,
      [id, status, error, JSON.stringify(metadata)]);

  /** Kullanıcıyı (user_account_code = app_user_id) bulur. */
  const userByAppId = async (appUserId) => {
    const code = Number(appUserId);
    if (!Number.isSafeInteger(code) || code <= 0) return null;
    const r = (await rawQuery(`SELECT user_account_id AS id FROM identity.user_account WHERE user_account_code = $1`, [code])).rows[0];
    return r ? findUser(r.id) : null;
  };

  /** TRANSFER: eski kullanıcıların mağaza erişimi kalkar; yeni kullanıcı sync ile alır. */
  const handleTransfer = async (ev, now) => {
    const from = Array.isArray(ev.transferred_from) ? ev.transferred_from : [];
    const to = Array.isArray(ev.transferred_to) ? ev.transferred_to : [];
    const touched = [];
    for (const a of from) {
      const u = await userByAppId(a);
      if (!u) continue;
      await withTransaction(async (tx) => {
        const sub = await latestStoreSub(tx, u.id);
        if (!sub || !LIVE_STATUSES.includes(sub.status)) return;
        await tx.query(`UPDATE billing.subscription SET subscription_status='canceled', subscription_canceled_at=$2 WHERE subscription_id=$1`, [sub.id, now]);
        await revokeGrants(tx, sub.id, now);
      });
      touched.push(u.id);
    }
    for (const a of to) { const u = await userByAppId(a); if (u) { try { await syncUser(u); } catch (e) { console.error('[billing] transfer sync', e.message); } touched.push(u.id); } }
    for (const id of touched) await invalidateEntitlements(id);
    return { outcome: 'processed' };
  };

  const webhook = async ({ authorization, body }) => {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected) throw new DomainError('BILLING_STORE_NOT_CONFIGURED', 'Store purchases are not configured', undefined, 503);
    const got = String(authorization || '').replace(/^Bearer\s+/i, '');
    if (!safeEq(got, String(expected).replace(/^Bearer\s+/i, ''))) throw new DomainError('BILLING_STORE_AUTH_INVALID', 'Webhook authorization failed', undefined, 401);
    const ev = body?.event;
    if (!ev || typeof ev !== 'object' || !ev.id || !ev.type) throw new DomainError('BILLING_STORE_EVENT_INVALID', 'Event body invalid', undefined, 400);
    const now = nowFn();
    const user = await userByAppId(ev.app_user_id);
    const tenant = user?.tenantCode ?? (await rawQuery(`SELECT tenant_code AS t FROM identity.tenant ORDER BY tenant_code LIMIT 1`)).rows[0]?.t ?? 1;
    const ins = await rawQuery(
      `INSERT INTO billing.provider_event (provider_event_tenant_code, provider_event_organization_id, provider_event_provider, provider_event_event_id, provider_event_event_type,
              provider_event_status, provider_event_signature_valid, provider_event_payload)
       VALUES ($1,$2,'revenuecat',$3,$4,'received',true,$5::jsonb) ON CONFLICT (provider_event_provider, provider_event_event_id) DO NOTHING RETURNING provider_event_id AS id`,
      [tenant, user?.orgId ?? null, String(ev.id), String(ev.type), JSON.stringify(body)]);
    let eventId = ins.rows[0]?.id;
    if (!eventId) { // aynı olay: işlenmişse atla, yarım kalmışsa (failed/received) yeniden dene
      const old = (await rawQuery(`SELECT provider_event_id AS id, provider_event_status AS status FROM billing.provider_event WHERE provider_event_provider='revenuecat' AND provider_event_event_id=$1`, [String(ev.id)])).rows[0];
      if (old && ['processed', 'ignored'].includes(old.status)) return { received: true, duplicate: true };
      eventId = old.id;
    }
    try {
      if (ev.type === 'TEST') { await markEvent(eventId, 'ignored', null, { reason: 'test' }); return { received: true, test: true }; }
      if (ev.type === 'TRANSFER') { const r = await handleTransfer(ev, now); await markEvent(eventId, 'processed', null, r); return { received: true }; }
      if (!user) { await markEvent(eventId, 'ignored', null, { reason: `kullanıcı bulunamadı: ${ev.app_user_id}` }); return { received: true, ignored: true }; }
      const r = await withTransaction((tx) => applyEvent(tx, { user, ev, now }));
      await markEvent(eventId, r.outcome === 'ignored' ? 'ignored' : 'processed', null, r.outcome === 'conflict' ? { ...r, until: r.until?.toISOString?.() } : { reason: r.reason ?? null });
      if (r.outcome !== 'ignored') {
        await invalidateEntitlements(user.id);
        await writeAudit({ caller: systemCaller(user, 'store'), action: `billing.store.${String(ev.type).toLowerCase()}`, schema: 'billing', table: 'subscription', entityCode: null, after: { productId: ev.product_id, store: ev.store, outcome: r.outcome } });
      }
      return { received: true, outcome: r.outcome };
    } catch (e) {
      await markEvent(eventId, 'failed', String(e.message).slice(0, 500));
      throw e; // RevenueCat yeniden dener
    }
  };

  // ── RevenueCat REST ile senkron ──
  const fetchSubscriber = async (appUserId) => {
    const key = process.env.REVENUECAT_SECRET_KEY;
    if (!key) throw new DomainError('BILLING_STORE_NOT_CONFIGURED', 'Store purchases are not configured', undefined, 503);
    let res;
    try { res = await fetchFn(`${apiBase()}/v1/subscribers/${encodeURIComponent(appUserId)}`, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) }); } catch (e) {
      throw new DomainError('BILLING_STORE_UNAVAILABLE', `RevenueCat unreachable: ${e.message}`, undefined, 502);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new DomainError('BILLING_STORE_UNAVAILABLE', `RevenueCat HTTP ${res.status}`, undefined, 502);
    return (await res.json())?.subscriber || null;
  };

  const STORE_NAME = { app_store: 'APP_STORE', play_store: 'PLAY_STORE', mac_app_store: 'MAC_APP_STORE' };

  /** RevenueCat abone kaydından en geç biten aktif aboneliği / en yeni tek seferlik satın almayı seçip uygular. */
  const syncUser = async (user) => {
    const sub = await fetchSubscriber(String(user.code));
    const now = nowFn();
    if (!sub) return { synced: true, active: false };
    const candidates = [];
    for (const [productId, s] of Object.entries(sub.subscriptions || {})) {
      const exp = msOrIso(s.expires_date);
      if (!exp || exp <= now || !STORE_NAME[s.store]) continue;
      candidates.push({ type: 'SYNC', id: `sync:${productId}:${exp.getTime()}`, product_id: productId, store: STORE_NAME[s.store], period_type: String(s.period_type || 'normal').toUpperCase(),
        purchased_at_ms: msOrIso(s.purchase_date)?.getTime(), expiration_at_ms: exp.getTime(), original_transaction_id: s.original_transaction_id || null,
        environment: s.is_sandbox ? 'SANDBOX' : 'PRODUCTION', unsubscribe_detected: !!s.unsubscribe_detected_at, billing_issue: !!s.billing_issues_detected_at, _until: exp.getTime() });
    }
    for (const [productId, list] of Object.entries(sub.non_subscriptions || {})) {
      for (const t of list || []) {
        if (!STORE_NAME[t.store]) continue;
        const bought = msOrIso(t.purchase_date);
        candidates.push({ type: 'SYNC', id: `sync:${productId}:${t.id}`, product_id: productId, store: STORE_NAME[t.store], period_type: 'NORMAL', purchased_at_ms: bought?.getTime(),
          expiration_at_ms: null, original_transaction_id: t.id, environment: t.is_sandbox ? 'SANDBOX' : 'PRODUCTION', _until: bought?.getTime() || 0 });
      }
    }
    if (!candidates.length) return { synced: true, active: false };
    // Abonelik adayları bitişe göre; tek seferlik satın alma zamanına göre sıralanır (en yeni kazanır). Bitmiş geçiş dönemi activate içinde elenir.
    candidates.sort((a, b) => b._until - a._until);
    for (const ev of candidates) {
      const r = await withTransaction((tx) => applyEvent(tx, { user, ev, now }));
      if (r.outcome === 'processed' || r.outcome === 'conflict') { await invalidateEntitlements(user.id); return { synced: true, active: true, outcome: r.outcome }; }
    }
    return { synced: true, active: false };
  };

  const sync = async ({ caller }) => {
    const user = await findUser(Number(caller.callerUserId));
    if (!user) throw new DomainError('BILLING_STORE_EVENT_INVALID', 'User not found', undefined, 404);
    const r = await syncUser(user);
    const ent = await getEntitlements(user.id);
    return { ...r, tier: ent.tier, validUntil: ent.validUntil };
  };

  /** Hesap silme: mağaza erişimi kapanır, RevenueCat müşteri kaydı silinir (best-effort). */
  const purgeUser = async ({ userId }) => {
    const user = await findUser(Number(userId));
    if (!user) return { ok: true };
    const now = nowFn();
    await withTransaction(async (tx) => {
      const sub = await latestStoreSub(tx, user.id);
      if (sub && LIVE_STATUSES.includes(sub.status)) {
        await tx.query(`UPDATE billing.subscription SET subscription_status='canceled', subscription_canceled_at=$2 WHERE subscription_id=$1`, [sub.id, now]);
        await revokeGrants(tx, sub.id, now);
      }
    });
    await invalidateEntitlements(user.id);
    const key = process.env.REVENUECAT_SECRET_KEY;
    if (key) { try { await fetchFn(`${apiBase()}/v1/subscribers/${encodeURIComponent(String(user.code))}`, { method: 'DELETE', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) }); } catch (e) { console.error('[billing] RC delete', e.message); } }
    return { ok: true };
  };

  return Object.freeze({ webhook, sync, purgeUser, applyEvent, syncUser });
};
