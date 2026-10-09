import { DomainError, localDate } from 'app-shared';

/**
 * İstek bağlamı: kullanıcının iç id'si, kişisel org, tenant, saat dilimi ve "bugün" (yerel gün).
 * `after`: commit sonrası çalışacak (Redis yazma/silme) işler — use-case sonunda `flushAfter(ctx)`.
 */
export const loadCtx = async ({ rawQuery, nowFn }, caller) => {
  const uid = Number(caller?.callerUserId);
  if (!uid) throw new DomainError('AUTH_REQUIRED', 'Authentication required', undefined, 401);
  const { rows } = await rawQuery(
    `SELECT user_account_id AS id, user_account_code AS code, user_account_tenant_code AS "tenantCode", user_account_organization_id AS "orgId",
            user_account_timezone AS tz, user_account_locale AS locale, user_account_status AS status
       FROM identity.user_account WHERE user_account_id=$1`, [uid]);
  const u = rows[0];
  if (!u) throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found', undefined, 404);
  const now = nowFn();
  return {
    userId: Number(u.id), userCode: Number(u.code), tenantCode: Number(u.tenantCode), orgId: Number(u.orgId),
    tz: u.tz || 'Europe/Istanbul', locale: u.locale || 'tr', isGuest: u.status === 'guest', role: caller.callerUserRole || null,
    now, today: localDate(now, u.tz || 'Europe/Istanbul'), after: [],
  };
};

/** Başka kullanıcı adına çalışan sistem çağrıları için (internal uçlar, cron). */
export const loadCtxForUser = (deps, userId) => loadCtx(deps, { callerUserId: userId });

export const flushAfter = async (ctx) => {
  const jobs = ctx.after.splice(0);
  for (const fn of jobs) {
    try { await fn(); } catch (e) { console.error('[learning] after-commit', e?.message); }
  }
};

/** Standart satır başlığı: [tenant, org, user] parametreleri için yardımcı. */
export const own = (ctx) => [ctx.tenantCode, ctx.orgId, ctx.userId];

/** Use-case sarmalayıcı: bağlamı yükler, işi çalıştırır, başarıda commit-sonrası işleri (Redis) akıtır. */
export const withCtx = async (deps, caller, fn) => {
  try {
    const ctx = await loadCtx(deps, caller);
    const out = await fn(ctx);
    await flushAfter(ctx);
    return out;
  } catch (e) {
    if (!(e instanceof DomainError)) console.error('[learning] unexpected error:', e?.stack || e);
    throw e;
  }
};
