import { rawQuery } from './tx.js';

// Denetim izi: audit.event (yazım app-shared'den; şablon §4.1 (a) yolu). Best-effort: hata ana işi bozmaz.
export const writeAudit = async (
  { caller, action, schema, table, entityCode = null, before = null, after = null, requestId = null },
  { tx } = {},
) => {
  const run = tx ? (s, p) => tx.query(s, p) : rawQuery;
  try {
    await run(
      `INSERT INTO audit.event (event_tenant_code, event_organization_id, event_actor_user_account_id, event_actor_role,
                                event_action, event_entity_schema, event_entity_table, event_entity_code,
                                event_before, event_after, event_ip, event_request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        Number(caller?.callerTenantCode) || 1,
        Number(caller?.callerOrganizationId) || null,
        Number(caller?.callerUserId) || null,
        caller?.callerUserRole || null,
        action, schema, table, entityCode,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        caller?.callerIp || null,
        requestId,
      ],
    );
  } catch (error) {
    console.error('[audit] yazılamadı', action, error.message);
  }
};
