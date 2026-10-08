-- =====================================================
-- SCHEMA: identity
-- Purpose: tenant, organizations, accounts, memberships, auth codes, legal texts, consent, preferences, marketing intake
-- Owner service: identity. Also holds global_code_seq and fn_set_updated_at().
-- Forward FKs (identity.data_export_request -> storage.blob) are in 02-storage-schema.sql;
-- (identity.waitlist_entry -> content.exam) is in 05-content-schema.sql (PLAN 2.13).
-- =====================================================
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Global sequence for all business codes (<table>_code)
CREATE SEQUENCE IF NOT EXISTS public.global_code_seq START 1 INCREMENT 1;

-- Generic updated_at trigger: ONE function for all tables.
-- TG_ARGV[0] = name of the updated_at column (e.g. 'tenant_updated_at').
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW := NEW #= hstore(TG_ARGV[0], now()::TEXT);
    RETURN NEW;
END;
$$;

CREATE SCHEMA IF NOT EXISTS identity;

-- -----------------------------------------------------
-- Table: identity.tenant
-- Purpose: Top-level isolation unit (single row in P0, kept for the multi-tenant model).
-- -----------------------------------------------------
CREATE TABLE identity.tenant (
    tenant_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    tenant_name VARCHAR(200) NOT NULL,
    tenant_slug VARCHAR(100) NOT NULL,
    tenant_status VARCHAR(100) NOT NULL DEFAULT 'active',
    tenant_settings JSONB NOT NULL DEFAULT '{}',
    tenant_metadata JSONB NOT NULL DEFAULT '{}',
    tenant_created_by BIGINT,
    tenant_updated_by BIGINT,
    tenant_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    tenant_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_tenant_status FOREIGN KEY (tenant_status) REFERENCES enums.tenant_status(tenant_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_tenant_slug UNIQUE (tenant_slug)
);

CREATE INDEX idx_tenant_status ON identity.tenant(tenant_status);
CREATE INDEX idx_tenant_created_by ON identity.tenant(tenant_created_by);
CREATE INDEX idx_tenant_updated_by ON identity.tenant(tenant_updated_by);

CREATE TRIGGER trg_tenant_updated_at BEFORE UPDATE ON identity.tenant
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('tenant_updated_at');

-- -----------------------------------------------------
-- Table: identity.organization
-- Purpose: Owner of data: the platform org and one personal org per learner (P2: institutions).
-- -----------------------------------------------------
CREATE TABLE identity.organization (
    organization_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    organization_tenant_code BIGINT NOT NULL,
    organization_type VARCHAR(100) NOT NULL,
    organization_status VARCHAR(100) NOT NULL DEFAULT 'active',
    organization_name VARCHAR(200) NOT NULL,
    organization_slug VARCHAR(100),
    organization_locale VARCHAR(10) NOT NULL DEFAULT 'tr',
    organization_metadata JSONB NOT NULL DEFAULT '{}',
    organization_created_by BIGINT,
    organization_updated_by BIGINT,
    organization_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    organization_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_organization_tenant FOREIGN KEY (organization_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_organization_type FOREIGN KEY (organization_type) REFERENCES enums.organization_type(organization_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_organization_status FOREIGN KEY (organization_status) REFERENCES enums.organization_status(organization_status_value) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX uq_organization_slug ON identity.organization(organization_tenant_code, organization_slug) WHERE organization_slug IS NOT NULL;
CREATE INDEX idx_organization_type ON identity.organization(organization_type);
CREATE INDEX idx_organization_status ON identity.organization(organization_status);
CREATE INDEX idx_organization_created_by ON identity.organization(organization_created_by);
CREATE INDEX idx_organization_updated_by ON identity.organization(organization_updated_by);

CREATE TRIGGER trg_organization_updated_at BEFORE UPDATE ON identity.organization
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('organization_updated_at');

-- -----------------------------------------------------
-- Table: identity.user_account
-- Purpose: Person account (guest, learner, staff); organization_id is the personal org.
-- -----------------------------------------------------
CREATE TABLE identity.user_account (
    user_account_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_account_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    user_account_tenant_code BIGINT NOT NULL,
    user_account_organization_id BIGINT NOT NULL,
    user_account_status VARCHAR(100) NOT NULL DEFAULT 'guest',
    user_account_email VARCHAR(254),
    user_account_email_normalized VARCHAR(254),
    user_account_email_verified_at TIMESTAMP WITH TIME ZONE,
    user_account_display_name VARCHAR(100),
    user_account_password_hash VARCHAR(255),
    user_account_password_set_at TIMESTAMP WITH TIME ZONE,
    user_account_failed_login_count SMALLINT NOT NULL DEFAULT 0,
    user_account_locked_until TIMESTAMP WITH TIME ZONE,
    user_account_locale VARCHAR(10) NOT NULL DEFAULT 'tr',
    user_account_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Istanbul',
    user_account_last_login_at TIMESTAMP WITH TIME ZONE,
    user_account_last_seen_at TIMESTAMP WITH TIME ZONE,
    user_account_guest_expires_at TIMESTAMP WITH TIME ZONE,
    user_account_deletion_requested_at TIMESTAMP WITH TIME ZONE,
    user_account_deletion_scheduled_for TIMESTAMP WITH TIME ZONE,
    user_account_deleted_at TIMESTAMP WITH TIME ZONE,
    user_account_metadata JSONB NOT NULL DEFAULT '{}',
    user_account_created_by BIGINT,
    user_account_updated_by BIGINT,
    user_account_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    user_account_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_account_tenant FOREIGN KEY (user_account_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_user_account_organization FOREIGN KEY (user_account_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_user_account_status FOREIGN KEY (user_account_status) REFERENCES enums.user_account_status(user_account_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_user_account_email_required CHECK (user_account_status IN ('guest','deleted') OR user_account_email_normalized IS NOT NULL),
    CONSTRAINT chk_user_account_deletion CHECK (user_account_status <> 'pending_deletion' OR user_account_deletion_scheduled_for IS NOT NULL),
    CONSTRAINT chk_user_account_failed_login_count CHECK (user_account_failed_login_count >= 0)
);

CREATE UNIQUE INDEX uq_user_account_email ON identity.user_account(user_account_tenant_code, user_account_email_normalized) WHERE user_account_email_normalized IS NOT NULL;
CREATE INDEX idx_user_account_deletion_scheduled_for ON identity.user_account(user_account_deletion_scheduled_for) WHERE user_account_status = 'pending_deletion';
CREATE INDEX idx_user_account_guest_expires_at ON identity.user_account(user_account_guest_expires_at) WHERE user_account_status = 'guest';
CREATE INDEX idx_user_account_organization_id ON identity.user_account(user_account_organization_id);
CREATE INDEX idx_user_account_status ON identity.user_account(user_account_status);
CREATE INDEX idx_user_account_created_by ON identity.user_account(user_account_created_by);
CREATE INDEX idx_user_account_updated_by ON identity.user_account(user_account_updated_by);

CREATE TRIGGER trg_user_account_updated_at BEFORE UPDATE ON identity.user_account
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('user_account_updated_at');

-- -----------------------------------------------------
-- Table: identity.membership
-- Purpose: User membership in an organization with a role (session role and org come from here).
-- -----------------------------------------------------
CREATE TABLE identity.membership (
    membership_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    membership_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    membership_tenant_code BIGINT NOT NULL,
    membership_organization_id BIGINT NOT NULL,
    membership_user_account_id BIGINT NOT NULL,
    membership_role VARCHAR(100) NOT NULL,
    membership_status VARCHAR(100) NOT NULL DEFAULT 'active',
    membership_is_default BOOLEAN NOT NULL DEFAULT false,
    membership_joined_at TIMESTAMP WITH TIME ZONE,
    membership_last_used_at TIMESTAMP WITH TIME ZONE,
    membership_invited_by BIGINT,
    membership_metadata JSONB NOT NULL DEFAULT '{}',
    membership_created_by BIGINT,
    membership_updated_by BIGINT,
    membership_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    membership_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_membership_tenant FOREIGN KEY (membership_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_membership_organization FOREIGN KEY (membership_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_membership_user_account FOREIGN KEY (membership_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_membership_role FOREIGN KEY (membership_role) REFERENCES enums.user_account_role(user_account_role_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_membership_status FOREIGN KEY (membership_status) REFERENCES enums.membership_status(membership_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_membership_invited_by FOREIGN KEY (membership_invited_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_membership_created_by FOREIGN KEY (membership_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_membership_updated_by FOREIGN KEY (membership_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_membership_user_account_organization UNIQUE (membership_user_account_id, membership_organization_id)
);

CREATE UNIQUE INDEX uq_membership_default ON identity.membership(membership_user_account_id) WHERE membership_is_default AND membership_status = 'active';
CREATE INDEX idx_membership_tenant_code ON identity.membership(membership_tenant_code);
CREATE INDEX idx_membership_organization_id ON identity.membership(membership_organization_id);
CREATE INDEX idx_membership_role ON identity.membership(membership_role);
CREATE INDEX idx_membership_status ON identity.membership(membership_status);
CREATE INDEX idx_membership_invited_by ON identity.membership(membership_invited_by);
CREATE INDEX idx_membership_created_by ON identity.membership(membership_created_by);
CREATE INDEX idx_membership_updated_by ON identity.membership(membership_updated_by);

CREATE TRIGGER trg_membership_updated_at BEFORE UPDATE ON identity.membership
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('membership_updated_at');

-- -----------------------------------------------------
-- Table: identity.external_identity
-- Purpose: Apple/Google subject linked to a user account (table in P0, adapters pending).
-- -----------------------------------------------------
CREATE TABLE identity.external_identity (
    external_identity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    external_identity_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    external_identity_tenant_code BIGINT NOT NULL,
    external_identity_organization_id BIGINT NOT NULL,
    external_identity_user_account_id BIGINT NOT NULL,
    external_identity_provider VARCHAR(100) NOT NULL,
    external_identity_subject VARCHAR(255) NOT NULL,
    external_identity_email VARCHAR(254),
    external_identity_last_used_at TIMESTAMP WITH TIME ZONE,
    external_identity_metadata JSONB NOT NULL DEFAULT '{}',
    external_identity_created_by BIGINT,
    external_identity_updated_by BIGINT,
    external_identity_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    external_identity_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_external_identity_tenant FOREIGN KEY (external_identity_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_external_identity_organization FOREIGN KEY (external_identity_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_external_identity_user_account FOREIGN KEY (external_identity_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_external_identity_provider FOREIGN KEY (external_identity_provider) REFERENCES enums.identity_provider(identity_provider_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_external_identity_created_by FOREIGN KEY (external_identity_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_external_identity_updated_by FOREIGN KEY (external_identity_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_external_identity_provider_subject UNIQUE (external_identity_provider, external_identity_subject)
);

CREATE INDEX idx_external_identity_tenant_code ON identity.external_identity(external_identity_tenant_code);
CREATE INDEX idx_external_identity_organization_id ON identity.external_identity(external_identity_organization_id);
CREATE INDEX idx_external_identity_user_account_id ON identity.external_identity(external_identity_user_account_id);
CREATE INDEX idx_external_identity_created_by ON identity.external_identity(external_identity_created_by);
CREATE INDEX idx_external_identity_updated_by ON identity.external_identity(external_identity_updated_by);

CREATE TRIGGER trg_external_identity_updated_at BEFORE UPDATE ON identity.external_identity
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('external_identity_updated_at');

-- -----------------------------------------------------
-- Table: identity.auth_code
-- Purpose: One-time email login/signup codes (HMAC hash only); unscoped, never readable over HTTP.
-- -----------------------------------------------------
CREATE TABLE identity.auth_code (
    auth_code_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auth_code_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    auth_code_tenant_code BIGINT NOT NULL,
    auth_code_organization_id BIGINT,
    auth_code_email_normalized VARCHAR(254) NOT NULL,
    auth_code_user_account_id BIGINT,
    auth_code_purpose VARCHAR(100) NOT NULL,
    auth_code_code_hash VARCHAR(128) NOT NULL,
    auth_code_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    auth_code_consumed_at TIMESTAMP WITH TIME ZONE,
    auth_code_attempt_count SMALLINT NOT NULL DEFAULT 0,
    auth_code_max_attempts SMALLINT NOT NULL DEFAULT 5,
    auth_code_requested_ip VARCHAR(64),
    auth_code_user_agent VARCHAR(300),
    auth_code_metadata JSONB NOT NULL DEFAULT '{}',
    auth_code_created_by BIGINT,
    auth_code_updated_by BIGINT,
    auth_code_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    auth_code_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_auth_code_tenant FOREIGN KEY (auth_code_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_auth_code_organization FOREIGN KEY (auth_code_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_auth_code_user_account FOREIGN KEY (auth_code_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_auth_code_purpose FOREIGN KEY (auth_code_purpose) REFERENCES enums.auth_code_purpose(auth_code_purpose_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_auth_code_created_by FOREIGN KEY (auth_code_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_auth_code_updated_by FOREIGN KEY (auth_code_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT chk_auth_code_attempts CHECK (auth_code_attempt_count BETWEEN 0 AND auth_code_max_attempts),
    CONSTRAINT chk_auth_code_expiry CHECK (auth_code_expires_at > auth_code_created_at)
);

CREATE INDEX idx_auth_code_email_purpose_created_at ON identity.auth_code(auth_code_email_normalized, auth_code_purpose, auth_code_created_at DESC);
CREATE INDEX idx_auth_code_tenant_code ON identity.auth_code(auth_code_tenant_code);
CREATE INDEX idx_auth_code_organization_id ON identity.auth_code(auth_code_organization_id);
CREATE INDEX idx_auth_code_user_account_id ON identity.auth_code(auth_code_user_account_id);
CREATE INDEX idx_auth_code_purpose ON identity.auth_code(auth_code_purpose);
CREATE INDEX idx_auth_code_created_by ON identity.auth_code(auth_code_created_by);
CREATE INDEX idx_auth_code_updated_by ON identity.auth_code(auth_code_updated_by);

CREATE TRIGGER trg_auth_code_updated_at BEFORE UPDATE ON identity.auth_code
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('auth_code_updated_at');

-- -----------------------------------------------------
-- Table: identity.legal_document
-- Purpose: Versioned legal texts (KVKK, terms, privacy...) per locale.
-- -----------------------------------------------------
CREATE TABLE identity.legal_document (
    legal_document_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legal_document_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    legal_document_tenant_code BIGINT NOT NULL,
    legal_document_organization_id BIGINT NOT NULL,
    legal_document_doc_type VARCHAR(100) NOT NULL,
    legal_document_version VARCHAR(20) NOT NULL,
    legal_document_locale VARCHAR(10) NOT NULL,
    legal_document_title VARCHAR(200) NOT NULL,
    legal_document_summary_md TEXT,
    legal_document_body_md TEXT NOT NULL,
    legal_document_published_at TIMESTAMP WITH TIME ZONE,
    legal_document_is_current BOOLEAN NOT NULL DEFAULT false,
    legal_document_metadata JSONB NOT NULL DEFAULT '{}',
    legal_document_created_by BIGINT,
    legal_document_updated_by BIGINT,
    legal_document_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    legal_document_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_legal_document_tenant FOREIGN KEY (legal_document_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_legal_document_organization FOREIGN KEY (legal_document_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_legal_document_doc_type FOREIGN KEY (legal_document_doc_type) REFERENCES enums.legal_document_type(legal_document_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_legal_document_created_by FOREIGN KEY (legal_document_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_legal_document_updated_by FOREIGN KEY (legal_document_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_legal_document_doc_type_locale_version UNIQUE (legal_document_doc_type, legal_document_locale, legal_document_version)
);

CREATE UNIQUE INDEX uq_legal_document_current ON identity.legal_document(legal_document_doc_type, legal_document_locale) WHERE legal_document_is_current;
CREATE INDEX idx_legal_document_tenant_code ON identity.legal_document(legal_document_tenant_code);
CREATE INDEX idx_legal_document_organization_id ON identity.legal_document(legal_document_organization_id);
CREATE INDEX idx_legal_document_created_by ON identity.legal_document(legal_document_created_by);
CREATE INDEX idx_legal_document_updated_by ON identity.legal_document(legal_document_updated_by);

CREATE TRIGGER trg_legal_document_updated_at BEFORE UPDATE ON identity.legal_document
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('legal_document_updated_at');

-- -----------------------------------------------------
-- Table: identity.consent
-- Purpose: Append-only consent ledger; current consent is the latest row per type. Survives account deletion via subject_hash.
-- -----------------------------------------------------
CREATE TABLE identity.consent (
    consent_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consent_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    consent_tenant_code BIGINT NOT NULL,
    consent_organization_id BIGINT,
    consent_user_account_id BIGINT,
    consent_subject_hash VARCHAR(64) NOT NULL,
    consent_consent_type VARCHAR(100) NOT NULL,
    consent_granted BOOLEAN NOT NULL,
    consent_legal_document_id BIGINT,
    consent_source_platform VARCHAR(100),
    consent_ip VARCHAR(64),
    consent_user_agent VARCHAR(300),
    consent_recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    consent_metadata JSONB NOT NULL DEFAULT '{}',
    consent_created_by BIGINT,
    consent_updated_by BIGINT,
    consent_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    consent_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_consent_tenant FOREIGN KEY (consent_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_consent_organization FOREIGN KEY (consent_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL,
    CONSTRAINT fk_consent_user_account FOREIGN KEY (consent_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_consent_consent_type FOREIGN KEY (consent_consent_type) REFERENCES enums.consent_type(consent_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_consent_legal_document FOREIGN KEY (consent_legal_document_id) REFERENCES identity.legal_document(legal_document_id) ON DELETE RESTRICT,
    CONSTRAINT fk_consent_source_platform FOREIGN KEY (consent_source_platform) REFERENCES enums.client_platform(client_platform_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_consent_created_by FOREIGN KEY (consent_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_consent_updated_by FOREIGN KEY (consent_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL
);

CREATE INDEX idx_consent_user_account_type_recorded_at ON identity.consent(consent_user_account_id, consent_consent_type, consent_recorded_at DESC);
CREATE INDEX idx_consent_subject_hash ON identity.consent(consent_subject_hash);
CREATE INDEX idx_consent_tenant_code ON identity.consent(consent_tenant_code);
CREATE INDEX idx_consent_organization_id ON identity.consent(consent_organization_id);
CREATE INDEX idx_consent_consent_type ON identity.consent(consent_consent_type);
CREATE INDEX idx_consent_legal_document_id ON identity.consent(consent_legal_document_id);
CREATE INDEX idx_consent_source_platform ON identity.consent(consent_source_platform);
CREATE INDEX idx_consent_created_by ON identity.consent(consent_created_by);
CREATE INDEX idx_consent_updated_by ON identity.consent(consent_updated_by);

CREATE TRIGGER trg_consent_updated_at BEFORE UPDATE ON identity.consent
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('consent_updated_at');

-- -----------------------------------------------------
-- Table: identity.user_preference
-- Purpose: Per-user display and reading preferences (1:1).
-- -----------------------------------------------------
CREATE TABLE identity.user_preference (
    user_preference_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_preference_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    user_preference_tenant_code BIGINT NOT NULL,
    user_preference_organization_id BIGINT NOT NULL,
    user_preference_user_account_id BIGINT NOT NULL,
    user_preference_theme VARCHAR(100) NOT NULL DEFAULT 'system',
    user_preference_ui_text_scale SMALLINT NOT NULL DEFAULT 0,
    user_preference_reading_font VARCHAR(100) NOT NULL DEFAULT 'literata',
    user_preference_reading_text_scale SMALLINT NOT NULL DEFAULT 0,
    user_preference_reading_line_spacing SMALLINT NOT NULL DEFAULT 0,
    user_preference_reduce_motion BOOLEAN NOT NULL DEFAULT false,
    user_preference_haptics_enabled BOOLEAN NOT NULL DEFAULT true,
    user_preference_sound_enabled BOOLEAN NOT NULL DEFAULT false,
    user_preference_keyboard_shortcuts_enabled BOOLEAN NOT NULL DEFAULT true,
    user_preference_show_exam_timer BOOLEAN NOT NULL DEFAULT true,
    user_preference_metadata JSONB NOT NULL DEFAULT '{}',
    user_preference_created_by BIGINT,
    user_preference_updated_by BIGINT,
    user_preference_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    user_preference_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_preference_tenant FOREIGN KEY (user_preference_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_user_preference_organization FOREIGN KEY (user_preference_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_user_preference_user_account FOREIGN KEY (user_preference_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_user_preference_theme FOREIGN KEY (user_preference_theme) REFERENCES enums.theme_preference(theme_preference_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_user_preference_reading_font FOREIGN KEY (user_preference_reading_font) REFERENCES enums.reading_font(reading_font_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_user_preference_created_by FOREIGN KEY (user_preference_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_user_preference_updated_by FOREIGN KEY (user_preference_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_user_preference_user_account UNIQUE (user_preference_user_account_id),
    CONSTRAINT chk_user_preference_text_scale CHECK (user_preference_ui_text_scale BETWEEN -1 AND 2 AND user_preference_reading_text_scale BETWEEN -1 AND 2),
    CONSTRAINT chk_user_preference_line_spacing CHECK (user_preference_reading_line_spacing BETWEEN 0 AND 1)
);

CREATE INDEX idx_user_preference_tenant_code ON identity.user_preference(user_preference_tenant_code);
CREATE INDEX idx_user_preference_organization_id ON identity.user_preference(user_preference_organization_id);
CREATE INDEX idx_user_preference_theme ON identity.user_preference(user_preference_theme);
CREATE INDEX idx_user_preference_reading_font ON identity.user_preference(user_preference_reading_font);
CREATE INDEX idx_user_preference_created_by ON identity.user_preference(user_preference_created_by);
CREATE INDEX idx_user_preference_updated_by ON identity.user_preference(user_preference_updated_by);

CREATE TRIGGER trg_user_preference_updated_at BEFORE UPDATE ON identity.user_preference
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('user_preference_updated_at');

-- -----------------------------------------------------
-- Table: identity.data_export_request
-- Purpose: User data export (KVKK) request and its generated blob.
-- -----------------------------------------------------
CREATE TABLE identity.data_export_request (
    data_export_request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_export_request_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    data_export_request_tenant_code BIGINT NOT NULL,
    data_export_request_organization_id BIGINT NOT NULL,
    data_export_request_user_account_id BIGINT NOT NULL,
    data_export_request_status VARCHAR(100) NOT NULL DEFAULT 'requested',
    data_export_request_requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    data_export_request_completed_at TIMESTAMP WITH TIME ZONE,
    data_export_request_expires_at TIMESTAMP WITH TIME ZONE,
    data_export_request_blob_id BIGINT,
    data_export_request_download_token_hash VARCHAR(128),
    data_export_request_error TEXT,
    data_export_request_metadata JSONB NOT NULL DEFAULT '{}',
    data_export_request_created_by BIGINT,
    data_export_request_updated_by BIGINT,
    data_export_request_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    data_export_request_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_data_export_request_tenant FOREIGN KEY (data_export_request_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_data_export_request_organization FOREIGN KEY (data_export_request_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_data_export_request_user_account FOREIGN KEY (data_export_request_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_data_export_request_status FOREIGN KEY (data_export_request_status) REFERENCES enums.data_export_status(data_export_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_data_export_request_created_by FOREIGN KEY (data_export_request_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_data_export_request_updated_by FOREIGN KEY (data_export_request_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL
);

CREATE INDEX idx_data_export_request_tenant_code ON identity.data_export_request(data_export_request_tenant_code);
CREATE INDEX idx_data_export_request_organization_id ON identity.data_export_request(data_export_request_organization_id);
CREATE INDEX idx_data_export_request_user_account_id ON identity.data_export_request(data_export_request_user_account_id);
CREATE INDEX idx_data_export_request_status ON identity.data_export_request(data_export_request_status);
CREATE INDEX idx_data_export_request_blob_id ON identity.data_export_request(data_export_request_blob_id);
CREATE INDEX idx_data_export_request_created_by ON identity.data_export_request(data_export_request_created_by);
CREATE INDEX idx_data_export_request_updated_by ON identity.data_export_request(data_export_request_updated_by);

CREATE TRIGGER trg_data_export_request_updated_at BEFORE UPDATE ON identity.data_export_request
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('data_export_request_updated_at');

-- -----------------------------------------------------
-- Table: identity.waitlist_entry
-- Purpose: Landing-page waitlist (MKT-08) with double opt-in; unauthenticated POST.
-- -----------------------------------------------------
CREATE TABLE identity.waitlist_entry (
    waitlist_entry_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    waitlist_entry_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    waitlist_entry_tenant_code BIGINT NOT NULL,
    waitlist_entry_organization_id BIGINT NOT NULL,
    waitlist_entry_email_normalized VARCHAR(254) NOT NULL,
    waitlist_entry_exam_id BIGINT,
    waitlist_entry_source VARCHAR(60),
    waitlist_entry_utm JSONB NOT NULL DEFAULT '{}',
    waitlist_entry_marketing_consent_id BIGINT,
    waitlist_entry_confirm_token_hash VARCHAR(128),
    waitlist_entry_confirmed_at TIMESTAMP WITH TIME ZONE,
    waitlist_entry_unsubscribed_at TIMESTAMP WITH TIME ZONE,
    waitlist_entry_converted_user_account_id BIGINT,
    waitlist_entry_metadata JSONB NOT NULL DEFAULT '{}',
    waitlist_entry_created_by BIGINT,
    waitlist_entry_updated_by BIGINT,
    waitlist_entry_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    waitlist_entry_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_waitlist_entry_tenant FOREIGN KEY (waitlist_entry_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_waitlist_entry_organization FOREIGN KEY (waitlist_entry_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_waitlist_entry_marketing_consent FOREIGN KEY (waitlist_entry_marketing_consent_id) REFERENCES identity.consent(consent_id) ON DELETE SET NULL,
    CONSTRAINT fk_waitlist_entry_converted_user_account FOREIGN KEY (waitlist_entry_converted_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_waitlist_entry_created_by FOREIGN KEY (waitlist_entry_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_waitlist_entry_updated_by FOREIGN KEY (waitlist_entry_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_waitlist_entry_email UNIQUE (waitlist_entry_tenant_code, waitlist_entry_email_normalized)
);

CREATE INDEX idx_waitlist_entry_organization_id ON identity.waitlist_entry(waitlist_entry_organization_id);
CREATE INDEX idx_waitlist_entry_exam_id ON identity.waitlist_entry(waitlist_entry_exam_id);
CREATE INDEX idx_waitlist_entry_marketing_consent_id ON identity.waitlist_entry(waitlist_entry_marketing_consent_id);
CREATE INDEX idx_waitlist_entry_converted_user_account_id ON identity.waitlist_entry(waitlist_entry_converted_user_account_id);
CREATE INDEX idx_waitlist_entry_created_by ON identity.waitlist_entry(waitlist_entry_created_by);
CREATE INDEX idx_waitlist_entry_updated_by ON identity.waitlist_entry(waitlist_entry_updated_by);

CREATE TRIGGER trg_waitlist_entry_updated_at BEFORE UPDATE ON identity.waitlist_entry
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('waitlist_entry_updated_at');

-- -----------------------------------------------------
-- Table: identity.contact_message
-- Purpose: Contact / help messages (MKT-13, ME-09), also forwarded to the support mailbox.
-- -----------------------------------------------------
CREATE TABLE identity.contact_message (
    contact_message_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contact_message_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    contact_message_tenant_code BIGINT NOT NULL,
    contact_message_organization_id BIGINT NOT NULL,
    contact_message_sender_organization_id BIGINT,
    contact_message_user_account_id BIGINT,
    contact_message_email_normalized VARCHAR(254) NOT NULL,
    contact_message_name VARCHAR(120),
    contact_message_topic VARCHAR(100),
    contact_message_subject VARCHAR(200),
    contact_message_body TEXT NOT NULL,
    contact_message_client_platform VARCHAR(100),
    contact_message_app_version VARCHAR(20),
    contact_message_status VARCHAR(100) NOT NULL DEFAULT 'open',
    contact_message_handled_by BIGINT,
    contact_message_handled_at TIMESTAMP WITH TIME ZONE,
    contact_message_metadata JSONB NOT NULL DEFAULT '{}',
    contact_message_created_by BIGINT,
    contact_message_updated_by BIGINT,
    contact_message_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    contact_message_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_contact_message_tenant FOREIGN KEY (contact_message_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_contact_message_organization FOREIGN KEY (contact_message_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_contact_message_sender_organization FOREIGN KEY (contact_message_sender_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL,
    CONSTRAINT fk_contact_message_user_account FOREIGN KEY (contact_message_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_contact_message_topic FOREIGN KEY (contact_message_topic) REFERENCES enums.contact_topic(contact_topic_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_contact_message_client_platform FOREIGN KEY (contact_message_client_platform) REFERENCES enums.client_platform(client_platform_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_contact_message_status FOREIGN KEY (contact_message_status) REFERENCES enums.report_status(report_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_contact_message_handled_by FOREIGN KEY (contact_message_handled_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_contact_message_created_by FOREIGN KEY (contact_message_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_contact_message_updated_by FOREIGN KEY (contact_message_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT chk_contact_message_body_length CHECK (char_length(contact_message_body) <= 5000)
);

CREATE INDEX idx_contact_message_status_created_at ON identity.contact_message(contact_message_status, contact_message_created_at);
CREATE INDEX idx_contact_message_tenant_code ON identity.contact_message(contact_message_tenant_code);
CREATE INDEX idx_contact_message_organization_id ON identity.contact_message(contact_message_organization_id);
CREATE INDEX idx_contact_message_sender_organization_id ON identity.contact_message(contact_message_sender_organization_id);
CREATE INDEX idx_contact_message_user_account_id ON identity.contact_message(contact_message_user_account_id);
CREATE INDEX idx_contact_message_topic ON identity.contact_message(contact_message_topic);
CREATE INDEX idx_contact_message_client_platform ON identity.contact_message(contact_message_client_platform);
CREATE INDEX idx_contact_message_handled_by ON identity.contact_message(contact_message_handled_by);
CREATE INDEX idx_contact_message_created_by ON identity.contact_message(contact_message_created_by);
CREATE INDEX idx_contact_message_updated_by ON identity.contact_message(contact_message_updated_by);

CREATE TRIGGER trg_contact_message_updated_at BEFORE UPDATE ON identity.contact_message
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('contact_message_updated_at');

-- =====================================================
-- Circular FKs (created_by / updated_by -> user_account), added after user_account exists
-- =====================================================
ALTER TABLE identity.tenant
    ADD CONSTRAINT fk_tenant_created_by FOREIGN KEY (tenant_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL;
ALTER TABLE identity.tenant
    ADD CONSTRAINT fk_tenant_updated_by FOREIGN KEY (tenant_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL;
ALTER TABLE identity.organization
    ADD CONSTRAINT fk_organization_created_by FOREIGN KEY (organization_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL;
ALTER TABLE identity.organization
    ADD CONSTRAINT fk_organization_updated_by FOREIGN KEY (organization_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL;
ALTER TABLE identity.user_account
    ADD CONSTRAINT fk_user_account_created_by FOREIGN KEY (user_account_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL;
ALTER TABLE identity.user_account
    ADD CONSTRAINT fk_user_account_updated_by FOREIGN KEY (user_account_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL;
