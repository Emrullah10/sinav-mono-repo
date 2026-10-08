-- P0 başlangıç şeması: 02-storage-schema.sql (docs/PLAN-P0.md §2).
--
-- NEDEN: çalışan veritabanlarının taze kurulumla aynı şemaya ulaşması.
-- Idempotent değil; defter (public.schema_migrations) her dosyayı bir kez çalıştırır.
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-08-3-p0-storage.sql
BEGIN;

-- =====================================================
-- SCHEMA: storage
-- Purpose: Persistent blob storage (db:// scheme; template section 11.3)
-- Comes before content/billing because they hold FKs to it.
-- =====================================================
CREATE SCHEMA IF NOT EXISTS storage;

-- -----------------------------------------------------
-- Table: storage.blob
-- Purpose: Persistent byte store behind the db:// storage scheme.
-- -----------------------------------------------------
CREATE TABLE storage.blob (
    blob_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    blob_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    blob_tenant_code BIGINT NOT NULL,
    blob_organization_id BIGINT,
    blob_key VARCHAR(200) NOT NULL,
    blob_content_type VARCHAR(120) NOT NULL,
    blob_byte_size BIGINT NOT NULL,
    blob_sha256 VARCHAR(64) NOT NULL,
    blob_data BYTEA NOT NULL,
    blob_owner_schema VARCHAR(40) NOT NULL,
    blob_owner_code BIGINT,
    blob_expires_at TIMESTAMP WITH TIME ZONE,
    blob_metadata JSONB NOT NULL DEFAULT '{}',
    blob_created_by BIGINT,
    blob_updated_by BIGINT,
    blob_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    blob_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_blob_tenant FOREIGN KEY (blob_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_blob_organization FOREIGN KEY (blob_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL,
    CONSTRAINT fk_blob_created_by FOREIGN KEY (blob_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_blob_updated_by FOREIGN KEY (blob_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_blob_key UNIQUE (blob_key),
    CONSTRAINT chk_blob_byte_size CHECK (blob_byte_size >= 0)
);

CREATE INDEX idx_blob_owner ON storage.blob(blob_owner_schema, blob_owner_code);
CREATE INDEX idx_blob_expires_at ON storage.blob(blob_expires_at);
CREATE INDEX idx_blob_tenant_code ON storage.blob(blob_tenant_code);
CREATE INDEX idx_blob_organization_id ON storage.blob(blob_organization_id);
CREATE INDEX idx_blob_created_by ON storage.blob(blob_created_by);
CREATE INDEX idx_blob_updated_by ON storage.blob(blob_updated_by);

CREATE TRIGGER trg_blob_updated_at BEFORE UPDATE ON storage.blob
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('blob_updated_at');

-- =====================================================
-- Forward FK from identity (identity is created first)
-- =====================================================
ALTER TABLE identity.data_export_request
    ADD CONSTRAINT fk_data_export_request_blob FOREIGN KEY (data_export_request_blob_id) REFERENCES storage.blob(blob_id) ON DELETE SET NULL;


COMMIT;
