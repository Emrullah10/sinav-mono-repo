-- =====================================================
-- SINAV Superadmin user: TEMPLATE (manual run, intentionally commented out)
-- =====================================================
-- Superadmins are never auto-seeded and no API path can create or upgrade one:
--   (1) no credentials in the repo or its history,
--   (2) a smaller privilege-escalation surface,
--   (3) every environment has its own platform admins.
--
-- HOW TO RUN (connected to `sinav` as SUPERUSER):
--   1) Uncomment the block below and set the e-mail (login is by e-mail code; there is no password).
--   2) Execute it. Verify:
--        SELECT u.user_account_email, m.membership_role, u.user_account_status
--        FROM identity.user_account u JOIN identity.membership m ON m.membership_user_account_id = u.user_account_id
--        WHERE m.membership_role = 'superadmin';
--   3) The admin signs in via the e-mail code flow; the superadmin membership is on the platform org.
--
-- SECURITY: do not commit with the block uncommented. To revoke, set status to 'suspended'
-- and membership status to 'revoked'; never delete the row (audit trail).
-- =====================================================

/*
WITH t AS (SELECT tenant_code FROM identity.tenant WHERE tenant_slug = 'sinav'),
p AS (
    SELECT o.organization_id, o.organization_tenant_code
    FROM identity.organization o JOIN t ON t.tenant_code = o.organization_tenant_code
    WHERE o.organization_type = 'platform'
),
personal AS (
    INSERT INTO identity.organization (organization_tenant_code, organization_type, organization_name)
    SELECT organization_tenant_code, 'individual', 'CHANGE_ME Admin' FROM p
    RETURNING organization_id, organization_tenant_code
),
u AS (
    INSERT INTO identity.user_account (
        user_account_tenant_code, user_account_organization_id, user_account_status,
        user_account_email, user_account_email_normalized, user_account_email_verified_at, user_account_display_name)
    SELECT organization_tenant_code, organization_id, 'active',
           'CHANGE_ME_admin@example.com', 'change_me_admin@example.com', now(), 'Platform Admin'
    FROM personal
    RETURNING user_account_id, user_account_tenant_code
)
INSERT INTO identity.membership (
    membership_tenant_code, membership_organization_id, membership_user_account_id,
    membership_role, membership_status, membership_is_default, membership_joined_at)
SELECT u.user_account_tenant_code, p.organization_id, u.user_account_id, 'superadmin', 'active', true, now()
FROM u CROSS JOIN p;
*/
