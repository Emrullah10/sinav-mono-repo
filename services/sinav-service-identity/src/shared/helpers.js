import crypto from 'node:crypto';
import { rawQuery } from 'app-shared';

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
export const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
export const subjectHash = (v) => sha256(`sinav:${v}`);
export const TENANT_SLUG = 'sinav';
export const GUEST_TTL_DAYS = 30;
export const DELETION_GRACE_DAYS = 30;

export const getTenantCode = async (run = rawQuery) => {
  const { rows } = await run(`SELECT tenant_code AS code FROM identity.tenant WHERE tenant_slug = $1`, [TENANT_SLUG]);
  if (!rows.length) throw new Error('tenant bulunamadı (10-seed-data uygulandı mı?)');
  return rows[0].code;
};

export const permissionsForRole = async (role, run = rawQuery) => {
  const { rows } = await run(
    `SELECT role_permission_permission AS p FROM enums.role_permission WHERE role_permission_role = $1 ORDER BY 1`, [role]);
  return rows.map((r) => r.p);
};

const USER_SELECT = `
  SELECT u.user_account_id AS id, u.user_account_code AS code, u.user_account_tenant_code AS "tenantCode",
         u.user_account_organization_id AS "personalOrgId", u.user_account_status AS status, u.user_account_email AS email,
         u.user_account_email_normalized AS "emailNormalized", u.user_account_email_verified_at AS "emailVerifiedAt",
         u.user_account_display_name AS "displayName", u.user_account_password_hash AS "passwordHash",
         u.user_account_failed_login_count AS "failedLoginCount", u.user_account_locked_until AS "lockedUntil",
         u.user_account_locale AS locale, u.user_account_timezone AS timezone,
         u.user_account_deletion_scheduled_for AS "deletionScheduledFor", u.user_account_created_at AS "createdAt"
    FROM identity.user_account u`;

export const findUserById = async (id, run = rawQuery) =>
  (await run(`${USER_SELECT} WHERE u.user_account_id = $1`, [id])).rows[0] || null;
export const findUserByEmail = async (emailNormalized, tenantCode, run = rawQuery) =>
  (await run(`${USER_SELECT} WHERE u.user_account_email_normalized = $1 AND u.user_account_tenant_code = $2`, [emailNormalized, tenantCode])).rows[0] || null;

export const defaultMembership = async (userId, run = rawQuery, membershipCode = null) => {
  const { rows } = await run(
    `SELECT m.membership_id AS id, m.membership_code AS code, m.membership_role AS role, m.membership_organization_id AS "organizationId",
            m.membership_is_default AS "isDefault", o.organization_type AS "organizationType", o.organization_name AS "organizationName"
       FROM identity.membership m JOIN identity.organization o ON o.organization_id = m.membership_organization_id
      WHERE m.membership_user_account_id = $1 AND m.membership_status = 'active'
        AND ($2::bigint IS NULL OR m.membership_code = $2)
      ORDER BY m.membership_is_default DESC, m.membership_id LIMIT 1`, [userId, membershipCode]);
  return rows[0] || null;
};

export const listMemberships = async (userId, run = rawQuery) =>
  (await run(
    `SELECT m.membership_code AS code, m.membership_role AS role, m.membership_is_default AS "isDefault",
            o.organization_type AS "organizationType", o.organization_name AS "organizationName", m.membership_organization_id AS "organizationId"
       FROM identity.membership m JOIN identity.organization o ON o.organization_id = m.membership_organization_id
      WHERE m.membership_user_account_id = $1 AND m.membership_status = 'active' ORDER BY m.membership_is_default DESC, m.membership_id`, [userId])).rows;

/** Gateway'in oturum açtığı yanıt gövdesi (şablon §8.12). */
export const buildSessionPayload = async (userId, { membershipCode = null, run = rawQuery } = {}) => {
  const user = await findUserById(userId, run);
  const m = await defaultMembership(userId, run, membershipCode);
  if (!user || !m) throw new Error('user/membership missing');
  const rolePermissionList = await permissionsForRole(m.role, run);
  return {
    user: {
      userAccountId: Number(user.id),
      userAccountCode: Number(user.code),
      userAccountTenantCode: Number(user.tenantCode),
      userAccountOrganizationId: Number(m.organizationId),
      userAccountRole: m.role,
      userAccountOrganizationType: m.organizationType,
      membershipCode: Number(m.code),
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      isGuest: user.status === 'guest',
      locale: user.locale,
      timezone: user.timezone,
    },
    rolePermissionList,
  };
};

let platformOrg;
export const getPlatformOrgId = async (run = rawQuery) => {
  if (platformOrg) return platformOrg;
  const { rows } = await run(`SELECT organization_id AS id FROM identity.organization WHERE organization_type='platform' ORDER BY organization_id LIMIT 1`);
  if (!rows.length) throw new Error('platform organizasyonu yok');
  platformOrg = Number(rows[0].id);
  return platformOrg;
};
