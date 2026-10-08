-- =====================================================
-- SCHEMA: audit
-- Purpose: Audit trail
-- =====================================================
CREATE SCHEMA IF NOT EXISTS audit;

-- -----------------------------------------------------
-- Table: audit.event
-- Purpose: Immutable audit trail written via app-shared/persistence/audit.js.
-- -----------------------------------------------------
CREATE TABLE audit.event (
    event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    event_tenant_code BIGINT NOT NULL,
    event_organization_id BIGINT,
    event_actor_user_account_id BIGINT,
    event_actor_role VARCHAR(50),
    event_action VARCHAR(100) NOT NULL,
    event_entity_schema VARCHAR(40) NOT NULL,
    event_entity_table VARCHAR(80) NOT NULL,
    event_entity_code BIGINT,
    event_before JSONB,
    event_after JSONB,
    event_ip VARCHAR(64),
    event_request_id VARCHAR(64),
    event_metadata JSONB NOT NULL DEFAULT '{}',
    event_created_by BIGINT,
    event_updated_by BIGINT,
    event_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    event_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_event_tenant FOREIGN KEY (event_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_event_organization FOREIGN KEY (event_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL,
    CONSTRAINT fk_event_actor_user_account FOREIGN KEY (event_actor_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_event_created_by FOREIGN KEY (event_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_event_updated_by FOREIGN KEY (event_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL
);

CREATE INDEX idx_event_entity ON audit.event(event_entity_schema, event_entity_table, event_entity_code);
CREATE INDEX idx_event_action_created_at ON audit.event(event_action, event_created_at);
CREATE INDEX idx_event_tenant_code ON audit.event(event_tenant_code);
CREATE INDEX idx_event_organization_id ON audit.event(event_organization_id);
CREATE INDEX idx_event_actor_user_account_id ON audit.event(event_actor_user_account_id);
CREATE INDEX idx_event_created_by ON audit.event(event_created_by);
CREATE INDEX idx_event_updated_by ON audit.event(event_updated_by);

CREATE TRIGGER trg_event_updated_at BEFORE UPDATE ON audit.event
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('event_updated_at');

