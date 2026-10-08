import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import {
  DomainError, withTransaction, hashOtp, generateOtpCode, writeAudit,
  revokeAllSessionsForUser, datasources,
} from 'app-shared';
import {
  normalizeEmail, isEmail, getTenantCode, findUserByEmail, findUserById, buildSessionPayload,
  GUEST_TTL_DAYS, subjectHash,
} from '../shared/helpers.js';
import { render } from '../shared/email-templates.js';

const CODE_TTL_MIN = 10;
const RESEND_COOLDOWN_S = 45;
const MAX_CODES_PER_HOUR = 6;
const PURPOSES = new Set(['login', 'signup', 'password_reset', 'account_deletion', 'email_change']);
const appUrl = () => process.env.PUBLIC_APP_BASE_URL || 'http://127.0.0.1:3000';
const passwordOk = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 128;

export const makeAuth = ({ rawQuery, nowFn, mailer }) => {
  const redis = () => datasources.coreAppRedis?.client;

  const sendCode = async ({ email, purpose, userId = null, ip = null, userAgent = null }) => {
    const emailN = normalizeEmail(email);
    if (!isEmail(emailN)) throw new DomainError('AUTH_EMAIL_INVALID', 'Invalid email');
    if (!PURPOSES.has(purpose)) throw new DomainError('AUTH_PURPOSE_INVALID', 'Invalid purpose');
    // Redis 9: e-posta başına saatlik sınır (IP sınırı gateway'de)
    const r = redis();
    if (r) {
      const k = `identity:authcode:send:${crypto.createHash('sha256').update(emailN).digest('hex').slice(0, 24)}`;
      const n = await r.incr(k);
      if (n === 1) await r.expire(k, 3600);
      if (n > MAX_CODES_PER_HOUR) throw new DomainError('AUTH_CODE_RATE_LIMITED', 'Too many codes', { retryAfter: 3600 }, 429);
    }
    const tenantCode = await getTenantCode(rawQuery);
    const { rows: recent } = await rawQuery(
      `SELECT auth_code_created_at AS at FROM identity.auth_code WHERE auth_code_email_normalized=$1 AND auth_code_purpose=$2
        ORDER BY auth_code_created_at DESC LIMIT 1`, [emailN, purpose]);
    if (recent[0] && (nowFn() - new Date(recent[0].at)) / 1000 < RESEND_COOLDOWN_S) {
      const retryAfter = Math.ceil(RESEND_COOLDOWN_S - (nowFn() - new Date(recent[0].at)) / 1000);
      throw new DomainError('AUTH_CODE_RATE_LIMITED', 'Wait before requesting a new code', { retryAfter }, 429);
    }
    const user = userId ? await findUserById(userId, rawQuery) : await findUserByEmail(emailN, tenantCode, rawQuery);
    if (purpose === 'signup' && user && user.status !== 'guest' && user.id !== userId) {
      throw new DomainError('AUTH_EMAIL_ALREADY_REGISTERED', 'Account exists for this email');
    }
    // Hesap yoksa login/reset için sessizce başarılı dön (hesap sızdırma yok); kod gönderilmez.
    const silent = (purpose === 'login' || purpose === 'password_reset') && (!user || ['guest', 'deleted'].includes(user.status));
    if (!silent) {
      const code = generateOtpCode();
      await rawQuery(
        `INSERT INTO identity.auth_code (auth_code_tenant_code, auth_code_email_normalized, auth_code_user_account_id, auth_code_purpose,
                                         auth_code_code_hash, auth_code_expires_at, auth_code_requested_ip, auth_code_user_agent)
         VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' minutes')::interval, $7, $8)`,
        [tenantCode, emailN, user?.id || null, purpose, hashOtp(emailN, code), String(CODE_TTL_MIN), ip, userAgent?.slice(0, 300) || null]);
      const mail = render('login_code', { code, purpose });
      await mailer.send({ to: emailN, ...mail });
    }
    return { sent: true, expiresInSeconds: CODE_TTL_MIN * 60, retryAfterSeconds: RESEND_COOLDOWN_S };
  };

  const consumeCode = async ({ email, purpose, code, tx }) => {
    const emailN = normalizeEmail(email);
    const { rows } = await tx.query(
      `SELECT auth_code_id AS id, auth_code_code_hash AS hash, auth_code_attempt_count AS attempts, auth_code_max_attempts AS max
         FROM identity.auth_code WHERE auth_code_email_normalized=$1 AND auth_code_purpose=$2 AND auth_code_consumed_at IS NULL AND auth_code_expires_at > now()
        ORDER BY auth_code_created_at DESC LIMIT 1 FOR UPDATE`, [emailN, purpose]);
    const row = rows[0];
    if (!row) throw new DomainError('AUTH_CODE_INVALID', 'Code invalid or expired');
    if (row.attempts >= row.max) throw new DomainError('AUTH_CODE_LOCKED', 'Too many attempts', undefined, 429);
    const given = hashOtp(emailN, String(code || '').replace(/\s/g, ''));
    const a = Buffer.from(given), b = Buffer.from(row.hash);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      await tx.query(`UPDATE identity.auth_code SET auth_code_attempt_count = auth_code_attempt_count + 1 WHERE auth_code_id=$1`, [row.id]);
      // Hatalı deneme transaction geri alınsa da sayılsın diye ayrı bağlantıda değil, burada commit edilir:
      throw Object.assign(new DomainError('AUTH_CODE_INVALID', 'Code invalid or expired'), { keepAttempt: true });
    }
    await tx.query(`UPDATE identity.auth_code SET auth_code_consumed_at = now() WHERE auth_code_id=$1`, [row.id]);
  };

  // Hatalı denemeyi kalıcılaştırmak için: transaction dışında artır.
  const bumpAttempt = async (email, purpose) => {
    await rawQuery(
      `UPDATE identity.auth_code SET auth_code_attempt_count = auth_code_attempt_count + 1
        WHERE auth_code_id = (SELECT auth_code_id FROM identity.auth_code WHERE auth_code_email_normalized=$1 AND auth_code_purpose=$2
                               AND auth_code_consumed_at IS NULL AND auth_code_expires_at > now() ORDER BY auth_code_created_at DESC LIMIT 1)`,
      [normalizeEmail(email), purpose]);
  };
  const withCode = async (email, purpose, code, fn) => {
    try {
      return await withTransaction(async (tx) => {
        await consumeCode({ email, purpose, code, tx });
        return fn(tx);
      });
    } catch (e) {
      if (e?.code === 'AUTH_CODE_INVALID') await bumpAttempt(email, purpose).catch(() => {});
      throw e;
    }
  };

  const createGuest = async ({ locale = 'tr', timezone = 'Europe/Istanbul' } = {}) => {
    const tenantCode = await getTenantCode(rawQuery);
    const userId = await withTransaction(async (tx) => {
      const o = await tx.query(
        `INSERT INTO identity.organization (organization_tenant_code, organization_type, organization_name, organization_locale)
         VALUES ($1,'individual','Misafir',$2) RETURNING organization_id AS id`, [tenantCode, ['tr', 'en'].includes(locale) ? locale : 'tr']);
      const orgId = o.rows[0].id;
      const u = await tx.query(
        `INSERT INTO identity.user_account (user_account_tenant_code, user_account_organization_id, user_account_status, user_account_locale,
                                            user_account_timezone, user_account_guest_expires_at)
         VALUES ($1,$2,'guest',$3,$4, now() + ($5 || ' days')::interval) RETURNING user_account_id AS id`,
        [tenantCode, orgId, ['tr', 'en'].includes(locale) ? locale : 'tr', String(timezone).slice(0, 64), String(GUEST_TTL_DAYS)]);
      const uid = u.rows[0].id;
      await tx.query(
        `INSERT INTO identity.membership (membership_tenant_code, membership_organization_id, membership_user_account_id, membership_role, membership_is_default, membership_joined_at)
         VALUES ($1,$2,$3,'guest',true, now())`, [tenantCode, orgId, uid]);
      await tx.query(`INSERT INTO identity.user_preference (user_preference_tenant_code, user_preference_organization_id, user_preference_user_account_id) VALUES ($1,$2,$3)`, [tenantCode, orgId, uid]);
      await tx.query(`INSERT INTO notify.preference (preference_tenant_code, preference_organization_id, preference_user_account_id) VALUES ($1,$2,$3)`, [tenantCode, orgId, uid]);
      return uid;
    });
    return buildSessionPayload(userId, { run: rawQuery });
  };

  const register = async ({ caller, email, code, displayName, consents = [], platform = 'web' }) => {
    const userId = Number(caller.callerUserId);
    const emailN = normalizeEmail(email);
    if (!isEmail(emailN)) throw new DomainError('AUTH_EMAIL_INVALID', 'Invalid email');
    const tenantCode = await getTenantCode(rawQuery);
    const existing = await findUserByEmail(emailN, tenantCode, rawQuery);
    if (existing && Number(existing.id) !== userId) throw new DomainError('AUTH_EMAIL_ALREADY_REGISTERED', 'Account exists for this email');
    await withCode(emailN, 'signup', code, async (tx) => {
      const { rows } = await tx.query(`SELECT user_account_status AS status FROM identity.user_account WHERE user_account_id=$1 FOR UPDATE`, [userId]);
      if (!rows.length) throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found');
      await tx.query(
        `UPDATE identity.user_account SET user_account_email=$2, user_account_email_normalized=$3, user_account_email_verified_at=now(),
                user_account_status='active', user_account_display_name=COALESCE($4, user_account_display_name), user_account_guest_expires_at=NULL,
                user_account_last_login_at=now()
          WHERE user_account_id=$1`, [userId, emailN, emailN, displayName ? String(displayName).slice(0, 100) : null]);
      await tx.query(`UPDATE identity.membership SET membership_role='learner' WHERE membership_user_account_id=$1 AND membership_role='guest'`, [userId]);
      await tx.query(
        `UPDATE identity.organization SET organization_name = COALESCE($2, 'Kişisel') WHERE organization_id = (SELECT user_account_organization_id FROM identity.user_account WHERE user_account_id=$1)`,
        [userId, displayName ? String(displayName).slice(0, 100) : null]);
      for (const c of consents) {
        if (!['kvkk_notice', 'terms_of_use', 'marketing_email'].includes(c?.type)) continue;
        await tx.query(
          `INSERT INTO identity.consent (consent_tenant_code, consent_organization_id, consent_user_account_id, consent_subject_hash, consent_consent_type,
                                         consent_granted, consent_legal_document_id, consent_source_platform, consent_ip)
           VALUES ($1,$2,$3,$4,$5::varchar,$6,(SELECT legal_document_id FROM identity.legal_document WHERE legal_document_doc_type = $5::varchar AND legal_document_is_current LIMIT 1),$7,$8)`,
          [tenantCode, caller.callerOrganizationId, userId, subjectHash(emailN), c.type, !!c.granted, ['web', 'ios', 'android'].includes(platform) ? platform : 'web', caller.callerIp]);
      }
    });
    await writeAudit({ caller, action: 'identity.user.registered', schema: 'identity', table: 'user_account', after: { email: emailN } });
    mailer.send({ to: emailN, ...render('welcome', { appUrl: appUrl(), name: displayName }) }).catch(() => {});
    return buildSessionPayload(userId, { run: rawQuery });
  };

  const afterLogin = async (tx, user, ip) => {
    if (user.status === 'pending_deletion') {
      await tx.query(
        `UPDATE identity.user_account SET user_account_status='active', user_account_deletion_requested_at=NULL, user_account_deletion_scheduled_for=NULL WHERE user_account_id=$1`, [user.id]);
    }
    await tx.query(`UPDATE identity.user_account SET user_account_last_login_at=now(), user_account_failed_login_count=0, user_account_locked_until=NULL WHERE user_account_id=$1`, [user.id]);
    return null;
  };
  const assertLoginAllowed = (user) => {
    if (!user || ['guest', 'deleted'].includes(user.status)) return;
    if (user.status === 'suspended') throw new DomainError('ACCOUNT_SUSPENDED', 'Account suspended', undefined, 403);
    if (user.lockedUntil && new Date(user.lockedUntil) > nowFn()) throw new DomainError('ACCOUNT_LOCKED', 'Account temporarily locked', { until: user.lockedUntil }, 429);
  };

  const verifyEmailCode = async ({ email, code }) => {
    const emailN = normalizeEmail(email);
    const tenantCode = await getTenantCode(rawQuery);
    const user = await findUserByEmail(emailN, tenantCode, rawQuery);
    if (!user || ['guest', 'deleted'].includes(user.status)) {
      await bumpAttempt(emailN, 'login').catch(() => {});
      throw new DomainError('AUTH_CODE_INVALID', 'Code invalid or expired');
    }
    assertLoginAllowed(user);
    await withCode(emailN, 'login', code, (tx) => afterLogin(tx, user));
    return buildSessionPayload(user.id, { run: rawQuery });
  };

  const passwordLogin = async ({ email, password }) => {
    const emailN = normalizeEmail(email);
    const tenantCode = await getTenantCode(rawQuery);
    const user = await findUserByEmail(emailN, tenantCode, rawQuery);
    const invalid = new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', undefined, 401);
    if (!user || !user.passwordHash || ['guest', 'deleted'].includes(user.status)) {
      await bcrypt.compare(String(password || ''), '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid.').catch(() => {});
      throw invalid;
    }
    assertLoginAllowed(user);
    const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
    if (!ok) {
      await rawQuery(
        `UPDATE identity.user_account SET user_account_failed_login_count = user_account_failed_login_count + 1,
                user_account_locked_until = CASE WHEN user_account_failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE user_account_locked_until END
          WHERE user_account_id=$1`, [user.id]);
      throw invalid;
    }
    await withTransaction((tx) => afterLogin(tx, user));
    return buildSessionPayload(user.id, { run: rawQuery });
  };

  const resetPassword = async ({ email, code, newPassword }) => {
    if (!passwordOk(newPassword)) throw new DomainError('PASSWORD_WEAK', 'Password must be at least 8 characters');
    const emailN = normalizeEmail(email);
    const tenantCode = await getTenantCode(rawQuery);
    const user = await findUserByEmail(emailN, tenantCode, rawQuery);
    if (!user || ['guest', 'deleted'].includes(user.status)) throw new DomainError('AUTH_CODE_INVALID', 'Code invalid or expired');
    const hash = await bcrypt.hash(newPassword, 10);
    await withCode(emailN, 'password_reset', code, async (tx) => {
      await tx.query(`UPDATE identity.user_account SET user_account_password_hash=$2, user_account_password_set_at=now(), user_account_failed_login_count=0, user_account_locked_until=NULL WHERE user_account_id=$1`, [user.id, hash]);
    });
    await revokeAllSessionsForUser({ userId: String(user.id) }).catch(() => {});
    await writeAudit({ caller: { callerUserId: user.id, callerTenantCode: tenantCode }, action: 'identity.password.reset', schema: 'identity', table: 'user_account', entityCode: Number(user.code) });
    return { ok: true };
  };

  const switchSession = async ({ caller, membershipCode }) => {
    const { rows } = await rawQuery(
      `SELECT membership_code FROM identity.membership WHERE membership_user_account_id=$1 AND membership_code=$2 AND membership_status='active'`,
      [caller.callerUserId, Number(membershipCode)]);
    if (!rows.length) throw new DomainError('MEMBERSHIP_NOT_FOUND', 'Membership not found');
    return buildSessionPayload(Number(caller.callerUserId), { membershipCode: Number(membershipCode), run: rawQuery });
  };

  return Object.freeze({ sendCode, createGuest, register, verifyEmailCode, passwordLogin, resetPassword, switchSession, consumeCode, withCode, passwordOk });
};
