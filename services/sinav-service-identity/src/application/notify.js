import { DomainError } from 'app-shared';
import { render } from '../shared/email-templates.js';
import { findUserById } from '../shared/helpers.js';

const EMAIL_KINDS = new Set(['payment_receipt', 'payment_failed', 'trial_ending', 'subscription_canceled', 'exam_7_days', 'deletion_requested', 'data_export_ready', 'welcome']);
const appUrl = () => process.env.PUBLIC_APP_BASE_URL || 'http://127.0.0.1:3000';

export const makeNotify = ({ rawQuery, nowFn, mailer }) => {
  /** Dahili: diğer servisler `POST /v1/internal/notifications` ile çağırır. */
  const enqueue = async ({ userAccountId, kind, title, body, deepLink = null, payload = {}, dedupeKey, scheduledFor = null, channels = null }) => {
    if (!userAccountId || !kind || !title || !body) throw new DomainError('NOTIFICATION_INVALID', 'userAccountId, kind, title, body required');
    const u = await findUserById(Number(userAccountId), rawQuery);
    if (!u) throw new DomainError('ACCOUNT_NOT_FOUND', 'Account not found');
    const dk = dedupeKey || `${kind}:${nowFn().toISOString()}`;
    const ins = await rawQuery(
      `INSERT INTO notify.notification (notification_tenant_code, notification_organization_id, notification_user_account_id, notification_kind, notification_title,
                                        notification_body, notification_deep_link, notification_payload, notification_dedupe_key, notification_scheduled_for)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::timestamptz, now()))
       ON CONFLICT (notification_user_account_id, notification_dedupe_key) DO NOTHING RETURNING notification_id AS id`,
      [u.tenantCode, u.personalOrgId, u.id, kind, String(title).slice(0, 80), String(body).slice(0, 200), deepLink, JSON.stringify(payload), dk, scheduledFor]);
    if (!ins.rows.length) return { created: false };
    const id = ins.rows[0].id;
    const want = new Set(channels || ['in_app', ...(EMAIL_KINDS.has(kind) ? ['email'] : [])]);
    const rows = [];
    const add = (channel, deviceId, status) => rows.push([u.tenantCode, u.personalOrgId, id, channel, deviceId, status]);
    if (want.has('in_app')) add('in_app', null, 'sent');
    if (want.has('email') && u.email) add('email', null, 'queued');
    if (want.has('push')) {
      const { rows: devs } = await rawQuery(`SELECT device_id AS id FROM notify.device WHERE device_user_account_id=$1 AND device_disabled_at IS NULL AND device_permission_granted IS NOT FALSE`, [u.id]);
      for (const d of devs) add('push', d.id, 'queued');
    }
    for (const r of rows) {
      await rawQuery(
        `INSERT INTO notify.delivery (delivery_tenant_code, delivery_organization_id, delivery_notification_id, delivery_channel, delivery_device_id, delivery_status, delivery_sent_at)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6='sent' THEN now() END)`, r);
    }
    return { created: true, notificationId: Number(id) };
  };

  /** cron (her dakika): kuyruktaki e-posta ve push teslimatlarını işler. */
  const processDeliveries = async () => {
    const { rows } = await rawQuery(
      `SELECT d.delivery_id AS id, d.delivery_channel AS channel, d.delivery_attempt_count AS attempts,
              n.notification_kind AS kind, n.notification_title AS title, n.notification_body AS body, n.notification_deep_link AS link, n.notification_payload AS payload,
              u.user_account_email AS email
         FROM notify.delivery d JOIN notify.notification n ON n.notification_id = d.delivery_notification_id
         JOIN identity.user_account u ON u.user_account_id = n.notification_user_account_id
        WHERE d.delivery_status='queued' AND n.notification_scheduled_for <= now() AND (d.delivery_next_attempt_at IS NULL OR d.delivery_next_attempt_at <= now())
        ORDER BY d.delivery_id LIMIT 100`);
    let changed = 0;
    for (const r of rows) {
      try {
        if (r.channel === 'email') {
          const data = { ...(r.payload || {}), title: r.title, body: r.body, link: r.link, appUrl: appUrl() };
          await mailer.send({ to: r.email, ...render(r.kind, data) });
          await rawQuery(`UPDATE notify.delivery SET delivery_status='sent', delivery_sent_at=now(), delivery_attempt_count=delivery_attempt_count+1 WHERE delivery_id=$1`, [r.id]);
        } else {
          await rawQuery(`UPDATE notify.delivery SET delivery_status='skipped_not_configured' WHERE delivery_id=$1`, [r.id]);
        }
        changed += 1;
      } catch (e) {
        const dead = r.attempts + 1 >= 3;
        await rawQuery(
          `UPDATE notify.delivery SET delivery_attempt_count=delivery_attempt_count+1, delivery_status=$2, delivery_error_code=$3,
                  delivery_next_attempt_at = now() + interval '5 minutes' WHERE delivery_id=$1`, [r.id, dead ? 'failed' : 'queued', String(e.code || e.message).slice(0, 80)]);
      }
    }
    return { changed };
  };

  const listNotifications = async ({ caller, limit = 50 }) => (await rawQuery(
    `SELECT n.notification_code AS code, n.notification_kind AS kind, n.notification_title AS title, n.notification_body AS body, n.notification_deep_link AS "deepLink",
            n.notification_created_at AS "createdAt", n.notification_read_at AS "readAt"
       FROM notify.notification n JOIN notify.delivery d ON d.delivery_notification_id = n.notification_id AND d.delivery_channel='in_app'
      WHERE n.notification_user_account_id=$1 AND n.notification_scheduled_for <= now() ORDER BY n.notification_id DESC LIMIT $2`, [caller.callerUserId, Math.min(100, Number(limit) || 50)])).rows;
  const markOpened = async ({ caller, code }) => {
    await rawQuery(`UPDATE notify.notification SET notification_opened_at = COALESCE(notification_opened_at, now()), notification_read_at = COALESCE(notification_read_at, now())
                     WHERE notification_code=$1 AND notification_user_account_id=$2`, [Number(code), caller.callerUserId]);
    return { ok: true };
  };

  return Object.freeze({ enqueue, processDeliveries, listNotifications, markOpened });
};
