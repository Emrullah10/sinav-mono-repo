// Gateway → Identity service-to-service çağrı.
// Fire-and-forget audit endpoint'leri için kullanılır.
// INTERNAL_API_KEY ile authenticate edilir.

const IDENTITY_BASE_PATH = '/api/sinav-service-identity';

const getIdentityBaseUrl = () => {
  const url =
    process.env.SERVICE_IDENTITY_REST_URL ||
    process.env.IDENTITY_REST_URL ||
    'http://127.0.0.1:2001';
  return url.replace(/\/$/, '');
};

const callIdentity = async ({
  path,
  method = 'POST',
  body,
  callerHeaders = {},
  timeoutMs = 3000,
}) => {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) {
    throw new Error('INTERNAL_API_KEY env required');
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const url = `${getIdentityBaseUrl()}${IDENTITY_BASE_PATH}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': internalKey,
        ...callerHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

const logoutAudit = async ({ caller, ip, userAgent }) => {
  try {
    await callIdentity({
      path: '/v1/auth/logout',
      method: 'POST',
      callerHeaders: {
        userAccountId: String(caller.userId || ''),
        userAccountTenantCode: String(caller.tenantCode || ''),
        userAccountOrganizationId: String(caller.organizationId || ''),
        userAccountRole: String(caller.role || ''),
        userAccountOrganizationType: String(caller.organizationType || ''),
        userAccountSessionId: String(caller.sid || ''),
      },
      body: { ip, userAgent },
    });
  } catch (e) {
    console.error('Logout audit failed (ignored):', e.message);
  }
};

const logoutAllAudit = async ({ caller, ip, userAgent, revokedCount }) => {
  try {
    await callIdentity({
      path: '/v1/auth/logout-all',
      method: 'POST',
      callerHeaders: {
        userAccountId: String(caller.userId || ''),
        userAccountTenantCode: String(caller.tenantCode || ''),
        userAccountOrganizationId: String(caller.organizationId || ''),
        userAccountRole: String(caller.role || ''),
        userAccountOrganizationType: String(caller.organizationType || ''),
        userAccountSessionId: String(caller.sid || ''),
      },
      body: { ip, userAgent, revokedCount },
    });
  } catch (e) {
    console.error('Logout-all audit failed (ignored):', e.message);
  }
};

// SCR-112/115: admin session-revoke audit (by user or by role). Fire-and-forget.
const sessionRevokeAudit = async ({
  caller,
  targetType,
  targetUserId,
  targetRole,
  revokedCount,
  ip,
  userAgent,
}) => {
  try {
    await callIdentity({
      path: '/v1/admin/audit/session-revoke',
      method: 'POST',
      callerHeaders: {
        userAccountId: String(caller.userId || ''),
        userAccountTenantCode: String(caller.tenantCode || ''),
        userAccountOrganizationId: String(caller.organizationId || ''),
        userAccountRole: String(caller.role || ''),
        userAccountOrganizationType: String(caller.organizationType || ''),
        userAccountSessionId: String(caller.sid || ''),
      },
      body: { targetType, targetUserId, targetRole, revokedCount, ip, userAgent },
    });
  } catch (e) {
    console.error('Session-revoke audit failed (ignored):', e.message);
  }
};

export { callIdentity, logoutAudit, logoutAllAudit, sessionRevokeAudit };
