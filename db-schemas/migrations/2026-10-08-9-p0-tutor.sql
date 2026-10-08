-- P0 başlangıç şeması: 08-tutor-schema.sql (docs/PLAN-P0.md §2).
--
-- NEDEN: çalışan veritabanlarının taze kurulumla aynı şemaya ulaşması.
-- Idempotent değil; defter (public.schema_migrations) her dosyayı bir kez çalıştırır.
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-08-9-p0-tutor.sql
BEGIN;

-- tutor schema (owner: tutor service). Student data: personal org scope CASCADE; created_by/updated_by FK only on message_report.
-- Depends on: 00-enums, 01-identity, 05-content.

CREATE SCHEMA IF NOT EXISTS tutor;

-- -----------------------------------------------------
-- Table: tutor.conversation
-- Purpose: Tutor chat conversation
-- -----------------------------------------------------
CREATE TABLE tutor.conversation (
    conversation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    conversation_tenant_code BIGINT NOT NULL,
    conversation_organization_id BIGINT NOT NULL,
    conversation_user_account_id BIGINT NOT NULL,
    conversation_title VARCHAR(120),
    conversation_title_is_auto BOOLEAN NOT NULL DEFAULT true,
    conversation_mode VARCHAR(100) NOT NULL DEFAULT 'free',
    conversation_context_kind VARCHAR(100) NOT NULL DEFAULT 'none',
    conversation_context_item_id BIGINT,
    conversation_context_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
    conversation_track_id BIGINT,
    conversation_pinned_at TIMESTAMPTZ,
    conversation_last_message_at TIMESTAMPTZ,
    conversation_message_count INTEGER NOT NULL DEFAULT 0,
    conversation_metadata JSONB NOT NULL DEFAULT '{}',
    conversation_created_by BIGINT,
    conversation_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    conversation_updated_by BIGINT,
    conversation_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_conversation_tenant FOREIGN KEY (conversation_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_conversation_organization FOREIGN KEY (conversation_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_conversation_user_account FOREIGN KEY (conversation_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_conversation_mode FOREIGN KEY (conversation_mode) REFERENCES enums.tutor_mode(tutor_mode_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_conversation_context_kind FOREIGN KEY (conversation_context_kind) REFERENCES enums.tutor_context_kind(tutor_context_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_conversation_context_item FOREIGN KEY (conversation_context_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_conversation_track FOREIGN KEY (conversation_track_id) REFERENCES content.exam_track(exam_track_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_conversation_user_account_id_last_message_at ON tutor.conversation (conversation_user_account_id, conversation_last_message_at DESC);
CREATE INDEX idx_conversation_mode ON tutor.conversation (conversation_mode);
CREATE INDEX idx_conversation_context_kind ON tutor.conversation (conversation_context_kind);
CREATE INDEX idx_conversation_context_item_id ON tutor.conversation (conversation_context_item_id);
CREATE INDEX idx_conversation_track_id ON tutor.conversation (conversation_track_id);
CREATE INDEX idx_conversation_tenant_code ON tutor.conversation (conversation_tenant_code);
CREATE INDEX idx_conversation_organization_id ON tutor.conversation (conversation_organization_id);
CREATE TRIGGER trg_conversation_updated_at BEFORE UPDATE ON tutor.conversation FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('conversation_updated_at');

-- -----------------------------------------------------
-- Table: tutor.message
-- Purpose: Tutor chat message
-- -----------------------------------------------------
CREATE TABLE tutor.message (
    message_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    message_tenant_code BIGINT NOT NULL,
    message_organization_id BIGINT NOT NULL,
    message_conversation_id BIGINT NOT NULL,
    message_user_account_id BIGINT NOT NULL,
    message_role VARCHAR(100) NOT NULL,
    message_status VARCHAR(100) NOT NULL,
    message_content TEXT NOT NULL DEFAULT '',
    message_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    message_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    message_preset VARCHAR(40),
    message_needs_expert_review BOOLEAN NOT NULL DEFAULT false,
    message_client_ref UUID,
    message_model VARCHAR(60),
    message_input_tokens INTEGER,
    message_output_tokens INTEGER,
    message_cache_read_tokens INTEGER,
    message_latency_ms INTEGER,
    message_finished_at TIMESTAMPTZ,
    message_error_code VARCHAR(60),
    message_metadata JSONB NOT NULL DEFAULT '{}',
    message_created_by BIGINT,
    message_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_updated_by BIGINT,
    message_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_message_user_account_id_client_ref UNIQUE (message_user_account_id, message_client_ref),
    CONSTRAINT fk_message_tenant FOREIGN KEY (message_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_message_organization FOREIGN KEY (message_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_message_conversation FOREIGN KEY (message_conversation_id) REFERENCES tutor.conversation(conversation_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_message_user_account FOREIGN KEY (message_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_message_role FOREIGN KEY (message_role) REFERENCES enums.tutor_message_role(tutor_message_role_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_message_status FOREIGN KEY (message_status) REFERENCES enums.tutor_message_status(tutor_message_status_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_message_conversation_id_created_at ON tutor.message (message_conversation_id, message_created_at);
CREATE INDEX idx_message_user_account_id_created_at ON tutor.message (message_user_account_id, message_created_at);
CREATE INDEX idx_message_role ON tutor.message (message_role);
CREATE INDEX idx_message_status ON tutor.message (message_status);
CREATE INDEX idx_message_tenant_code ON tutor.message (message_tenant_code);
CREATE INDEX idx_message_organization_id ON tutor.message (message_organization_id);
CREATE TRIGGER trg_message_updated_at BEFORE UPDATE ON tutor.message FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('message_updated_at');

-- -----------------------------------------------------
-- Table: tutor.message_feedback
-- Purpose: Thumbs up/down on a message
-- -----------------------------------------------------
CREATE TABLE tutor.message_feedback (
    message_feedback_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_feedback_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    message_feedback_tenant_code BIGINT NOT NULL,
    message_feedback_organization_id BIGINT NOT NULL,
    message_feedback_message_id BIGINT NOT NULL,
    message_feedback_user_account_id BIGINT NOT NULL,
    message_feedback_is_helpful BOOLEAN NOT NULL,
    message_feedback_metadata JSONB NOT NULL DEFAULT '{}',
    message_feedback_created_by BIGINT,
    message_feedback_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_feedback_updated_by BIGINT,
    message_feedback_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_message_feedback_message_id_user_account_id UNIQUE (message_feedback_message_id, message_feedback_user_account_id),
    CONSTRAINT fk_message_feedback_tenant FOREIGN KEY (message_feedback_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_message_feedback_organization FOREIGN KEY (message_feedback_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_message_feedback_message FOREIGN KEY (message_feedback_message_id) REFERENCES tutor.message(message_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_message_feedback_user_account FOREIGN KEY (message_feedback_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX idx_message_feedback_user_account_id ON tutor.message_feedback (message_feedback_user_account_id);
CREATE INDEX idx_message_feedback_tenant_code ON tutor.message_feedback (message_feedback_tenant_code);
CREATE INDEX idx_message_feedback_organization_id ON tutor.message_feedback (message_feedback_organization_id);
CREATE TRIGGER trg_message_feedback_updated_at BEFORE UPDATE ON tutor.message_feedback FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('message_feedback_updated_at');

-- -----------------------------------------------------
-- Table: tutor.message_report
-- Purpose: Reported tutor message (editor queue)
-- -----------------------------------------------------
CREATE TABLE tutor.message_report (
    message_report_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_report_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    message_report_tenant_code BIGINT NOT NULL,
    message_report_organization_id BIGINT NOT NULL,
    message_report_message_id BIGINT,
    message_report_reporter_organization_id BIGINT,
    message_report_reporter_user_account_id BIGINT,
    message_report_message_snapshot TEXT NOT NULL,
    message_report_reason VARCHAR(100) NOT NULL,
    message_report_note VARCHAR(1000),
    message_report_status VARCHAR(100) NOT NULL DEFAULT 'open',
    message_report_resolved_by BIGINT,
    message_report_resolved_at TIMESTAMPTZ,
    message_report_resolution_note TEXT,
    message_report_metadata JSONB NOT NULL DEFAULT '{}',
    message_report_created_by BIGINT,
    message_report_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_report_updated_by BIGINT,
    message_report_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_message_report_tenant FOREIGN KEY (message_report_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_message_report_organization FOREIGN KEY (message_report_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_message_report_message FOREIGN KEY (message_report_message_id) REFERENCES tutor.message(message_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_message_report_reporter_organization FOREIGN KEY (message_report_reporter_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_message_report_reporter_user_account FOREIGN KEY (message_report_reporter_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_message_report_reason FOREIGN KEY (message_report_reason) REFERENCES enums.report_reason(report_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_message_report_status FOREIGN KEY (message_report_status) REFERENCES enums.report_status(report_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_message_report_resolved_by FOREIGN KEY (message_report_resolved_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_message_report_created_by FOREIGN KEY (message_report_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_message_report_updated_by FOREIGN KEY (message_report_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_message_report_status_created_at ON tutor.message_report (message_report_status, message_report_created_at);
CREATE INDEX idx_message_report_message_id ON tutor.message_report (message_report_message_id);
CREATE INDEX idx_message_report_reporter_user_account_id ON tutor.message_report (message_report_reporter_user_account_id);
CREATE INDEX idx_message_report_reporter_organization_id ON tutor.message_report (message_report_reporter_organization_id);
CREATE INDEX idx_message_report_reason ON tutor.message_report (message_report_reason);
CREATE INDEX idx_message_report_resolved_by ON tutor.message_report (message_report_resolved_by);
CREATE INDEX idx_message_report_tenant_code ON tutor.message_report (message_report_tenant_code);
CREATE INDEX idx_message_report_organization_id ON tutor.message_report (message_report_organization_id);
CREATE INDEX idx_message_report_created_by ON tutor.message_report (message_report_created_by);
CREATE INDEX idx_message_report_updated_by ON tutor.message_report (message_report_updated_by);
CREATE TRIGGER trg_message_report_updated_at BEFORE UPDATE ON tutor.message_report FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('message_report_updated_at');

-- -----------------------------------------------------
-- Table: tutor.translation_evaluation
-- Purpose: AI translation evaluation
-- -----------------------------------------------------
CREATE TABLE tutor.translation_evaluation (
    translation_evaluation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    translation_evaluation_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    translation_evaluation_tenant_code BIGINT NOT NULL,
    translation_evaluation_organization_id BIGINT NOT NULL,
    translation_evaluation_user_account_id BIGINT NOT NULL,
    translation_evaluation_prompt_item_id BIGINT NOT NULL,
    translation_evaluation_prompt_revision_id BIGINT NOT NULL,
    translation_evaluation_rubric_id BIGINT NOT NULL,
    translation_evaluation_status VARCHAR(100) NOT NULL,
    translation_evaluation_user_text TEXT NOT NULL,
    translation_evaluation_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    translation_evaluation_total_score SMALLINT,
    translation_evaluation_max_score SMALLINT,
    translation_evaluation_suggested_translation TEXT,
    translation_evaluation_feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    translation_evaluation_model VARCHAR(60),
    translation_evaluation_evaluated_at TIMESTAMPTZ,
    translation_evaluation_client_ref UUID,
    translation_evaluation_metadata JSONB NOT NULL DEFAULT '{}',
    translation_evaluation_created_by BIGINT,
    translation_evaluation_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    translation_evaluation_updated_by BIGINT,
    translation_evaluation_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_translation_evaluation_user_account_id_client_ref UNIQUE (translation_evaluation_user_account_id, translation_evaluation_client_ref),
    CONSTRAINT chk_translation_evaluation_user_text CHECK (char_length(translation_evaluation_user_text) <= 2000),
    CONSTRAINT fk_translation_evaluation_tenant FOREIGN KEY (translation_evaluation_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_evaluation_organization FOREIGN KEY (translation_evaluation_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_evaluation_user_account FOREIGN KEY (translation_evaluation_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_evaluation_prompt_item FOREIGN KEY (translation_evaluation_prompt_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_evaluation_prompt_revision FOREIGN KEY (translation_evaluation_prompt_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_evaluation_rubric FOREIGN KEY (translation_evaluation_rubric_id) REFERENCES content.rubric(rubric_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_evaluation_status FOREIGN KEY (translation_evaluation_status) REFERENCES enums.ai_job_status(ai_job_status_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_translation_evaluation_user_account_id_created_at ON tutor.translation_evaluation (translation_evaluation_user_account_id, translation_evaluation_created_at);
CREATE INDEX idx_translation_evaluation_prompt_item_id ON tutor.translation_evaluation (translation_evaluation_prompt_item_id);
CREATE INDEX idx_translation_evaluation_prompt_revision_id ON tutor.translation_evaluation (translation_evaluation_prompt_revision_id);
CREATE INDEX idx_translation_evaluation_rubric_id ON tutor.translation_evaluation (translation_evaluation_rubric_id);
CREATE INDEX idx_translation_evaluation_status ON tutor.translation_evaluation (translation_evaluation_status);
CREATE INDEX idx_translation_evaluation_tenant_code ON tutor.translation_evaluation (translation_evaluation_tenant_code);
CREATE INDEX idx_translation_evaluation_organization_id ON tutor.translation_evaluation (translation_evaluation_organization_id);
CREATE TRIGGER trg_translation_evaluation_updated_at BEFORE UPDATE ON tutor.translation_evaluation FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('translation_evaluation_updated_at');

-- -----------------------------------------------------
-- Table: tutor.ai_usage
-- Purpose: AI cost ledger
-- -----------------------------------------------------
CREATE TABLE tutor.ai_usage (
    ai_usage_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ai_usage_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    ai_usage_tenant_code BIGINT NOT NULL,
    ai_usage_organization_id BIGINT,
    ai_usage_user_account_id BIGINT,
    ai_usage_feature VARCHAR(100) NOT NULL,
    ai_usage_model VARCHAR(60) NOT NULL,
    ai_usage_input_tokens INTEGER,
    ai_usage_output_tokens INTEGER,
    ai_usage_cache_read_tokens INTEGER,
    ai_usage_cache_write_tokens INTEGER,
    ai_usage_latency_ms INTEGER,
    ai_usage_cost_micros BIGINT,
    ai_usage_succeeded BOOLEAN,
    ai_usage_request_ref VARCHAR(80),
    ai_usage_metadata JSONB NOT NULL DEFAULT '{}',
    ai_usage_created_by BIGINT,
    ai_usage_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ai_usage_updated_by BIGINT,
    ai_usage_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_ai_usage_tenant FOREIGN KEY (ai_usage_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_ai_usage_organization FOREIGN KEY (ai_usage_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_ai_usage_user_account FOREIGN KEY (ai_usage_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_ai_usage_feature FOREIGN KEY (ai_usage_feature) REFERENCES enums.ai_feature(ai_feature_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_ai_usage_user_account_id_created_at ON tutor.ai_usage (ai_usage_user_account_id, ai_usage_created_at);
CREATE INDEX idx_ai_usage_feature ON tutor.ai_usage (ai_usage_feature);
CREATE INDEX idx_ai_usage_created_at ON tutor.ai_usage (ai_usage_created_at);
CREATE INDEX idx_ai_usage_tenant_code ON tutor.ai_usage (ai_usage_tenant_code);
CREATE INDEX idx_ai_usage_organization_id ON tutor.ai_usage (ai_usage_organization_id);
CREATE TRIGGER trg_ai_usage_updated_at BEFORE UPDATE ON tutor.ai_usage FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('ai_usage_updated_at');

-- -----------------------------------------------------
-- Table: tutor.starter_prompt
-- Purpose: Suggested conversation starters
-- -----------------------------------------------------
CREATE TABLE tutor.starter_prompt (
    starter_prompt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    starter_prompt_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    starter_prompt_tenant_code BIGINT NOT NULL,
    starter_prompt_organization_id BIGINT NOT NULL,
    starter_prompt_exam_id BIGINT,
    starter_prompt_mode VARCHAR(100) NOT NULL,
    starter_prompt_text VARCHAR(200) NOT NULL,
    starter_prompt_sort_order INTEGER NOT NULL DEFAULT 0,
    starter_prompt_is_active BOOLEAN NOT NULL DEFAULT true,
    starter_prompt_metadata JSONB NOT NULL DEFAULT '{}',
    starter_prompt_created_by BIGINT,
    starter_prompt_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    starter_prompt_updated_by BIGINT,
    starter_prompt_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_starter_prompt_tenant FOREIGN KEY (starter_prompt_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_starter_prompt_organization FOREIGN KEY (starter_prompt_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_starter_prompt_exam FOREIGN KEY (starter_prompt_exam_id) REFERENCES content.exam(exam_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_starter_prompt_mode FOREIGN KEY (starter_prompt_mode) REFERENCES enums.tutor_mode(tutor_mode_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_starter_prompt_exam_id ON tutor.starter_prompt (starter_prompt_exam_id);
CREATE INDEX idx_starter_prompt_mode ON tutor.starter_prompt (starter_prompt_mode);
CREATE INDEX idx_starter_prompt_tenant_code ON tutor.starter_prompt (starter_prompt_tenant_code);
CREATE INDEX idx_starter_prompt_organization_id ON tutor.starter_prompt (starter_prompt_organization_id);
CREATE TRIGGER trg_starter_prompt_updated_at BEFORE UPDATE ON tutor.starter_prompt FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('starter_prompt_updated_at');



COMMIT;
