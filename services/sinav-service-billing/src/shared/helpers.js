import crypto from 'node:crypto';
import { rawQuery, fetchInternal, internalHeaders, INTERNAL_TIMEOUTS } from 'app-shared';

export const FEATURES = Object.freeze([
  'questions_per_day', 'tutor_messages_per_day', 'flashcard_reviews_per_day', 'translation_evals_per_day',
  'mini_exams_per_month', 'full_exams_per_month', 'detailed_analysis', 'score_estimate',
]);
export const LIVE_STATUSES = Object.freeze(['trialing', 'active', 'past_due', 'paused']);
export const GRACE_DAYS = 3;
export const MAX_RENEWAL_ATTEMPTS = 4;
export const VAT_RATE = () => Number(process.env.BILLING_VAT_RATE) || 0.2;
export const DEFAULT_EXAM_MONTHS = 5;
const DAY = 86400000;
export const DAY_MS = DAY;

export const toNum = (v) => (v === null || v === undefined ? null : Number(v));
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const iso = (d) => (d ? new Date(d).toISOString() : null);
export const upper = (s) => String(s || '').trim().toUpperCase();
export const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(String(data)).digest('hex');
export const safeEq = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
export const randId = (n = 8) => crypto.randomBytes(n).toString('hex');

export const addMonths = (date, n) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};
export const addDays = (date, n) => new Date(new Date(date).getTime() + n * DAY);

/** 'YYYY-MM-DD' (sınav günü) → ertesi günün Europe/Istanbul 00:00'ı (UTC+3, DST yok). */
export const dayAfterIstanbul = (dateStr) => {
  const s = typeof dateStr === 'string' ? dateStr.slice(0, 10) : new Date(dateStr).toISOString().slice(0, 10);
  return new Date(new Date(`${s}T00:00:00+03:00`).getTime() + DAY);
};
export const dateOnly = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const x = new Date(d);
  return new Date(x.getTime() + 3 * 3600000).toISOString().slice(0, 10);
};
export const todayIstanbul = (now = new Date()) => dateOnly(now);
export const fmtDateTr = (d) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date(d));
export const fmtMoney = (n) => `${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const publicAppUrl = () => (process.env.PUBLIC_APP_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
/** Tarayıcının erişeceği gateway kökü (sahte 3DS sayfası ve callback buradan sunulur). */
export const publicApiUrl = () => (process.env.PUBLIC_API_BASE_URL || process.env.GATEWAY_REST_URL || 'http://127.0.0.1:2000').replace(/\/$/, '');
export const identityUrl = () => (process.env.SERVICE_IDENTITY_REST_URL || 'http://127.0.0.1:2001').replace(/\/$/, '');

export const findUser = async (userId, run = rawQuery) =>
  (await run(
    `SELECT user_account_id AS id, user_account_code AS code, user_account_tenant_code AS "tenantCode", user_account_organization_id AS "orgId",
            user_account_email AS email, user_account_display_name AS "displayName", user_account_timezone AS timezone, user_account_status AS status,
            user_account_locale AS locale
       FROM identity.user_account WHERE user_account_id = $1`, [Number(userId)])).rows[0] || null;

export const systemCaller = (user, role = 'system') => ({
  callerUserId: user?.id ?? null, callerTenantCode: user?.tenantCode ?? 1, callerOrganizationId: user?.orgId ?? null, callerUserRole: role, callerIp: null,
});

/** identity iç bildirim ucu; commit SONRASI, best-effort (hata ana işi bozmaz). */
export const notifyUser = async ({ userId, kind, title, body, deepLink = null, payload = {}, dedupeKey, channels = null, scheduledFor = null }) => {
  try {
    const res = await fetchInternal(`${identityUrl()}/sinav-service-identity/v1/internal/notifications`, {
      method: 'POST', headers: internalHeaders(null), timeoutMs: INTERNAL_TIMEOUTS.bestEffort(),
      body: { userAccountId: Number(userId), kind, title, body, deepLink, payload, dedupeKey, channels, scheduledFor },
    });
    if (!res.ok) console.error('[billing] notify failed', kind, res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error('[billing] notify error', kind, e.message);
    return false;
  }
};
