-- =====================================================
-- Mandatory bootstrap data: the single tenant and the platform organization.
-- Everything else (product catalog, exam content, staff, legal texts) is seeded
-- by the node seed script (npm run seed). Idempotent.
-- =====================================================
INSERT INTO identity.tenant (tenant_name, tenant_slug)
VALUES ('Sinav', 'sinav')
ON CONFLICT ON CONSTRAINT uq_tenant_slug DO NOTHING;

INSERT INTO identity.organization (organization_tenant_code, organization_type, organization_name, organization_slug)
SELECT t.tenant_code, 'platform', 'Sinav Platform', 'platform'
FROM identity.tenant t
WHERE t.tenant_slug = 'sinav'
  AND NOT EXISTS (
      SELECT 1 FROM identity.organization o
      WHERE o.organization_tenant_code = t.tenant_code AND o.organization_type = 'platform'
  );
