import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import {
  DomainError, withTransaction, writeAudit, revokeAllSessionsForUser, hashOtp, randomToken, storagePut,
} from 'app-shared';
import {
  normalizeEmail, findUserById, listMemberships, getTenantCode, DELETION_GRACE_DAYS, sha256, subjectHash,
} from '../shared/helpers.js';
import { render } from '../shared/email-templates.js';

const appUrl = () => process.env.PUBLIC_APP_BASE_URL || 'http://127.0.0.1:3000';
const gatewayUrl = () => process.env.GATEWAY_REST_URL || 'http://127.0.0.1:2000';
const THEMES = ['system', 'light', 'dark'];
const FONTS = ['literata', 'figtree', 'atkinson_hyperlegible'];

export const makeAccount = ({ rawQuery, nowFn, mailer, auth }) => {
  const uid = (caller) => Number(caller.callerUserId);

  const getAccount = async ({ caller }) => {
    const u = await findUserById(uid(caller), rawQuery);
    if (!u) throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found');
    const memberships = await listMemberships(u.id, rawQuery);
    const { rows: consents } = await rawQuery(
      `SELECT DISTINCT ON (consent_consent_type) consent_consent_type AS type, consent_granted AS granted, consent_recorded_at AS "recordedAt"
         FROM identity.consent WHERE consent_user_account_id=$1 ORDER BY consent_consent_type, consent_recorded_at DESC`, [u.id]);
    return {
      code: Number(u.code), email: u.email, displayName: u.displayName, status: u.status, isGuest: u.status === 'guest',
      emailVerified: !!u.emailVerifiedAt, hasPassword: !!u.passwordHash, locale: u.locale, timezone: u.timezone,
      createdAt: u.createdAt, deletionScheduledFor: u.deletionScheduledFor,
      memberships: memberships.map((m) => ({ ...m, current: Number(m.organizationId) === Number(caller.callerOrganizationId) })),
      consents,
    };
  };

  const updateAccount = async ({ caller, displayName, locale, timezone }) => {
    if (timezone) {
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new DomainError('ACCOUNT_TIMEZONE_INVALID', 'Invalid timezone'); }
    }
    if (locale && !['tr', 'en'].includes(locale)) throw new DomainError('ACCOUNT_LOCALE_INVALID', 'Invalid locale');
    await rawQuery(
      `UPDATE identity.user_account SET user_account_display_name = COALESCE($2, user_account_display_name), user_account_locale = COALESCE($3, user_account_locale),
              user_account_timezone = COALESCE($4, user_account_timezone) WHERE user_account_id=$1`,
      [uid(caller), displayName ? String(displayName).trim().slice(0, 100) : null, locale || null, timezone || null]);
    return getAccount({ caller });
  };

  const setPassword = async ({ caller, currentPassword, newPassword }) => {
    if (!auth.passwordOk(newPassword)) throw new DomainError('PASSWORD_WEAK', 'Password must be at least 8 characters');
    const u = await findUserById(uid(caller), rawQuery);
    if (u.status === 'guest') throw new DomainError('ACCOUNT_GUEST_FORBIDDEN', 'Register first', undefined, 403);
    if (u.passwordHash && !(await bcrypt.compare(String(currentPassword || ''), u.passwordHash))) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Current password is wrong', undefined, 401);
    }
    await rawQuery(`UPDATE identity.user_account SET user_account_password_hash=$2, user_account_password_set_at=now() WHERE user_account_id=$1`, [u.id, await bcrypt.hash(newPassword, 10)]);
    await writeAudit({ caller, action: 'identity.password.set', schema: 'identity', table: 'user_account', entityCode: Number(u.code) });
    return { ok: true };
  };

  // ── Tercihler ──
  const getPreferences = async ({ caller }) => {
    const { rows } = await rawQuery(
      `SELECT user_preference_theme AS theme, user_preference_ui_text_scale AS "uiTextScale", user_preference_reading_font AS "readingFont",
              user_preference_reading_text_scale AS "readingTextScale", user_preference_reading_line_spacing AS "readingLineSpacing",
              user_preference_reduce_motion AS "reduceMotion", user_preference_haptics_enabled AS "hapticsEnabled", user_preference_sound_enabled AS "soundEnabled",
              user_preference_keyboard_shortcuts_enabled AS "keyboardShortcutsEnabled", user_preference_show_exam_timer AS "showExamTimer"
         FROM identity.user_preference WHERE user_preference_user_account_id=$1`, [uid(caller)]);
    return rows[0];
  };
  const updatePreferences = async ({ caller, ...b }) => {
    if (b.theme !== undefined && !THEMES.includes(b.theme)) throw new DomainError('PREFERENCE_INVALID', 'Invalid theme');
    if (b.readingFont !== undefined && !FONTS.includes(b.readingFont)) throw new DomainError('PREFERENCE_INVALID', 'Invalid font');
    const clamp = (v, lo, hi) => (v === undefined ? null : Math.max(lo, Math.min(hi, Number(v) | 0)));
    const bool = (v) => (v === undefined ? null : !!v);
    await rawQuery(
      `UPDATE identity.user_preference SET
         user_preference_theme = COALESCE($2, user_preference_theme), user_preference_ui_text_scale = COALESCE($3, user_preference_ui_text_scale),
         user_preference_reading_font = COALESCE($4, user_preference_reading_font), user_preference_reading_text_scale = COALESCE($5, user_preference_reading_text_scale),
         user_preference_reading_line_spacing = COALESCE($6, user_preference_reading_line_spacing), user_preference_reduce_motion = COALESCE($7, user_preference_reduce_motion),
         user_preference_haptics_enabled = COALESCE($8, user_preference_haptics_enabled), user_preference_sound_enabled = COALESCE($9, user_preference_sound_enabled),
         user_preference_keyboard_shortcuts_enabled = COALESCE($10, user_preference_keyboard_shortcuts_enabled), user_preference_show_exam_timer = COALESCE($11, user_preference_show_exam_timer)
       WHERE user_preference_user_account_id=$1`,
      [uid(caller), b.theme ?? null, clamp(b.uiTextScale, -1, 2), b.readingFont ?? null, clamp(b.readingTextScale, -1, 2), clamp(b.readingLineSpacing, 0, 1),
        bool(b.reduceMotion), bool(b.hapticsEnabled), bool(b.soundEnabled), bool(b.keyboardShortcutsEnabled), bool(b.showExamTimer)]);
    return getPreferences({ caller });
  };

  const NP_SELECT = `SELECT preference_daily_reminder_enabled AS "dailyReminderEnabled", to_char(preference_daily_reminder_time,'HH24:MI') AS "dailyReminderTime",
         preference_review_reminders_enabled AS "reviewRemindersEnabled", preference_mock_suggestions_enabled AS "mockSuggestionsEnabled",
         preference_weekly_report_email_enabled AS "weeklyReportEmailEnabled", to_char(preference_quiet_hours_start,'HH24:MI') AS "quietHoursStart",
         to_char(preference_quiet_hours_end,'HH24:MI') AS "quietHoursEnd" FROM notify.preference WHERE preference_user_account_id=$1`;
  const getNotificationPrefs = async ({ caller }) => (await rawQuery(NP_SELECT, [uid(caller)])).rows[0];
  const timeOk = (v) => v === undefined || v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const updateNotificationPrefs = async ({ caller, ...b }) => {
    if (![b.dailyReminderTime, b.quietHoursStart, b.quietHoursEnd].every(timeOk)) throw new DomainError('PREFERENCE_INVALID', 'Invalid time');
    const bool = (v) => (v === undefined ? null : !!v);
    await rawQuery(
      `UPDATE notify.preference SET preference_daily_reminder_enabled = COALESCE($2, preference_daily_reminder_enabled),
         preference_daily_reminder_time = COALESCE($3::time, preference_daily_reminder_time), preference_review_reminders_enabled = COALESCE($4, preference_review_reminders_enabled),
         preference_mock_suggestions_enabled = COALESCE($5, preference_mock_suggestions_enabled), preference_weekly_report_email_enabled = COALESCE($6, preference_weekly_report_email_enabled),
         preference_quiet_hours_start = COALESCE($7::time, preference_quiet_hours_start), preference_quiet_hours_end = COALESCE($8::time, preference_quiet_hours_end)
       WHERE preference_user_account_id=$1`,
      [uid(caller), bool(b.dailyReminderEnabled), b.dailyReminderTime ?? null, bool(b.reviewRemindersEnabled), bool(b.mockSuggestionsEnabled),
        bool(b.weeklyReportEmailEnabled), b.quietHoursStart ?? null, b.quietHoursEnd ?? null]);
    return getNotificationPrefs({ caller });
  };

  const registerDevice = async ({ caller, platform, tokenProvider = 'expo', pushToken, appVersion, deviceName, locale, permissionGranted }) => {
    if (!['web', 'ios', 'android'].includes(platform)) throw new DomainError('DEVICE_INVALID', 'Invalid platform');
    if (!pushToken || String(pushToken).length > 400) throw new DomainError('DEVICE_INVALID', 'Invalid token');
    const tenantCode = await getTenantCode(rawQuery);
    await rawQuery(
      `INSERT INTO notify.device (device_tenant_code, device_organization_id, device_user_account_id, device_platform, device_token_provider, device_push_token,
                                  device_app_version, device_device_name, device_locale, device_permission_granted, device_last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (device_push_token) DO UPDATE SET device_user_account_id=EXCLUDED.device_user_account_id, device_organization_id=EXCLUDED.device_organization_id,
         device_app_version=EXCLUDED.device_app_version, device_permission_granted=EXCLUDED.device_permission_granted, device_last_seen_at=now(), device_disabled_at=NULL, device_disabled_reason=NULL`,
      [tenantCode, caller.callerOrganizationId, uid(caller), platform, tokenProvider, pushToken, appVersion || null, deviceName || null, locale || null, permissionGranted ?? null]);
    return { ok: true };
  };
  const removeDevice = async ({ caller, pushToken }) => {
    await rawQuery(`UPDATE notify.device SET device_disabled_at=now(), device_disabled_reason='user' WHERE device_push_token=$1 AND device_user_account_id=$2`, [pushToken, uid(caller)]);
    return { ok: true };
  };

  // ── Onaylar ──
  const listConsents = async ({ caller }) => (await rawQuery(
    `SELECT DISTINCT ON (consent_consent_type) consent_consent_type AS type, consent_granted AS granted, consent_recorded_at AS "recordedAt"
       FROM identity.consent WHERE consent_user_account_id=$1 ORDER BY consent_consent_type, consent_recorded_at DESC`, [uid(caller)])).rows;
  const recordConsent = async ({ caller, type, granted, platform }) => {
    if (!['kvkk_notice', 'terms_of_use', 'marketing_email'].includes(type)) throw new DomainError('CONSENT_TYPE_INVALID', 'Invalid consent type');
    const u = await findUserById(uid(caller), rawQuery);
    const tenantCode = await getTenantCode(rawQuery);
    await rawQuery(
      `INSERT INTO identity.consent (consent_tenant_code, consent_organization_id, consent_user_account_id, consent_subject_hash, consent_consent_type, consent_granted,
                                     consent_legal_document_id, consent_source_platform, consent_ip)
       VALUES ($1,$2,$3,$4,$5::varchar,$6,(SELECT legal_document_id FROM identity.legal_document WHERE legal_document_doc_type=$5 AND legal_document_is_current LIMIT 1),$7,$8)`,
      [tenantCode, caller.callerOrganizationId, u.id, subjectHash(u.emailNormalized || u.code), type, !!granted, ['web', 'ios', 'android'].includes(platform) ? platform : null, caller.callerIp]);
    return listConsents({ caller });
  };

  // ── Hesap silme (§2.10) ──
  const requestDeletionCode = async ({ caller }) => {
    const u = await findUserById(uid(caller), rawQuery);
    if (!u.email) throw new DomainError('ACCOUNT_GUEST_FORBIDDEN', 'Register first', undefined, 403);
    return auth.sendCode({ email: u.email, purpose: 'account_deletion', userId: u.id, ip: caller.callerIp });
  };
  const requestDeletion = async ({ caller, code }) => {
    const u = await findUserById(uid(caller), rawQuery);
    if (!u.email) throw new DomainError('ACCOUNT_GUEST_FORBIDDEN', 'Register first', undefined, 403);
    let scheduled;
    await auth.withCode(u.email, 'account_deletion', code, async (tx) => {
      const r = await tx.query(
        `UPDATE identity.user_account SET user_account_status='pending_deletion', user_account_deletion_requested_at=now(),
                user_account_deletion_scheduled_for = now() + ($2 || ' days')::interval WHERE user_account_id=$1 RETURNING user_account_deletion_scheduled_for AS at`,
        [u.id, String(DELETION_GRACE_DAYS)]);
      scheduled = r.rows[0].at;
    });
    await revokeAllSessionsForUser({ userId: String(u.id) }).catch(() => {});
    await writeAudit({ caller, action: 'identity.account.deletion_requested', schema: 'identity', table: 'user_account', entityCode: Number(u.code) });
    mailer.send({ to: u.email, ...render('deletion_requested', { date: new Date(scheduled).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }), appUrl: appUrl() }) }).catch(() => {});
    return { scheduledFor: scheduled };
  };

  // ── Veri talebi (§11.14) ──
  const requestDataExport = async ({ caller }) => {
    const tenantCode = await getTenantCode(rawQuery);
    const { rows: open } = await rawQuery(
      `SELECT data_export_request_code AS code, data_export_request_status AS status FROM identity.data_export_request
        WHERE data_export_request_user_account_id=$1 AND data_export_request_status IN ('requested','processing') LIMIT 1`, [uid(caller)]);
    if (open[0]) return { code: Number(open[0].code), status: open[0].status };
    const r = await rawQuery(
      `INSERT INTO identity.data_export_request (data_export_request_tenant_code, data_export_request_organization_id, data_export_request_user_account_id)
       VALUES ($1,$2,$3) RETURNING data_export_request_code AS code`, [tenantCode, caller.callerOrganizationId, uid(caller)]);
    return { code: Number(r.rows[0].code), status: 'requested' };
  };
  const getDataExport = async ({ caller }) => {
    const { rows } = await rawQuery(
      `SELECT data_export_request_code AS code, data_export_request_status AS status, data_export_request_requested_at AS "requestedAt",
              data_export_request_completed_at AS "completedAt", data_export_request_expires_at AS "expiresAt"
         FROM identity.data_export_request WHERE data_export_request_user_account_id=$1 ORDER BY data_export_request_id DESC LIMIT 1`, [uid(caller)]);
    return rows[0] || null;
  };

  /** cron: kullanıcının tüm tablolarını JSON'a dök → storage.blob → e-posta bağlantısı. */
  const processDataExports = async () => {
    const { rows } = await rawQuery(
      `SELECT data_export_request_id AS id, data_export_request_code AS code, data_export_request_user_account_id AS "userId", data_export_request_organization_id AS "orgId"
         FROM identity.data_export_request WHERE data_export_request_status='requested' ORDER BY data_export_request_id LIMIT 5`);
    let changed = 0;
    for (const r of rows) {
      try {
        await rawQuery(`UPDATE identity.data_export_request SET data_export_request_status='processing' WHERE data_export_request_id=$1`, [r.id]);
        const u = await findUserById(r.userId, rawQuery);
        const { rows: tbls } = await rawQuery(
          `SELECT table_schema AS s, table_name AS t, column_name AS c FROM information_schema.columns
            WHERE table_schema IN ('identity','notify','learning','tutor','billing') AND column_name LIKE '%\\_user\\_account\\_id' ESCAPE '\\'
              AND column_name = table_name || '_user_account_id' ORDER BY 1,2`);
        const data = { exportedAt: nowFn().toISOString(), account: { email: u.email, displayName: u.displayName, createdAt: u.createdAt } };
        for (const t of tbls) {
          const q = await rawQuery(`SELECT * FROM ${t.s}.${t.t} WHERE ${t.c} = $1 LIMIT 50000`, [r.userId]);
          const cleaned = q.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !/(_hash|_token|_push_token|password)/.test(k))));
          if (cleaned.length) data[`${t.s}.${t.t}`] = cleaned;
        }
        const token = randomToken(24);
        const buf = Buffer.from(JSON.stringify(data, null, 2));
        const blob = await storagePut({ key: `exports/${r.code}.json`, contentType: 'application/json', data: buf, ownerSchema: 'identity', ownerCode: r.code, organizationId: r.orgId, expiresAt: new Date(nowFn().getTime() + 48 * 3600 * 1000) });
        await rawQuery(
          `UPDATE identity.data_export_request SET data_export_request_status='ready', data_export_request_completed_at=now(), data_export_request_expires_at = now() + interval '48 hours',
                  data_export_request_blob_id=$2, data_export_request_download_token_hash=$3 WHERE data_export_request_id=$1`, [r.id, blob.id, sha256(token)]);
        const url = `${gatewayUrl()}/api/sinav-service-identity/v1/public/data-exports/${token}`;
        if (u.email) await mailer.send({ to: u.email, ...render('data_export_ready', { url }) });
        changed += 1;
      } catch (e) {
        console.error('[identity] data export failed', r.code, e.message);
        await rawQuery(`UPDATE identity.data_export_request SET data_export_request_status='failed', data_export_request_error=$2 WHERE data_export_request_id=$1`, [r.id, e.message.slice(0, 500)]);
      }
    }
    return { changed };
  };
  const downloadDataExport = async ({ token }) => {
    const { rows } = await rawQuery(
      `SELECT b.blob_data AS data FROM identity.data_export_request d JOIN storage.blob b ON b.blob_id = d.data_export_request_blob_id
        WHERE d.data_export_request_download_token_hash=$1 AND d.data_export_request_status='ready' AND d.data_export_request_expires_at > now()`, [sha256(String(token))]);
    if (!rows.length) throw new DomainError('EXPORT_NOT_FOUND', 'Export not found or expired');
    return rows[0].data;
  };

  /** cron: süresi dolan silme talepleri ve misafirler → kişisel organizasyon silinir (CASCADE). */
  const purgeAccounts = async () => {
    const { rows } = await rawQuery(
      `SELECT user_account_id AS id, user_account_organization_id AS "orgId", user_account_status AS status FROM identity.user_account
        WHERE (user_account_status='pending_deletion' AND user_account_deletion_scheduled_for <= now())
           OR (user_account_status='guest' AND user_account_guest_expires_at <= now()) LIMIT 200`);
    let changed = 0;
    for (const r of rows) {
      try {
        await withTransaction(async (tx) => {
          await tx.query(`DELETE FROM identity.organization WHERE organization_id=$1 AND organization_type='individual'`, [r.orgId]);
        });
        changed += 1;
      } catch (e) {
        console.error('[identity] purge failed', r.id, e.message);
      }
    }
    return { changed };
  };

  return Object.freeze({
    getAccount, updateAccount, setPassword, getPreferences, updatePreferences, getNotificationPrefs, updateNotificationPrefs, registerDevice, removeDevice,
    listConsents, recordConsent, requestDeletionCode, requestDeletion, requestDataExport, getDataExport, processDataExports, downloadDataExport, purgeAccounts,
  });
};
