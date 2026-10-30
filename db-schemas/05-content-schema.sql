-- 05-content-schema.sql
-- content schema (owner: content service). See docs/PLAN-P0.md section 2.5.
-- Business 'code' columns of PLAN are named <table>_key because <table>_code is the standard global code.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS content;

-- -----------------------------------------------------
-- Table: content.exam
-- Purpose: Exam family (YDS, YOKDIL).
-- -----------------------------------------------------
CREATE TABLE content.exam (
    exam_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    exam_tenant_code BIGINT NOT NULL,
    exam_organization_id BIGINT NOT NULL,
    exam_key VARCHAR(40) NOT NULL,
    exam_name VARCHAR(120) NOT NULL,
    exam_short_name VARCHAR(40) NOT NULL,
    exam_provider_name VARCHAR(80),
    exam_description TEXT,
    exam_status VARCHAR(100) NOT NULL,
    exam_sort_order INT NOT NULL DEFAULT 0,
    exam_metadata JSONB NOT NULL DEFAULT '{}',
    exam_created_by BIGINT,
    exam_updated_by BIGINT,
    exam_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exam_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_exam_tenant FOREIGN KEY (exam_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_organization FOREIGN KEY (exam_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_status FOREIGN KEY (exam_status) REFERENCES enums.exam_status(exam_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_exam_created_by FOREIGN KEY (exam_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_updated_by FOREIGN KEY (exam_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_exam_key UNIQUE (exam_tenant_code, exam_key)
);
CREATE INDEX idx_exam_tenant_code ON content.exam (exam_tenant_code);
CREATE INDEX idx_exam_organization_id ON content.exam (exam_organization_id);
CREATE INDEX idx_exam_created_by ON content.exam (exam_created_by);
CREATE INDEX idx_exam_updated_by ON content.exam (exam_updated_by);
CREATE INDEX idx_exam_status ON content.exam (exam_status);
CREATE TRIGGER trg_exam_updated_at BEFORE UPDATE ON content.exam
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('exam_updated_at');

-- -----------------------------------------------------
-- Table: content.subject_area
-- Purpose: Subject areas (health, science, social).
-- -----------------------------------------------------
CREATE TABLE content.subject_area (
    subject_area_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_area_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    subject_area_tenant_code BIGINT NOT NULL,
    subject_area_organization_id BIGINT NOT NULL,
    subject_area_key VARCHAR(40) NOT NULL,
    subject_area_name VARCHAR(80) NOT NULL,
    subject_area_sort_order INT NOT NULL DEFAULT 0,
    subject_area_metadata JSONB NOT NULL DEFAULT '{}',
    subject_area_created_by BIGINT,
    subject_area_updated_by BIGINT,
    subject_area_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    subject_area_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_subject_area_tenant FOREIGN KEY (subject_area_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_subject_area_organization FOREIGN KEY (subject_area_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_subject_area_created_by FOREIGN KEY (subject_area_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_subject_area_updated_by FOREIGN KEY (subject_area_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_subject_area_key UNIQUE (subject_area_tenant_code, subject_area_key)
);
CREATE INDEX idx_subject_area_tenant_code ON content.subject_area (subject_area_tenant_code);
CREATE INDEX idx_subject_area_organization_id ON content.subject_area (subject_area_organization_id);
CREATE INDEX idx_subject_area_created_by ON content.subject_area (subject_area_created_by);
CREATE INDEX idx_subject_area_updated_by ON content.subject_area (subject_area_updated_by);
CREATE TRIGGER trg_subject_area_updated_at BEFORE UPDATE ON content.subject_area
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('subject_area_updated_at');

-- -----------------------------------------------------
-- Table: content.exam_track
-- Purpose: Selectable target of an exam (language, field, delivery mode).
-- -----------------------------------------------------
CREATE TABLE content.exam_track (
    exam_track_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_track_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    exam_track_tenant_code BIGINT NOT NULL,
    exam_track_organization_id BIGINT NOT NULL,
    exam_track_exam_id BIGINT NOT NULL,
    exam_track_key VARCHAR(40) NOT NULL,
    exam_track_name VARCHAR(120) NOT NULL,
    exam_track_delivery_mode VARCHAR(100) NOT NULL,
    exam_track_content_language VARCHAR(10) NOT NULL DEFAULT 'en',
    exam_track_subject_area_id BIGINT,
    exam_track_status VARCHAR(100) NOT NULL,
    exam_track_fallback_track_id BIGINT,
    exam_track_notice TEXT,
    exam_track_is_default BOOLEAN NOT NULL DEFAULT false,
    exam_track_sort_order INT NOT NULL DEFAULT 0,
    exam_track_metadata JSONB NOT NULL DEFAULT '{}',
    exam_track_created_by BIGINT,
    exam_track_updated_by BIGINT,
    exam_track_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exam_track_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_exam_track_tenant FOREIGN KEY (exam_track_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_track_organization FOREIGN KEY (exam_track_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_track_exam FOREIGN KEY (exam_track_exam_id) REFERENCES content.exam(exam_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_track_delivery_mode FOREIGN KEY (exam_track_delivery_mode) REFERENCES enums.exam_delivery_mode(exam_delivery_mode_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_exam_track_subject_area FOREIGN KEY (exam_track_subject_area_id) REFERENCES content.subject_area(subject_area_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_track_status FOREIGN KEY (exam_track_status) REFERENCES enums.exam_status(exam_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_exam_track_fallback_track FOREIGN KEY (exam_track_fallback_track_id) REFERENCES content.exam_track(exam_track_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_track_created_by FOREIGN KEY (exam_track_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_track_updated_by FOREIGN KEY (exam_track_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_exam_track_key UNIQUE (exam_track_tenant_code, exam_track_key),
    CONSTRAINT chk_exam_track_fallback_not_self CHECK (exam_track_fallback_track_id <> exam_track_id)
);
CREATE INDEX idx_exam_track_tenant_code ON content.exam_track (exam_track_tenant_code);
CREATE INDEX idx_exam_track_organization_id ON content.exam_track (exam_track_organization_id);
CREATE INDEX idx_exam_track_created_by ON content.exam_track (exam_track_created_by);
CREATE INDEX idx_exam_track_updated_by ON content.exam_track (exam_track_updated_by);
CREATE INDEX idx_exam_track_exam_id ON content.exam_track (exam_track_exam_id);
CREATE INDEX idx_exam_track_delivery_mode ON content.exam_track (exam_track_delivery_mode);
CREATE INDEX idx_exam_track_subject_area_id ON content.exam_track (exam_track_subject_area_id);
CREATE INDEX idx_exam_track_status ON content.exam_track (exam_track_status);
CREATE INDEX idx_exam_track_fallback_track_id ON content.exam_track (exam_track_fallback_track_id);
CREATE UNIQUE INDEX uq_exam_track_exam_id ON content.exam_track (exam_track_exam_id) WHERE exam_track_is_default;
CREATE TRIGGER trg_exam_track_updated_at BEFORE UPDATE ON content.exam_track
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('exam_track_updated_at');

-- -----------------------------------------------------
-- Table: content.exam_session
-- Purpose: Exam session calendar entry.
-- -----------------------------------------------------
CREATE TABLE content.exam_session (
    exam_session_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_session_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    exam_session_tenant_code BIGINT NOT NULL,
    exam_session_organization_id BIGINT NOT NULL,
    exam_session_exam_id BIGINT NOT NULL,
    exam_session_delivery_mode VARCHAR(100) NOT NULL,
    exam_session_key VARCHAR(40) NOT NULL,
    exam_session_name VARCHAR(120),
    exam_session_status VARCHAR(100) NOT NULL,
    exam_session_exam_date DATE NOT NULL,
    exam_session_exam_time TIME,
    exam_session_application_start DATE,
    exam_session_application_end DATE,
    exam_session_late_application_end DATE,
    exam_session_result_date DATE,
    exam_session_is_estimated BOOLEAN NOT NULL DEFAULT false,
    exam_session_source_url VARCHAR(400),
    exam_session_metadata JSONB NOT NULL DEFAULT '{}',
    exam_session_created_by BIGINT,
    exam_session_updated_by BIGINT,
    exam_session_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exam_session_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_exam_session_tenant FOREIGN KEY (exam_session_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_session_organization FOREIGN KEY (exam_session_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_session_exam FOREIGN KEY (exam_session_exam_id) REFERENCES content.exam(exam_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_session_delivery_mode FOREIGN KEY (exam_session_delivery_mode) REFERENCES enums.exam_delivery_mode(exam_delivery_mode_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_exam_session_status FOREIGN KEY (exam_session_status) REFERENCES enums.exam_session_status(exam_session_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_exam_session_created_by FOREIGN KEY (exam_session_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_session_updated_by FOREIGN KEY (exam_session_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_exam_session_key UNIQUE (exam_session_tenant_code, exam_session_key),
    CONSTRAINT chk_exam_session_application_range CHECK (exam_session_application_start IS NULL OR exam_session_application_end IS NULL OR exam_session_application_end >= exam_session_application_start),
    CONSTRAINT chk_exam_session_result_after_exam CHECK (exam_session_result_date IS NULL OR exam_session_result_date >= exam_session_exam_date)
);
CREATE INDEX idx_exam_session_tenant_code ON content.exam_session (exam_session_tenant_code);
CREATE INDEX idx_exam_session_organization_id ON content.exam_session (exam_session_organization_id);
CREATE INDEX idx_exam_session_created_by ON content.exam_session (exam_session_created_by);
CREATE INDEX idx_exam_session_updated_by ON content.exam_session (exam_session_updated_by);
CREATE INDEX idx_exam_session_exam_id_delivery_mode_exam_date ON content.exam_session (exam_session_exam_id, exam_session_delivery_mode, exam_session_exam_date);
CREATE INDEX idx_exam_session_delivery_mode ON content.exam_session (exam_session_delivery_mode);
CREATE INDEX idx_exam_session_status ON content.exam_session (exam_session_status);
CREATE TRIGGER trg_exam_session_updated_at BEFORE UPDATE ON content.exam_session
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('exam_session_updated_at');

-- -----------------------------------------------------
-- Table: content.blueprint
-- Purpose: Versioned exam format and scoring parameters per track.
-- -----------------------------------------------------
CREATE TABLE content.blueprint (
    blueprint_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    blueprint_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    blueprint_tenant_code BIGINT NOT NULL,
    blueprint_organization_id BIGINT NOT NULL,
    blueprint_track_id BIGINT NOT NULL,
    blueprint_version_no INT NOT NULL,
    blueprint_is_active BOOLEAN NOT NULL DEFAULT false,
    blueprint_name VARCHAR(120),
    blueprint_question_count SMALLINT NOT NULL,
    blueprint_duration_seconds INT NOT NULL,
    blueprint_options_per_question SMALLINT NOT NULL DEFAULT 5,
    blueprint_scoring_method VARCHAR(100) NOT NULL,
    blueprint_scoring_params JSONB NOT NULL,
    blueprint_score_min NUMERIC(6,2) NOT NULL DEFAULT 0,
    blueprint_score_max NUMERIC(6,2) NOT NULL,
    blueprint_effective_from DATE,
    blueprint_metadata JSONB NOT NULL DEFAULT '{}',
    blueprint_created_by BIGINT,
    blueprint_updated_by BIGINT,
    blueprint_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    blueprint_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_blueprint_tenant FOREIGN KEY (blueprint_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_organization FOREIGN KEY (blueprint_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_track FOREIGN KEY (blueprint_track_id) REFERENCES content.exam_track(exam_track_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_scoring_method FOREIGN KEY (blueprint_scoring_method) REFERENCES enums.scoring_method(scoring_method_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_blueprint_created_by FOREIGN KEY (blueprint_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_updated_by FOREIGN KEY (blueprint_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_blueprint_track_id_version_no UNIQUE (blueprint_track_id, blueprint_version_no),
    CONSTRAINT chk_blueprint_question_count_pos CHECK (blueprint_question_count > 0),
    CONSTRAINT chk_blueprint_duration_pos CHECK (blueprint_duration_seconds > 0),
    CONSTRAINT chk_blueprint_options_range CHECK (blueprint_options_per_question BETWEEN 2 AND 10),
    CONSTRAINT chk_blueprint_score_range CHECK (blueprint_score_max > blueprint_score_min)
);
CREATE INDEX idx_blueprint_tenant_code ON content.blueprint (blueprint_tenant_code);
CREATE INDEX idx_blueprint_organization_id ON content.blueprint (blueprint_organization_id);
CREATE INDEX idx_blueprint_created_by ON content.blueprint (blueprint_created_by);
CREATE INDEX idx_blueprint_updated_by ON content.blueprint (blueprint_updated_by);
CREATE INDEX idx_blueprint_scoring_method ON content.blueprint (blueprint_scoring_method);
CREATE UNIQUE INDEX uq_blueprint_track_id ON content.blueprint (blueprint_track_id) WHERE blueprint_is_active;
CREATE TRIGGER trg_blueprint_updated_at BEFORE UPDATE ON content.blueprint
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('blueprint_updated_at');

-- -----------------------------------------------------
-- Table: content.skill
-- Purpose: Skill tree; exam_id NULL means shared across exams.
-- -----------------------------------------------------
CREATE TABLE content.skill (
    skill_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    skill_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    skill_tenant_code BIGINT NOT NULL,
    skill_organization_id BIGINT NOT NULL,
    skill_parent_id BIGINT,
    skill_exam_id BIGINT,
    skill_key VARCHAR(60) NOT NULL,
    skill_name VARCHAR(120) NOT NULL,
    skill_description TEXT,
    skill_path VARCHAR(400) NOT NULL,
    skill_depth SMALLINT NOT NULL,
    skill_sort_order INT NOT NULL DEFAULT 0,
    skill_is_active BOOLEAN NOT NULL DEFAULT true,
    skill_metadata JSONB NOT NULL DEFAULT '{}',
    skill_created_by BIGINT,
    skill_updated_by BIGINT,
    skill_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    skill_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_skill_tenant FOREIGN KEY (skill_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_organization FOREIGN KEY (skill_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_parent FOREIGN KEY (skill_parent_id) REFERENCES content.skill(skill_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_exam FOREIGN KEY (skill_exam_id) REFERENCES content.exam(exam_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_created_by FOREIGN KEY (skill_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_updated_by FOREIGN KEY (skill_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_skill_key UNIQUE (skill_tenant_code, skill_key),
    CONSTRAINT chk_skill_parent_not_self CHECK (skill_parent_id <> skill_id)
);
CREATE INDEX idx_skill_tenant_code ON content.skill (skill_tenant_code);
CREATE INDEX idx_skill_organization_id ON content.skill (skill_organization_id);
CREATE INDEX idx_skill_created_by ON content.skill (skill_created_by);
CREATE INDEX idx_skill_updated_by ON content.skill (skill_updated_by);
CREATE INDEX idx_skill_parent_id ON content.skill (skill_parent_id);
CREATE INDEX idx_skill_exam_id ON content.skill (skill_exam_id);
CREATE INDEX idx_skill_path ON content.skill (skill_path text_pattern_ops);
CREATE TRIGGER trg_skill_updated_at BEFORE UPDATE ON content.skill
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('skill_updated_at');

-- -----------------------------------------------------
-- Table: content.goal_preset
-- Purpose: Target score chips per exam.
-- -----------------------------------------------------
CREATE TABLE content.goal_preset (
    goal_preset_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    goal_preset_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    goal_preset_tenant_code BIGINT NOT NULL,
    goal_preset_organization_id BIGINT NOT NULL,
    goal_preset_exam_id BIGINT NOT NULL,
    goal_preset_target_score NUMERIC(6,2) NOT NULL,
    goal_preset_label VARCHAR(80) NOT NULL,
    goal_preset_description VARCHAR(200),
    goal_preset_is_default BOOLEAN NOT NULL DEFAULT false,
    goal_preset_sort_order INT NOT NULL DEFAULT 0,
    goal_preset_metadata JSONB NOT NULL DEFAULT '{}',
    goal_preset_created_by BIGINT,
    goal_preset_updated_by BIGINT,
    goal_preset_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    goal_preset_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_goal_preset_tenant FOREIGN KEY (goal_preset_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_preset_organization FOREIGN KEY (goal_preset_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_preset_exam FOREIGN KEY (goal_preset_exam_id) REFERENCES content.exam(exam_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_preset_created_by FOREIGN KEY (goal_preset_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_preset_updated_by FOREIGN KEY (goal_preset_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_goal_preset_exam_id_target_score UNIQUE (goal_preset_exam_id, goal_preset_target_score)
);
CREATE INDEX idx_goal_preset_tenant_code ON content.goal_preset (goal_preset_tenant_code);
CREATE INDEX idx_goal_preset_organization_id ON content.goal_preset (goal_preset_organization_id);
CREATE INDEX idx_goal_preset_created_by ON content.goal_preset (goal_preset_created_by);
CREATE INDEX idx_goal_preset_updated_by ON content.goal_preset (goal_preset_updated_by);
CREATE TRIGGER trg_goal_preset_updated_at BEFORE UPDATE ON content.goal_preset
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('goal_preset_updated_at');

-- -----------------------------------------------------
-- Table: content.goal_reason
-- Purpose: Goal reasons (PhD, associate professorship...).
-- -----------------------------------------------------
CREATE TABLE content.goal_reason (
    goal_reason_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    goal_reason_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    goal_reason_tenant_code BIGINT NOT NULL,
    goal_reason_organization_id BIGINT NOT NULL,
    goal_reason_exam_id BIGINT,
    goal_reason_key VARCHAR(40) NOT NULL,
    goal_reason_label VARCHAR(80) NOT NULL,
    goal_reason_sort_order INT NOT NULL DEFAULT 0,
    goal_reason_metadata JSONB NOT NULL DEFAULT '{}',
    goal_reason_created_by BIGINT,
    goal_reason_updated_by BIGINT,
    goal_reason_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    goal_reason_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_goal_reason_tenant FOREIGN KEY (goal_reason_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_reason_organization FOREIGN KEY (goal_reason_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_reason_exam FOREIGN KEY (goal_reason_exam_id) REFERENCES content.exam(exam_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_reason_created_by FOREIGN KEY (goal_reason_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_goal_reason_updated_by FOREIGN KEY (goal_reason_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_goal_reason_key UNIQUE (goal_reason_tenant_code, goal_reason_key)
);
CREATE INDEX idx_goal_reason_tenant_code ON content.goal_reason (goal_reason_tenant_code);
CREATE INDEX idx_goal_reason_organization_id ON content.goal_reason (goal_reason_organization_id);
CREATE INDEX idx_goal_reason_created_by ON content.goal_reason (goal_reason_created_by);
CREATE INDEX idx_goal_reason_updated_by ON content.goal_reason (goal_reason_updated_by);
CREATE INDEX idx_goal_reason_exam_id ON content.goal_reason (goal_reason_exam_id);
CREATE TRIGGER trg_goal_reason_updated_at BEFORE UPDATE ON content.goal_reason
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('goal_reason_updated_at');

-- -----------------------------------------------------
-- Table: content.item
-- Purpose: Stable identity of every authorable content unit.
-- -----------------------------------------------------
CREATE TABLE content.item (
    item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    item_tenant_code BIGINT NOT NULL,
    item_organization_id BIGINT NOT NULL,
    item_kind VARCHAR(100) NOT NULL,
    item_status VARCHAR(100) NOT NULL DEFAULT 'draft',
    item_language VARCHAR(10) NOT NULL DEFAULT 'en',
    item_subject_area_id BIGINT,
    item_access_tier VARCHAR(100) NOT NULL DEFAULT 'free',
    item_origin VARCHAR(100) NOT NULL DEFAULT 'manual',
    item_title VARCHAR(300) NOT NULL,
    item_slug VARCHAR(160),
    item_external_ref VARCHAR(120),
    item_latest_revision_id BIGINT,
    item_published_revision_id BIGINT,
    item_published_at TIMESTAMPTZ,
    item_retired_at TIMESTAMPTZ,
    item_metadata JSONB NOT NULL DEFAULT '{}',
    item_created_by BIGINT,
    item_updated_by BIGINT,
    item_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_item_tenant FOREIGN KEY (item_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_organization FOREIGN KEY (item_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_kind FOREIGN KEY (item_kind) REFERENCES enums.content_kind(content_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_item_status FOREIGN KEY (item_status) REFERENCES enums.content_status(content_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_item_subject_area FOREIGN KEY (item_subject_area_id) REFERENCES content.subject_area(subject_area_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_access_tier FOREIGN KEY (item_access_tier) REFERENCES enums.access_tier(access_tier_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_item_origin FOREIGN KEY (item_origin) REFERENCES enums.content_origin(content_origin_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_item_created_by FOREIGN KEY (item_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_updated_by FOREIGN KEY (item_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT chk_item_published_needs_revision CHECK (item_status NOT IN ('pilot','published') OR item_published_revision_id IS NOT NULL)
);
CREATE INDEX idx_item_tenant_code ON content.item (item_tenant_code);
CREATE INDEX idx_item_organization_id ON content.item (item_organization_id);
CREATE INDEX idx_item_created_by ON content.item (item_created_by);
CREATE INDEX idx_item_updated_by ON content.item (item_updated_by);
CREATE INDEX idx_item_kind_status ON content.item (item_kind, item_status);
CREATE INDEX idx_item_status ON content.item (item_status);
CREATE INDEX idx_item_subject_area_id ON content.item (item_subject_area_id);
CREATE INDEX idx_item_access_tier ON content.item (item_access_tier);
CREATE INDEX idx_item_origin ON content.item (item_origin);
CREATE INDEX idx_item_latest_revision_id ON content.item (item_latest_revision_id);
CREATE INDEX idx_item_published_revision_id ON content.item (item_published_revision_id);
CREATE INDEX idx_item_title ON content.item USING gin (item_title gin_trgm_ops);
CREATE UNIQUE INDEX uq_item_external_ref ON content.item (item_tenant_code, item_external_ref) WHERE item_external_ref IS NOT NULL;
CREATE UNIQUE INDEX uq_item_kind_slug ON content.item (item_tenant_code, item_kind, item_slug) WHERE item_slug IS NOT NULL;
CREATE TRIGGER trg_item_updated_at BEFORE UPDATE ON content.item
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('item_updated_at');

-- -----------------------------------------------------
-- Table: content.item_revision
-- Purpose: Revision of an item with review workflow.
-- -----------------------------------------------------
CREATE TABLE content.item_revision (
    item_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_revision_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    item_revision_tenant_code BIGINT NOT NULL,
    item_revision_organization_id BIGINT NOT NULL,
    item_revision_item_id BIGINT NOT NULL,
    item_revision_revision_no INT NOT NULL,
    item_revision_review_status VARCHAR(100) NOT NULL DEFAULT 'draft',
    item_revision_author_user_account_id BIGINT,
    item_revision_assigned_reviewer_id BIGINT,
    item_revision_reviewed_by BIGINT,
    item_revision_submitted_at TIMESTAMPTZ,
    item_revision_reviewed_at TIMESTAMPTZ,
    item_revision_decision_note TEXT,
    item_revision_change_note VARCHAR(500),
    item_revision_based_on_revision_id BIGINT,
    item_revision_generation_job_id BIGINT,
    item_revision_snapshot JSONB NOT NULL DEFAULT '{}',
    item_revision_metadata JSONB NOT NULL DEFAULT '{}',
    item_revision_created_by BIGINT,
    item_revision_updated_by BIGINT,
    item_revision_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_revision_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_item_revision_tenant FOREIGN KEY (item_revision_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_organization FOREIGN KEY (item_revision_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_item FOREIGN KEY (item_revision_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_review_status FOREIGN KEY (item_revision_review_status) REFERENCES enums.revision_status(revision_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_item_revision_author_user_account FOREIGN KEY (item_revision_author_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_assigned_reviewer FOREIGN KEY (item_revision_assigned_reviewer_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_reviewed_by FOREIGN KEY (item_revision_reviewed_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_based_on_revision FOREIGN KEY (item_revision_based_on_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_created_by FOREIGN KEY (item_revision_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_revision_updated_by FOREIGN KEY (item_revision_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_item_revision_item_id_revision_no UNIQUE (item_revision_item_id, item_revision_revision_no),
    CONSTRAINT chk_item_revision_revision_no_pos CHECK (item_revision_revision_no > 0),
    CONSTRAINT chk_item_revision_four_eyes CHECK (item_revision_reviewed_by IS NULL OR item_revision_author_user_account_id IS NULL OR item_revision_reviewed_by <> item_revision_author_user_account_id)
);
CREATE INDEX idx_item_revision_tenant_code ON content.item_revision (item_revision_tenant_code);
CREATE INDEX idx_item_revision_organization_id ON content.item_revision (item_revision_organization_id);
CREATE INDEX idx_item_revision_created_by ON content.item_revision (item_revision_created_by);
CREATE INDEX idx_item_revision_updated_by ON content.item_revision (item_revision_updated_by);
CREATE INDEX idx_item_revision_review_status_submitted_at ON content.item_revision (item_revision_review_status, item_revision_submitted_at);
CREATE INDEX idx_item_revision_author_user_account_id ON content.item_revision (item_revision_author_user_account_id);
CREATE INDEX idx_item_revision_assigned_reviewer_id ON content.item_revision (item_revision_assigned_reviewer_id);
CREATE INDEX idx_item_revision_reviewed_by ON content.item_revision (item_revision_reviewed_by);
CREATE INDEX idx_item_revision_based_on_revision_id ON content.item_revision (item_revision_based_on_revision_id);
CREATE INDEX idx_item_revision_generation_job_id ON content.item_revision (item_revision_generation_job_id);
CREATE TRIGGER trg_item_revision_updated_at BEFORE UPDATE ON content.item_revision
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('item_revision_updated_at');

-- -----------------------------------------------------
-- Table: content.question_type
-- Purpose: General question type catalog.
-- -----------------------------------------------------
CREATE TABLE content.question_type (
    question_type_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_type_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    question_type_tenant_code BIGINT NOT NULL,
    question_type_organization_id BIGINT NOT NULL,
    question_type_key VARCHAR(40) NOT NULL,
    question_type_name VARCHAR(80) NOT NULL,
    question_type_short_name VARCHAR(40),
    question_type_question_format VARCHAR(100) NOT NULL,
    question_type_description TEXT,
    question_type_strategy_note_item_id BIGINT,
    question_type_icon_key VARCHAR(40),
    question_type_default_target_seconds INT,
    question_type_sort_order INT NOT NULL DEFAULT 0,
    question_type_is_active BOOLEAN NOT NULL DEFAULT true,
    question_type_metadata JSONB NOT NULL DEFAULT '{}',
    question_type_created_by BIGINT,
    question_type_updated_by BIGINT,
    question_type_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    question_type_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_question_type_tenant FOREIGN KEY (question_type_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_organization FOREIGN KEY (question_type_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_question_format FOREIGN KEY (question_type_question_format) REFERENCES enums.question_format(question_format_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_question_type_strategy_note_item FOREIGN KEY (question_type_strategy_note_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_created_by FOREIGN KEY (question_type_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_updated_by FOREIGN KEY (question_type_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_question_type_key UNIQUE (question_type_tenant_code, question_type_key)
);
CREATE INDEX idx_question_type_tenant_code ON content.question_type (question_type_tenant_code);
CREATE INDEX idx_question_type_organization_id ON content.question_type (question_type_organization_id);
CREATE INDEX idx_question_type_created_by ON content.question_type (question_type_created_by);
CREATE INDEX idx_question_type_updated_by ON content.question_type (question_type_updated_by);
CREATE INDEX idx_question_type_question_format ON content.question_type (question_type_question_format);
CREATE INDEX idx_question_type_strategy_note_item_id ON content.question_type (question_type_strategy_note_item_id);
CREATE TRIGGER trg_question_type_updated_at BEFORE UPDATE ON content.question_type
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('question_type_updated_at');

-- -----------------------------------------------------
-- Table: content.blueprint_section
-- Purpose: Section of a blueprint (question type, count, range).
-- -----------------------------------------------------
CREATE TABLE content.blueprint_section (
    blueprint_section_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    blueprint_section_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    blueprint_section_tenant_code BIGINT NOT NULL,
    blueprint_section_organization_id BIGINT NOT NULL,
    blueprint_section_blueprint_id BIGINT NOT NULL,
    blueprint_section_question_type_id BIGINT NOT NULL,
    blueprint_section_position SMALLINT NOT NULL,
    blueprint_section_question_count SMALLINT NOT NULL,
    blueprint_section_first_question_no SMALLINT NOT NULL,
    blueprint_section_last_question_no SMALLINT NOT NULL,
    blueprint_section_label_override VARCHAR(80),
    blueprint_section_target_seconds_per_question INT,
    blueprint_section_metadata JSONB NOT NULL DEFAULT '{}',
    blueprint_section_created_by BIGINT,
    blueprint_section_updated_by BIGINT,
    blueprint_section_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    blueprint_section_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_blueprint_section_tenant FOREIGN KEY (blueprint_section_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_section_organization FOREIGN KEY (blueprint_section_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_section_blueprint FOREIGN KEY (blueprint_section_blueprint_id) REFERENCES content.blueprint(blueprint_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_section_question_type FOREIGN KEY (blueprint_section_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_section_created_by FOREIGN KEY (blueprint_section_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_blueprint_section_updated_by FOREIGN KEY (blueprint_section_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_blueprint_section_blueprint_id_position UNIQUE (blueprint_section_blueprint_id, blueprint_section_position),
    CONSTRAINT uq_blueprint_section_blueprint_id_question_type_id UNIQUE (blueprint_section_blueprint_id, blueprint_section_question_type_id),
    CONSTRAINT chk_blueprint_section_position_pos CHECK (blueprint_section_position > 0),
    CONSTRAINT chk_blueprint_section_range_matches_count CHECK (blueprint_section_question_count = blueprint_section_last_question_no - blueprint_section_first_question_no + 1)
);
CREATE INDEX idx_blueprint_section_tenant_code ON content.blueprint_section (blueprint_section_tenant_code);
CREATE INDEX idx_blueprint_section_organization_id ON content.blueprint_section (blueprint_section_organization_id);
CREATE INDEX idx_blueprint_section_created_by ON content.blueprint_section (blueprint_section_created_by);
CREATE INDEX idx_blueprint_section_updated_by ON content.blueprint_section (blueprint_section_updated_by);
CREATE INDEX idx_blueprint_section_question_type_id ON content.blueprint_section (blueprint_section_question_type_id);
CREATE TRIGGER trg_blueprint_section_updated_at BEFORE UPDATE ON content.blueprint_section
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('blueprint_section_updated_at');

-- -----------------------------------------------------
-- Table: content.question_type_skill
-- Purpose: Skills measured by a question type.
-- -----------------------------------------------------
CREATE TABLE content.question_type_skill (
    question_type_skill_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_type_skill_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    question_type_skill_tenant_code BIGINT NOT NULL,
    question_type_skill_organization_id BIGINT NOT NULL,
    question_type_skill_question_type_id BIGINT NOT NULL,
    question_type_skill_skill_id BIGINT NOT NULL,
    question_type_skill_sort_order INT NOT NULL DEFAULT 0,
    question_type_skill_metadata JSONB NOT NULL DEFAULT '{}',
    question_type_skill_created_by BIGINT,
    question_type_skill_updated_by BIGINT,
    question_type_skill_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    question_type_skill_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_question_type_skill_tenant FOREIGN KEY (question_type_skill_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_skill_organization FOREIGN KEY (question_type_skill_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_skill_question_type FOREIGN KEY (question_type_skill_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_skill_skill FOREIGN KEY (question_type_skill_skill_id) REFERENCES content.skill(skill_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_skill_created_by FOREIGN KEY (question_type_skill_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_skill_updated_by FOREIGN KEY (question_type_skill_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_question_type_skill_question_type_id_skill_id UNIQUE (question_type_skill_question_type_id, question_type_skill_skill_id)
);
CREATE INDEX idx_question_type_skill_tenant_code ON content.question_type_skill (question_type_skill_tenant_code);
CREATE INDEX idx_question_type_skill_organization_id ON content.question_type_skill (question_type_skill_organization_id);
CREATE INDEX idx_question_type_skill_created_by ON content.question_type_skill (question_type_skill_created_by);
CREATE INDEX idx_question_type_skill_updated_by ON content.question_type_skill (question_type_skill_updated_by);
CREATE INDEX idx_question_type_skill_skill_id ON content.question_type_skill (question_type_skill_skill_id);
CREATE TRIGGER trg_question_type_skill_updated_at BEFORE UPDATE ON content.question_type_skill
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('question_type_skill_updated_at');

-- -----------------------------------------------------
-- Table: content.item_exam
-- Purpose: Exam eligibility tags of an item.
-- -----------------------------------------------------
CREATE TABLE content.item_exam (
    item_exam_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_exam_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    item_exam_tenant_code BIGINT NOT NULL,
    item_exam_organization_id BIGINT NOT NULL,
    item_exam_item_id BIGINT NOT NULL,
    item_exam_exam_id BIGINT NOT NULL,
    item_exam_metadata JSONB NOT NULL DEFAULT '{}',
    item_exam_created_by BIGINT,
    item_exam_updated_by BIGINT,
    item_exam_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_exam_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_item_exam_tenant FOREIGN KEY (item_exam_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_exam_organization FOREIGN KEY (item_exam_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_exam_item FOREIGN KEY (item_exam_item_id) REFERENCES content.item(item_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_item_exam_exam FOREIGN KEY (item_exam_exam_id) REFERENCES content.exam(exam_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_exam_created_by FOREIGN KEY (item_exam_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_exam_updated_by FOREIGN KEY (item_exam_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_item_exam_item_id_exam_id UNIQUE (item_exam_item_id, item_exam_exam_id)
);
CREATE INDEX idx_item_exam_tenant_code ON content.item_exam (item_exam_tenant_code);
CREATE INDEX idx_item_exam_organization_id ON content.item_exam (item_exam_organization_id);
CREATE INDEX idx_item_exam_created_by ON content.item_exam (item_exam_created_by);
CREATE INDEX idx_item_exam_updated_by ON content.item_exam (item_exam_updated_by);
CREATE INDEX idx_item_exam_exam_id ON content.item_exam (item_exam_exam_id);
CREATE TRIGGER trg_item_exam_updated_at BEFORE UPDATE ON content.item_exam
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('item_exam_updated_at');

-- -----------------------------------------------------
-- Table: content.item_skill
-- Purpose: Skill tags of an item.
-- -----------------------------------------------------
CREATE TABLE content.item_skill (
    item_skill_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_skill_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    item_skill_tenant_code BIGINT NOT NULL,
    item_skill_organization_id BIGINT NOT NULL,
    item_skill_item_id BIGINT NOT NULL,
    item_skill_skill_id BIGINT NOT NULL,
    item_skill_weight NUMERIC(4,3) NOT NULL DEFAULT 1,
    item_skill_is_primary BOOLEAN NOT NULL DEFAULT false,
    item_skill_metadata JSONB NOT NULL DEFAULT '{}',
    item_skill_created_by BIGINT,
    item_skill_updated_by BIGINT,
    item_skill_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_skill_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_item_skill_tenant FOREIGN KEY (item_skill_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_skill_organization FOREIGN KEY (item_skill_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_skill_item FOREIGN KEY (item_skill_item_id) REFERENCES content.item(item_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_item_skill_skill FOREIGN KEY (item_skill_skill_id) REFERENCES content.skill(skill_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_skill_created_by FOREIGN KEY (item_skill_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_skill_updated_by FOREIGN KEY (item_skill_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_item_skill_item_id_skill_id UNIQUE (item_skill_item_id, item_skill_skill_id),
    CONSTRAINT chk_item_skill_weight_range CHECK (item_skill_weight > 0 AND item_skill_weight <= 1)
);
CREATE INDEX idx_item_skill_tenant_code ON content.item_skill (item_skill_tenant_code);
CREATE INDEX idx_item_skill_organization_id ON content.item_skill (item_skill_organization_id);
CREATE INDEX idx_item_skill_created_by ON content.item_skill (item_skill_created_by);
CREATE INDEX idx_item_skill_updated_by ON content.item_skill (item_skill_updated_by);
CREATE INDEX idx_item_skill_skill_id ON content.item_skill (item_skill_skill_id);
CREATE UNIQUE INDEX uq_item_skill_item_id ON content.item_skill (item_skill_item_id) WHERE item_skill_is_primary;
CREATE TRIGGER trg_item_skill_updated_at BEFORE UPDATE ON content.item_skill
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('item_skill_updated_at');

-- -----------------------------------------------------
-- Table: content.review_comment
-- Purpose: Review thread comments on a revision.
-- -----------------------------------------------------
CREATE TABLE content.review_comment (
    review_comment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    review_comment_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    review_comment_tenant_code BIGINT NOT NULL,
    review_comment_organization_id BIGINT NOT NULL,
    review_comment_item_revision_id BIGINT NOT NULL,
    review_comment_author_user_account_id BIGINT,
    review_comment_parent_comment_id BIGINT,
    review_comment_body TEXT NOT NULL,
    review_comment_anchor JSONB,
    review_comment_resolved_at TIMESTAMPTZ,
    review_comment_resolved_by BIGINT,
    review_comment_metadata JSONB NOT NULL DEFAULT '{}',
    review_comment_created_by BIGINT,
    review_comment_updated_by BIGINT,
    review_comment_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    review_comment_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_review_comment_tenant FOREIGN KEY (review_comment_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_review_comment_organization FOREIGN KEY (review_comment_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_review_comment_item_revision FOREIGN KEY (review_comment_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_review_comment_author_user_account FOREIGN KEY (review_comment_author_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_review_comment_parent_comment FOREIGN KEY (review_comment_parent_comment_id) REFERENCES content.review_comment(review_comment_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_review_comment_resolved_by FOREIGN KEY (review_comment_resolved_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_review_comment_created_by FOREIGN KEY (review_comment_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_review_comment_updated_by FOREIGN KEY (review_comment_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_review_comment_tenant_code ON content.review_comment (review_comment_tenant_code);
CREATE INDEX idx_review_comment_organization_id ON content.review_comment (review_comment_organization_id);
CREATE INDEX idx_review_comment_created_by ON content.review_comment (review_comment_created_by);
CREATE INDEX idx_review_comment_updated_by ON content.review_comment (review_comment_updated_by);
CREATE INDEX idx_review_comment_item_revision_id ON content.review_comment (review_comment_item_revision_id);
CREATE INDEX idx_review_comment_author_user_account_id ON content.review_comment (review_comment_author_user_account_id);
CREATE INDEX idx_review_comment_parent_comment_id ON content.review_comment (review_comment_parent_comment_id);
CREATE INDEX idx_review_comment_resolved_by ON content.review_comment (review_comment_resolved_by);
CREATE TRIGGER trg_review_comment_updated_at BEFORE UPDATE ON content.review_comment
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('review_comment_updated_at');

-- -----------------------------------------------------
-- Table: content.rubric
-- Purpose: Scoring rubric.
-- -----------------------------------------------------
CREATE TABLE content.rubric (
    rubric_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rubric_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    rubric_tenant_code BIGINT NOT NULL,
    rubric_organization_id BIGINT NOT NULL,
    rubric_key VARCHAR(40) NOT NULL,
    rubric_name VARCHAR(120) NOT NULL,
    rubric_applies_to VARCHAR(100) NOT NULL,
    rubric_metadata JSONB NOT NULL DEFAULT '{}',
    rubric_created_by BIGINT,
    rubric_updated_by BIGINT,
    rubric_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rubric_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_rubric_tenant FOREIGN KEY (rubric_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_rubric_organization FOREIGN KEY (rubric_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_rubric_applies_to FOREIGN KEY (rubric_applies_to) REFERENCES enums.content_kind(content_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_rubric_created_by FOREIGN KEY (rubric_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_rubric_updated_by FOREIGN KEY (rubric_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_rubric_key UNIQUE (rubric_tenant_code, rubric_key)
);
CREATE INDEX idx_rubric_tenant_code ON content.rubric (rubric_tenant_code);
CREATE INDEX idx_rubric_organization_id ON content.rubric (rubric_organization_id);
CREATE INDEX idx_rubric_created_by ON content.rubric (rubric_created_by);
CREATE INDEX idx_rubric_updated_by ON content.rubric (rubric_updated_by);
CREATE INDEX idx_rubric_applies_to ON content.rubric (rubric_applies_to);
CREATE TRIGGER trg_rubric_updated_at BEFORE UPDATE ON content.rubric
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('rubric_updated_at');

-- -----------------------------------------------------
-- Table: content.rubric_criterion
-- Purpose: Rubric criterion.
-- -----------------------------------------------------
CREATE TABLE content.rubric_criterion (
    rubric_criterion_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rubric_criterion_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    rubric_criterion_tenant_code BIGINT NOT NULL,
    rubric_criterion_organization_id BIGINT NOT NULL,
    rubric_criterion_rubric_id BIGINT NOT NULL,
    rubric_criterion_key VARCHAR(40) NOT NULL,
    rubric_criterion_name VARCHAR(80) NOT NULL,
    rubric_criterion_description TEXT,
    rubric_criterion_max_points SMALLINT NOT NULL,
    rubric_criterion_position SMALLINT,
    rubric_criterion_metadata JSONB NOT NULL DEFAULT '{}',
    rubric_criterion_created_by BIGINT,
    rubric_criterion_updated_by BIGINT,
    rubric_criterion_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rubric_criterion_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_rubric_criterion_tenant FOREIGN KEY (rubric_criterion_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_rubric_criterion_organization FOREIGN KEY (rubric_criterion_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_rubric_criterion_rubric FOREIGN KEY (rubric_criterion_rubric_id) REFERENCES content.rubric(rubric_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_rubric_criterion_created_by FOREIGN KEY (rubric_criterion_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_rubric_criterion_updated_by FOREIGN KEY (rubric_criterion_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_rubric_criterion_rubric_id_key UNIQUE (rubric_criterion_rubric_id, rubric_criterion_key),
    CONSTRAINT chk_rubric_criterion_max_points_pos CHECK (rubric_criterion_max_points > 0)
);
CREATE INDEX idx_rubric_criterion_tenant_code ON content.rubric_criterion (rubric_criterion_tenant_code);
CREATE INDEX idx_rubric_criterion_organization_id ON content.rubric_criterion (rubric_criterion_organization_id);
CREATE INDEX idx_rubric_criterion_created_by ON content.rubric_criterion (rubric_criterion_created_by);
CREATE INDEX idx_rubric_criterion_updated_by ON content.rubric_criterion (rubric_criterion_updated_by);
CREATE TRIGGER trg_rubric_criterion_updated_at BEFORE UPDATE ON content.rubric_criterion
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('rubric_criterion_updated_at');

-- -----------------------------------------------------
-- Table: content.article_category
-- Purpose: Blog and help article categories.
-- -----------------------------------------------------
CREATE TABLE content.article_category (
    article_category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_category_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    article_category_tenant_code BIGINT NOT NULL,
    article_category_organization_id BIGINT NOT NULL,
    article_category_article_type VARCHAR(100) NOT NULL,
    article_category_key VARCHAR(40) NOT NULL,
    article_category_name VARCHAR(80) NOT NULL,
    article_category_description VARCHAR(200),
    article_category_sort_order INT NOT NULL DEFAULT 0,
    article_category_metadata JSONB NOT NULL DEFAULT '{}',
    article_category_created_by BIGINT,
    article_category_updated_by BIGINT,
    article_category_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    article_category_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_article_category_tenant FOREIGN KEY (article_category_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_category_organization FOREIGN KEY (article_category_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_category_article_type FOREIGN KEY (article_category_article_type) REFERENCES enums.article_type(article_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_article_category_created_by FOREIGN KEY (article_category_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_article_category_updated_by FOREIGN KEY (article_category_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_article_category_article_type_key UNIQUE (article_category_tenant_code, article_category_article_type, article_category_key)
);
CREATE INDEX idx_article_category_tenant_code ON content.article_category (article_category_tenant_code);
CREATE INDEX idx_article_category_organization_id ON content.article_category (article_category_organization_id);
CREATE INDEX idx_article_category_created_by ON content.article_category (article_category_created_by);
CREATE INDEX idx_article_category_updated_by ON content.article_category (article_category_updated_by);
CREATE INDEX idx_article_category_article_type ON content.article_category (article_category_article_type);
CREATE TRIGGER trg_article_category_updated_at BEFORE UPDATE ON content.article_category
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('article_category_updated_at');

-- -----------------------------------------------------
-- Table: content.article_author
-- Purpose: Article author box.
-- -----------------------------------------------------
CREATE TABLE content.article_author (
    article_author_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_author_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    article_author_tenant_code BIGINT NOT NULL,
    article_author_organization_id BIGINT NOT NULL,
    article_author_display_name VARCHAR(120) NOT NULL,
    article_author_title VARCHAR(120),
    article_author_bio TEXT,
    article_author_avatar_blob_id BIGINT,
    article_author_user_account_id BIGINT,
    article_author_metadata JSONB NOT NULL DEFAULT '{}',
    article_author_created_by BIGINT,
    article_author_updated_by BIGINT,
    article_author_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    article_author_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_article_author_tenant FOREIGN KEY (article_author_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_author_organization FOREIGN KEY (article_author_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_author_avatar_blob FOREIGN KEY (article_author_avatar_blob_id) REFERENCES storage.blob(blob_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_article_author_user_account FOREIGN KEY (article_author_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_article_author_created_by FOREIGN KEY (article_author_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_article_author_updated_by FOREIGN KEY (article_author_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_article_author_tenant_code ON content.article_author (article_author_tenant_code);
CREATE INDEX idx_article_author_organization_id ON content.article_author (article_author_organization_id);
CREATE INDEX idx_article_author_created_by ON content.article_author (article_author_created_by);
CREATE INDEX idx_article_author_updated_by ON content.article_author (article_author_updated_by);
CREATE INDEX idx_article_author_avatar_blob_id ON content.article_author (article_author_avatar_blob_id);
CREATE INDEX idx_article_author_user_account_id ON content.article_author (article_author_user_account_id);
CREATE TRIGGER trg_article_author_updated_at BEFORE UPDATE ON content.article_author
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('article_author_updated_at');

-- -----------------------------------------------------
-- Table: content.question
-- Purpose: Question body (1:1 with revision).
-- -----------------------------------------------------
CREATE TABLE content.question (
    question_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    question_tenant_code BIGINT NOT NULL,
    question_organization_id BIGINT NOT NULL,
    question_item_revision_id BIGINT NOT NULL,
    question_question_type_id BIGINT NOT NULL,
    question_passage_item_id BIGINT,
    question_group_position SMALLINT,
    question_blank_no SMALLINT,
    question_stem TEXT,
    question_stem_format VARCHAR(100) NOT NULL DEFAULT 'plain',
    question_reading_question_kind VARCHAR(100),
    question_difficulty SMALLINT NOT NULL DEFAULT 3,
    question_estimated_seconds INT,
    question_short_reason VARCHAR(300),
    question_explanation TEXT NOT NULL,
    question_metadata JSONB NOT NULL DEFAULT '{}',
    question_created_by BIGINT,
    question_updated_by BIGINT,
    question_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    question_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_question_tenant FOREIGN KEY (question_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_organization FOREIGN KEY (question_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_item_revision FOREIGN KEY (question_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_question_question_type FOREIGN KEY (question_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_passage_item FOREIGN KEY (question_passage_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_stem_format FOREIGN KEY (question_stem_format) REFERENCES enums.text_format(text_format_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_question_reading_question_kind FOREIGN KEY (question_reading_question_kind) REFERENCES enums.reading_question_kind(reading_question_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_question_created_by FOREIGN KEY (question_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_question_updated_by FOREIGN KEY (question_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_question_item_revision_id UNIQUE (question_item_revision_id),
    CONSTRAINT chk_question_difficulty_range CHECK (question_difficulty BETWEEN 1 AND 5),
    CONSTRAINT chk_question_group_position_pos CHECK (question_group_position > 0),
    CONSTRAINT chk_question_blank_no_pos CHECK (question_blank_no > 0),
    CONSTRAINT chk_question_passage_group_pair CHECK ((question_passage_item_id IS NULL) = (question_group_position IS NULL))
);
CREATE INDEX idx_question_tenant_code ON content.question (question_tenant_code);
CREATE INDEX idx_question_organization_id ON content.question (question_organization_id);
CREATE INDEX idx_question_created_by ON content.question (question_created_by);
CREATE INDEX idx_question_updated_by ON content.question (question_updated_by);
CREATE INDEX idx_question_question_type_id ON content.question (question_question_type_id);
CREATE INDEX idx_question_passage_item_id ON content.question (question_passage_item_id);
CREATE INDEX idx_question_stem_format ON content.question (question_stem_format);
CREATE INDEX idx_question_reading_question_kind ON content.question (question_reading_question_kind);
CREATE INDEX idx_question_stem ON content.question USING gin (question_stem gin_trgm_ops);
CREATE TRIGGER trg_question_updated_at BEFORE UPDATE ON content.question
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('question_updated_at');

-- -----------------------------------------------------
-- Table: content.question_option
-- Purpose: Answer option.
-- -----------------------------------------------------
CREATE TABLE content.question_option (
    question_option_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_option_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    question_option_tenant_code BIGINT NOT NULL,
    question_option_organization_id BIGINT NOT NULL,
    question_option_question_id BIGINT NOT NULL,
    question_option_label VARCHAR(2) NOT NULL,
    question_option_position SMALLINT NOT NULL,
    question_option_text TEXT NOT NULL,
    question_option_is_correct BOOLEAN NOT NULL DEFAULT false,
    question_option_rationale TEXT,
    question_option_metadata JSONB NOT NULL DEFAULT '{}',
    question_option_created_by BIGINT,
    question_option_updated_by BIGINT,
    question_option_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    question_option_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_question_option_tenant FOREIGN KEY (question_option_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_option_organization FOREIGN KEY (question_option_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_option_question FOREIGN KEY (question_option_question_id) REFERENCES content.question(question_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_question_option_created_by FOREIGN KEY (question_option_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_question_option_updated_by FOREIGN KEY (question_option_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_question_option_question_id_label UNIQUE (question_option_question_id, question_option_label),
    CONSTRAINT uq_question_option_question_id_position UNIQUE (question_option_question_id, question_option_position)
);
CREATE INDEX idx_question_option_tenant_code ON content.question_option (question_option_tenant_code);
CREATE INDEX idx_question_option_organization_id ON content.question_option (question_option_organization_id);
CREATE INDEX idx_question_option_created_by ON content.question_option (question_option_created_by);
CREATE INDEX idx_question_option_updated_by ON content.question_option (question_option_updated_by);
CREATE UNIQUE INDEX uq_question_option_single_correct ON content.question_option (question_option_question_id) WHERE question_option_is_correct;
CREATE TRIGGER trg_question_option_updated_at BEFORE UPDATE ON content.question_option
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('question_option_updated_at');

-- -----------------------------------------------------
-- Table: content.question_hint
-- Purpose: Progressive hint.
-- -----------------------------------------------------
CREATE TABLE content.question_hint (
    question_hint_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_hint_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    question_hint_tenant_code BIGINT NOT NULL,
    question_hint_organization_id BIGINT NOT NULL,
    question_hint_question_id BIGINT NOT NULL,
    question_hint_step_no SMALLINT NOT NULL,
    question_hint_hint_kind VARCHAR(100) NOT NULL,
    question_hint_body TEXT NOT NULL,
    question_hint_eliminates_labels VARCHAR(2)[] NOT NULL DEFAULT '{}',
    question_hint_metadata JSONB NOT NULL DEFAULT '{}',
    question_hint_created_by BIGINT,
    question_hint_updated_by BIGINT,
    question_hint_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    question_hint_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_question_hint_tenant FOREIGN KEY (question_hint_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_hint_organization FOREIGN KEY (question_hint_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_hint_question FOREIGN KEY (question_hint_question_id) REFERENCES content.question(question_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_question_hint_hint_kind FOREIGN KEY (question_hint_hint_kind) REFERENCES enums.hint_kind(hint_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_question_hint_created_by FOREIGN KEY (question_hint_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_question_hint_updated_by FOREIGN KEY (question_hint_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_question_hint_question_id_step_no UNIQUE (question_hint_question_id, question_hint_step_no),
    CONSTRAINT chk_question_hint_step_no_pos CHECK (question_hint_step_no > 0)
);
CREATE INDEX idx_question_hint_tenant_code ON content.question_hint (question_hint_tenant_code);
CREATE INDEX idx_question_hint_organization_id ON content.question_hint (question_hint_organization_id);
CREATE INDEX idx_question_hint_created_by ON content.question_hint (question_hint_created_by);
CREATE INDEX idx_question_hint_updated_by ON content.question_hint (question_hint_updated_by);
CREATE INDEX idx_question_hint_hint_kind ON content.question_hint (question_hint_hint_kind);
CREATE TRIGGER trg_question_hint_updated_at BEFORE UPDATE ON content.question_hint
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('question_hint_updated_at');

-- -----------------------------------------------------
-- Table: content.passage
-- Purpose: Passage body (1:1 with revision).
-- -----------------------------------------------------
CREATE TABLE content.passage (
    passage_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    passage_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    passage_tenant_code BIGINT NOT NULL,
    passage_organization_id BIGINT NOT NULL,
    passage_item_revision_id BIGINT NOT NULL,
    passage_passage_kind VARCHAR(100) NOT NULL,
    passage_title VARCHAR(200),
    passage_body TEXT NOT NULL,
    passage_body_format VARCHAR(100) NOT NULL DEFAULT 'plain',
    passage_word_count INT,
    passage_readability NUMERIC(5,2),
    passage_source_name VARCHAR(200),
    passage_source_url VARCHAR(400),
    passage_license VARCHAR(60),
    passage_attribution TEXT,
    passage_metadata JSONB NOT NULL DEFAULT '{}',
    passage_created_by BIGINT,
    passage_updated_by BIGINT,
    passage_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    passage_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_passage_tenant FOREIGN KEY (passage_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_organization FOREIGN KEY (passage_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_item_revision FOREIGN KEY (passage_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_passage_kind FOREIGN KEY (passage_passage_kind) REFERENCES enums.passage_kind(passage_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_passage_body_format FOREIGN KEY (passage_body_format) REFERENCES enums.text_format(text_format_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_passage_created_by FOREIGN KEY (passage_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_updated_by FOREIGN KEY (passage_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_passage_item_revision_id UNIQUE (passage_item_revision_id)
);
CREATE INDEX idx_passage_tenant_code ON content.passage (passage_tenant_code);
CREATE INDEX idx_passage_organization_id ON content.passage (passage_organization_id);
CREATE INDEX idx_passage_created_by ON content.passage (passage_created_by);
CREATE INDEX idx_passage_updated_by ON content.passage (passage_updated_by);
CREATE INDEX idx_passage_passage_kind ON content.passage (passage_passage_kind);
CREATE INDEX idx_passage_body_format ON content.passage (passage_body_format);
CREATE TRIGGER trg_passage_updated_at BEFORE UPDATE ON content.passage
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('passage_updated_at');

-- -----------------------------------------------------
-- Table: content.passage_term
-- Purpose: Glossed term of a passage.
-- -----------------------------------------------------
CREATE TABLE content.passage_term (
    passage_term_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    passage_term_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    passage_term_tenant_code BIGINT NOT NULL,
    passage_term_organization_id BIGINT NOT NULL,
    passage_term_passage_id BIGINT NOT NULL,
    passage_term_term VARCHAR(120) NOT NULL,
    passage_term_definition_tr TEXT NOT NULL,
    passage_term_vocab_item_id BIGINT,
    passage_term_metadata JSONB NOT NULL DEFAULT '{}',
    passage_term_created_by BIGINT,
    passage_term_updated_by BIGINT,
    passage_term_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    passage_term_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_passage_term_tenant FOREIGN KEY (passage_term_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_term_organization FOREIGN KEY (passage_term_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_term_passage FOREIGN KEY (passage_term_passage_id) REFERENCES content.passage(passage_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_term_vocab_item FOREIGN KEY (passage_term_vocab_item_id) REFERENCES content.item(item_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_term_created_by FOREIGN KEY (passage_term_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_passage_term_updated_by FOREIGN KEY (passage_term_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_passage_term_passage_id_term UNIQUE (passage_term_passage_id, passage_term_term)
);
CREATE INDEX idx_passage_term_tenant_code ON content.passage_term (passage_term_tenant_code);
CREATE INDEX idx_passage_term_organization_id ON content.passage_term (passage_term_organization_id);
CREATE INDEX idx_passage_term_created_by ON content.passage_term (passage_term_created_by);
CREATE INDEX idx_passage_term_updated_by ON content.passage_term (passage_term_updated_by);
CREATE INDEX idx_passage_term_vocab_item_id ON content.passage_term (passage_term_vocab_item_id);
CREATE TRIGGER trg_passage_term_updated_at BEFORE UPDATE ON content.passage_term
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('passage_term_updated_at');

-- -----------------------------------------------------
-- Table: content.note
-- Purpose: Bite-size note body (1:1 with revision).
-- -----------------------------------------------------
CREATE TABLE content.note (
    note_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    note_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    note_tenant_code BIGINT NOT NULL,
    note_organization_id BIGINT NOT NULL,
    note_item_revision_id BIGINT NOT NULL,
    note_note_kind VARCHAR(100) NOT NULL DEFAULT 'skill',
    note_title VARCHAR(200) NOT NULL,
    note_reading_seconds INT,
    note_rule_md TEXT NOT NULL,
    note_examples JSONB NOT NULL DEFAULT '[]',
    note_trap_md TEXT,
    note_summary VARCHAR(300),
    note_metadata JSONB NOT NULL DEFAULT '{}',
    note_created_by BIGINT,
    note_updated_by BIGINT,
    note_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    note_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_note_tenant FOREIGN KEY (note_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_note_organization FOREIGN KEY (note_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_note_item_revision FOREIGN KEY (note_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_note_note_kind FOREIGN KEY (note_note_kind) REFERENCES enums.note_kind(note_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_note_created_by FOREIGN KEY (note_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_note_updated_by FOREIGN KEY (note_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_note_item_revision_id UNIQUE (note_item_revision_id)
);
CREATE INDEX idx_note_tenant_code ON content.note (note_tenant_code);
CREATE INDEX idx_note_organization_id ON content.note (note_organization_id);
CREATE INDEX idx_note_created_by ON content.note (note_created_by);
CREATE INDEX idx_note_updated_by ON content.note (note_updated_by);
CREATE INDEX idx_note_note_kind ON content.note (note_note_kind);
CREATE TRIGGER trg_note_updated_at BEFORE UPDATE ON content.note
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('note_updated_at');

-- -----------------------------------------------------
-- Table: content.note_check_question
-- Purpose: Check question attached to a note.
-- -----------------------------------------------------
CREATE TABLE content.note_check_question (
    note_check_question_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    note_check_question_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    note_check_question_tenant_code BIGINT NOT NULL,
    note_check_question_organization_id BIGINT NOT NULL,
    note_check_question_note_id BIGINT NOT NULL,
    note_check_question_position SMALLINT NOT NULL,
    note_check_question_question_item_id BIGINT NOT NULL,
    note_check_question_metadata JSONB NOT NULL DEFAULT '{}',
    note_check_question_created_by BIGINT,
    note_check_question_updated_by BIGINT,
    note_check_question_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    note_check_question_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_note_check_question_tenant FOREIGN KEY (note_check_question_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_note_check_question_organization FOREIGN KEY (note_check_question_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_note_check_question_note FOREIGN KEY (note_check_question_note_id) REFERENCES content.note(note_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_note_check_question_question_item FOREIGN KEY (note_check_question_question_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_note_check_question_created_by FOREIGN KEY (note_check_question_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_note_check_question_updated_by FOREIGN KEY (note_check_question_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_note_check_question_note_id_position UNIQUE (note_check_question_note_id, note_check_question_position),
    CONSTRAINT chk_note_check_question_position_pos CHECK (note_check_question_position > 0)
);
CREATE INDEX idx_note_check_question_tenant_code ON content.note_check_question (note_check_question_tenant_code);
CREATE INDEX idx_note_check_question_organization_id ON content.note_check_question (note_check_question_organization_id);
CREATE INDEX idx_note_check_question_created_by ON content.note_check_question (note_check_question_created_by);
CREATE INDEX idx_note_check_question_updated_by ON content.note_check_question (note_check_question_updated_by);
CREATE INDEX idx_note_check_question_question_item_id ON content.note_check_question (note_check_question_question_item_id);
CREATE TRIGGER trg_note_check_question_updated_at BEFORE UPDATE ON content.note_check_question
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('note_check_question_updated_at');

-- -----------------------------------------------------
-- Table: content.vocab_entry
-- Purpose: Vocabulary entry body (1:1 with revision).
-- -----------------------------------------------------
CREATE TABLE content.vocab_entry (
    vocab_entry_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vocab_entry_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    vocab_entry_tenant_code BIGINT NOT NULL,
    vocab_entry_organization_id BIGINT NOT NULL,
    vocab_entry_item_revision_id BIGINT NOT NULL,
    vocab_entry_headword VARCHAR(120) NOT NULL,
    vocab_entry_headword_normalized VARCHAR(120) NOT NULL,
    vocab_entry_part_of_speech VARCHAR(100) NOT NULL,
    vocab_entry_pronunciation_ipa VARCHAR(120),
    vocab_entry_meanings JSONB NOT NULL,
    vocab_entry_examples JSONB NOT NULL DEFAULT '[]',
    vocab_entry_collocations JSONB NOT NULL DEFAULT '[]',
    vocab_entry_synonyms JSONB NOT NULL DEFAULT '[]',
    vocab_entry_antonyms JSONB NOT NULL DEFAULT '[]',
    vocab_entry_confusables JSONB NOT NULL DEFAULT '[]',
    vocab_entry_frequency_rank INT,
    vocab_entry_metadata JSONB NOT NULL DEFAULT '{}',
    vocab_entry_created_by BIGINT,
    vocab_entry_updated_by BIGINT,
    vocab_entry_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    vocab_entry_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_vocab_entry_tenant FOREIGN KEY (vocab_entry_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_vocab_entry_organization FOREIGN KEY (vocab_entry_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_vocab_entry_item_revision FOREIGN KEY (vocab_entry_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_vocab_entry_part_of_speech FOREIGN KEY (vocab_entry_part_of_speech) REFERENCES enums.part_of_speech(part_of_speech_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_vocab_entry_created_by FOREIGN KEY (vocab_entry_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_vocab_entry_updated_by FOREIGN KEY (vocab_entry_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_vocab_entry_item_revision_id UNIQUE (vocab_entry_item_revision_id)
);
CREATE INDEX idx_vocab_entry_tenant_code ON content.vocab_entry (vocab_entry_tenant_code);
CREATE INDEX idx_vocab_entry_organization_id ON content.vocab_entry (vocab_entry_organization_id);
CREATE INDEX idx_vocab_entry_created_by ON content.vocab_entry (vocab_entry_created_by);
CREATE INDEX idx_vocab_entry_updated_by ON content.vocab_entry (vocab_entry_updated_by);
CREATE INDEX idx_vocab_entry_headword_normalized ON content.vocab_entry (vocab_entry_headword_normalized);
CREATE INDEX idx_vocab_entry_part_of_speech ON content.vocab_entry (vocab_entry_part_of_speech);
CREATE TRIGGER trg_vocab_entry_updated_at BEFORE UPDATE ON content.vocab_entry
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('vocab_entry_updated_at');

-- -----------------------------------------------------
-- Table: content.translation_prompt
-- Purpose: Translation prompt body (1:1 with revision).
-- -----------------------------------------------------
CREATE TABLE content.translation_prompt (
    translation_prompt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    translation_prompt_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    translation_prompt_tenant_code BIGINT NOT NULL,
    translation_prompt_organization_id BIGINT NOT NULL,
    translation_prompt_item_revision_id BIGINT NOT NULL,
    translation_prompt_source_language VARCHAR(10) NOT NULL,
    translation_prompt_target_language VARCHAR(10) NOT NULL,
    translation_prompt_source_text TEXT NOT NULL,
    translation_prompt_reference_translation TEXT NOT NULL,
    translation_prompt_difficulty SMALLINT NOT NULL DEFAULT 3,
    translation_prompt_rubric_id BIGINT NOT NULL,
    translation_prompt_key_points JSONB NOT NULL DEFAULT '[]',
    translation_prompt_metadata JSONB NOT NULL DEFAULT '{}',
    translation_prompt_created_by BIGINT,
    translation_prompt_updated_by BIGINT,
    translation_prompt_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    translation_prompt_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_translation_prompt_tenant FOREIGN KEY (translation_prompt_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_prompt_organization FOREIGN KEY (translation_prompt_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_prompt_item_revision FOREIGN KEY (translation_prompt_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_prompt_rubric FOREIGN KEY (translation_prompt_rubric_id) REFERENCES content.rubric(rubric_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_prompt_created_by FOREIGN KEY (translation_prompt_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_translation_prompt_updated_by FOREIGN KEY (translation_prompt_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_translation_prompt_item_revision_id UNIQUE (translation_prompt_item_revision_id),
    CONSTRAINT chk_translation_prompt_languages_differ CHECK (translation_prompt_source_language <> translation_prompt_target_language),
    CONSTRAINT chk_translation_prompt_difficulty_range CHECK (translation_prompt_difficulty BETWEEN 1 AND 5)
);
CREATE INDEX idx_translation_prompt_tenant_code ON content.translation_prompt (translation_prompt_tenant_code);
CREATE INDEX idx_translation_prompt_organization_id ON content.translation_prompt (translation_prompt_organization_id);
CREATE INDEX idx_translation_prompt_created_by ON content.translation_prompt (translation_prompt_created_by);
CREATE INDEX idx_translation_prompt_updated_by ON content.translation_prompt (translation_prompt_updated_by);
CREATE INDEX idx_translation_prompt_rubric_id ON content.translation_prompt (translation_prompt_rubric_id);
CREATE INDEX idx_translation_prompt_source_language_target_language ON content.translation_prompt (translation_prompt_source_language, translation_prompt_target_language);
CREATE TRIGGER trg_translation_prompt_updated_at BEFORE UPDATE ON content.translation_prompt
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('translation_prompt_updated_at');

-- -----------------------------------------------------
-- Table: content.exam_form
-- Purpose: Mock exam form body (1:1 with revision).
-- -----------------------------------------------------
CREATE TABLE content.exam_form (
    exam_form_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_form_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    exam_form_tenant_code BIGINT NOT NULL,
    exam_form_organization_id BIGINT NOT NULL,
    exam_form_item_revision_id BIGINT NOT NULL,
    exam_form_form_type VARCHAR(100) NOT NULL,
    exam_form_blueprint_id BIGINT NOT NULL,
    exam_form_title VARCHAR(200) NOT NULL,
    exam_form_question_count SMALLINT NOT NULL,
    exam_form_duration_seconds INT NOT NULL,
    exam_form_is_recommended BOOLEAN NOT NULL DEFAULT false,
    exam_form_balance JSONB NOT NULL DEFAULT '{}',
    exam_form_metadata JSONB NOT NULL DEFAULT '{}',
    exam_form_created_by BIGINT,
    exam_form_updated_by BIGINT,
    exam_form_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exam_form_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_exam_form_tenant FOREIGN KEY (exam_form_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_organization FOREIGN KEY (exam_form_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_item_revision FOREIGN KEY (exam_form_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_form_type FOREIGN KEY (exam_form_form_type) REFERENCES enums.exam_form_type(exam_form_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_exam_form_blueprint FOREIGN KEY (exam_form_blueprint_id) REFERENCES content.blueprint(blueprint_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_created_by FOREIGN KEY (exam_form_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_updated_by FOREIGN KEY (exam_form_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_exam_form_item_revision_id UNIQUE (exam_form_item_revision_id),
    CONSTRAINT chk_exam_form_question_count_pos CHECK (exam_form_question_count > 0),
    CONSTRAINT chk_exam_form_duration_pos CHECK (exam_form_duration_seconds > 0)
);
CREATE INDEX idx_exam_form_tenant_code ON content.exam_form (exam_form_tenant_code);
CREATE INDEX idx_exam_form_organization_id ON content.exam_form (exam_form_organization_id);
CREATE INDEX idx_exam_form_created_by ON content.exam_form (exam_form_created_by);
CREATE INDEX idx_exam_form_updated_by ON content.exam_form (exam_form_updated_by);
CREATE INDEX idx_exam_form_form_type ON content.exam_form (exam_form_form_type);
CREATE INDEX idx_exam_form_blueprint_id ON content.exam_form (exam_form_blueprint_id);
CREATE TRIGGER trg_exam_form_updated_at BEFORE UPDATE ON content.exam_form
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('exam_form_updated_at');

-- -----------------------------------------------------
-- Table: content.exam_form_question
-- Purpose: Question slot of an exam form.
-- -----------------------------------------------------
CREATE TABLE content.exam_form_question (
    exam_form_question_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_form_question_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    exam_form_question_tenant_code BIGINT NOT NULL,
    exam_form_question_organization_id BIGINT NOT NULL,
    exam_form_question_exam_form_id BIGINT NOT NULL,
    exam_form_question_position SMALLINT NOT NULL,
    exam_form_question_question_item_id BIGINT NOT NULL,
    exam_form_question_blueprint_section_id BIGINT,
    exam_form_question_metadata JSONB NOT NULL DEFAULT '{}',
    exam_form_question_created_by BIGINT,
    exam_form_question_updated_by BIGINT,
    exam_form_question_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exam_form_question_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_exam_form_question_tenant FOREIGN KEY (exam_form_question_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_question_organization FOREIGN KEY (exam_form_question_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_question_exam_form FOREIGN KEY (exam_form_question_exam_form_id) REFERENCES content.exam_form(exam_form_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_question_question_item FOREIGN KEY (exam_form_question_question_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_question_blueprint_section FOREIGN KEY (exam_form_question_blueprint_section_id) REFERENCES content.blueprint_section(blueprint_section_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_question_created_by FOREIGN KEY (exam_form_question_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_form_question_updated_by FOREIGN KEY (exam_form_question_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_exam_form_question_exam_form_id_position UNIQUE (exam_form_question_exam_form_id, exam_form_question_position),
    CONSTRAINT uq_exam_form_question_exam_form_id_question_item_id UNIQUE (exam_form_question_exam_form_id, exam_form_question_question_item_id)
);
CREATE INDEX idx_exam_form_question_tenant_code ON content.exam_form_question (exam_form_question_tenant_code);
CREATE INDEX idx_exam_form_question_organization_id ON content.exam_form_question (exam_form_question_organization_id);
CREATE INDEX idx_exam_form_question_created_by ON content.exam_form_question (exam_form_question_created_by);
CREATE INDEX idx_exam_form_question_updated_by ON content.exam_form_question (exam_form_question_updated_by);
CREATE INDEX idx_exam_form_question_question_item_id ON content.exam_form_question (exam_form_question_question_item_id);
CREATE INDEX idx_exam_form_question_blueprint_section_id ON content.exam_form_question (exam_form_question_blueprint_section_id);
CREATE TRIGGER trg_exam_form_question_updated_at BEFORE UPDATE ON content.exam_form_question
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('exam_form_question_updated_at');

-- -----------------------------------------------------
-- Table: content.article
-- Purpose: Blog post, exam guide or help article (1:1 with revision).
-- -----------------------------------------------------
CREATE TABLE content.article (
    article_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    article_tenant_code BIGINT NOT NULL,
    article_organization_id BIGINT NOT NULL,
    article_item_revision_id BIGINT NOT NULL,
    article_article_type VARCHAR(100) NOT NULL,
    article_category_id BIGINT NOT NULL,
    article_author_id BIGINT,
    article_title VARCHAR(200) NOT NULL,
    article_excerpt VARCHAR(400),
    article_body_md TEXT NOT NULL,
    article_reading_minutes SMALLINT,
    article_cover_blob_id BIGINT,
    article_seo_title VARCHAR(70),
    article_seo_description VARCHAR(170),
    article_cta_key VARCHAR(60),
    article_toc JSONB NOT NULL DEFAULT '[]',
    article_metadata JSONB NOT NULL DEFAULT '{}',
    article_created_by BIGINT,
    article_updated_by BIGINT,
    article_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    article_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_article_tenant FOREIGN KEY (article_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_organization FOREIGN KEY (article_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_item_revision FOREIGN KEY (article_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_article_article_type FOREIGN KEY (article_article_type) REFERENCES enums.article_type(article_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_article_category FOREIGN KEY (article_category_id) REFERENCES content.article_category(article_category_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_author FOREIGN KEY (article_author_id) REFERENCES content.article_author(article_author_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_article_cover_blob FOREIGN KEY (article_cover_blob_id) REFERENCES storage.blob(blob_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_article_created_by FOREIGN KEY (article_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_article_updated_by FOREIGN KEY (article_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_article_item_revision_id UNIQUE (article_item_revision_id)
);
CREATE INDEX idx_article_tenant_code ON content.article (article_tenant_code);
CREATE INDEX idx_article_organization_id ON content.article (article_organization_id);
CREATE INDEX idx_article_created_by ON content.article (article_created_by);
CREATE INDEX idx_article_updated_by ON content.article (article_updated_by);
CREATE INDEX idx_article_article_type ON content.article (article_article_type);
CREATE INDEX idx_article_category_id ON content.article (article_category_id);
CREATE INDEX idx_article_author_id ON content.article (article_author_id);
CREATE INDEX idx_article_cover_blob_id ON content.article (article_cover_blob_id);
CREATE INDEX idx_article_search ON content.article USING gin (to_tsvector('turkish', article_title || ' ' || article_body_md));
CREATE TRIGGER trg_article_updated_at BEFORE UPDATE ON content.article
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('article_updated_at');

-- -----------------------------------------------------
-- Table: content.featured_item
-- Purpose: Featured placements on the landing site.
-- -----------------------------------------------------
CREATE TABLE content.featured_item (
    featured_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    featured_item_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    featured_item_tenant_code BIGINT NOT NULL,
    featured_item_organization_id BIGINT NOT NULL,
    featured_item_placement VARCHAR(100) NOT NULL,
    featured_item_item_id BIGINT NOT NULL,
    featured_item_sort_order INT NOT NULL DEFAULT 0,
    featured_item_is_active BOOLEAN NOT NULL DEFAULT true,
    featured_item_metadata JSONB NOT NULL DEFAULT '{}',
    featured_item_created_by BIGINT,
    featured_item_updated_by BIGINT,
    featured_item_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    featured_item_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_featured_item_tenant FOREIGN KEY (featured_item_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_featured_item_organization FOREIGN KEY (featured_item_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_featured_item_placement FOREIGN KEY (featured_item_placement) REFERENCES enums.featured_placement(featured_placement_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_featured_item_item FOREIGN KEY (featured_item_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_featured_item_created_by FOREIGN KEY (featured_item_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_featured_item_updated_by FOREIGN KEY (featured_item_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_featured_item_placement_item_id UNIQUE (featured_item_placement, featured_item_item_id)
);
CREATE INDEX idx_featured_item_tenant_code ON content.featured_item (featured_item_tenant_code);
CREATE INDEX idx_featured_item_organization_id ON content.featured_item (featured_item_organization_id);
CREATE INDEX idx_featured_item_created_by ON content.featured_item (featured_item_created_by);
CREATE INDEX idx_featured_item_updated_by ON content.featured_item (featured_item_updated_by);
CREATE INDEX idx_featured_item_item_id ON content.featured_item (featured_item_item_id);
CREATE TRIGGER trg_featured_item_updated_at BEFORE UPDATE ON content.featured_item
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('featured_item_updated_at');

-- -----------------------------------------------------
-- Table: content.deck
-- Purpose: Vocabulary deck.
-- -----------------------------------------------------
CREATE TABLE content.deck (
    deck_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deck_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    deck_tenant_code BIGINT NOT NULL,
    deck_organization_id BIGINT NOT NULL,
    deck_key VARCHAR(60) NOT NULL,
    deck_name VARCHAR(120) NOT NULL,
    deck_description TEXT,
    deck_exam_id BIGINT,
    deck_subject_area_id BIGINT,
    deck_status VARCHAR(100) NOT NULL,
    deck_access_tier VARCHAR(100) NOT NULL,
    deck_default_new_per_day SMALLINT NOT NULL DEFAULT 10,
    deck_sort_order INT NOT NULL DEFAULT 0,
    deck_metadata JSONB NOT NULL DEFAULT '{}',
    deck_created_by BIGINT,
    deck_updated_by BIGINT,
    deck_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deck_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_deck_tenant FOREIGN KEY (deck_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_organization FOREIGN KEY (deck_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_exam FOREIGN KEY (deck_exam_id) REFERENCES content.exam(exam_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_subject_area FOREIGN KEY (deck_subject_area_id) REFERENCES content.subject_area(subject_area_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_status FOREIGN KEY (deck_status) REFERENCES enums.content_status(content_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_deck_access_tier FOREIGN KEY (deck_access_tier) REFERENCES enums.access_tier(access_tier_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_deck_created_by FOREIGN KEY (deck_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_updated_by FOREIGN KEY (deck_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_deck_key UNIQUE (deck_tenant_code, deck_key)
);
CREATE INDEX idx_deck_tenant_code ON content.deck (deck_tenant_code);
CREATE INDEX idx_deck_organization_id ON content.deck (deck_organization_id);
CREATE INDEX idx_deck_created_by ON content.deck (deck_created_by);
CREATE INDEX idx_deck_updated_by ON content.deck (deck_updated_by);
CREATE INDEX idx_deck_exam_id ON content.deck (deck_exam_id);
CREATE INDEX idx_deck_subject_area_id ON content.deck (deck_subject_area_id);
CREATE INDEX idx_deck_status ON content.deck (deck_status);
CREATE INDEX idx_deck_access_tier ON content.deck (deck_access_tier);
CREATE TRIGGER trg_deck_updated_at BEFORE UPDATE ON content.deck
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('deck_updated_at');

-- -----------------------------------------------------
-- Table: content.deck_entry
-- Purpose: Vocabulary item inside a deck.
-- -----------------------------------------------------
CREATE TABLE content.deck_entry (
    deck_entry_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deck_entry_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    deck_entry_tenant_code BIGINT NOT NULL,
    deck_entry_organization_id BIGINT NOT NULL,
    deck_entry_deck_id BIGINT NOT NULL,
    deck_entry_vocab_item_id BIGINT NOT NULL,
    deck_entry_position INT NOT NULL,
    deck_entry_metadata JSONB NOT NULL DEFAULT '{}',
    deck_entry_created_by BIGINT,
    deck_entry_updated_by BIGINT,
    deck_entry_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deck_entry_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_deck_entry_tenant FOREIGN KEY (deck_entry_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_entry_organization FOREIGN KEY (deck_entry_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_entry_deck FOREIGN KEY (deck_entry_deck_id) REFERENCES content.deck(deck_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_entry_vocab_item FOREIGN KEY (deck_entry_vocab_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_entry_created_by FOREIGN KEY (deck_entry_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_entry_updated_by FOREIGN KEY (deck_entry_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_deck_entry_deck_id_vocab_item_id UNIQUE (deck_entry_deck_id, deck_entry_vocab_item_id),
    CONSTRAINT uq_deck_entry_deck_id_position UNIQUE (deck_entry_deck_id, deck_entry_position)
);
CREATE INDEX idx_deck_entry_tenant_code ON content.deck_entry (deck_entry_tenant_code);
CREATE INDEX idx_deck_entry_organization_id ON content.deck_entry (deck_entry_organization_id);
CREATE INDEX idx_deck_entry_created_by ON content.deck_entry (deck_entry_created_by);
CREATE INDEX idx_deck_entry_updated_by ON content.deck_entry (deck_entry_updated_by);
CREATE INDEX idx_deck_entry_vocab_item_id ON content.deck_entry (deck_entry_vocab_item_id);
CREATE TRIGGER trg_deck_entry_updated_at BEFORE UPDATE ON content.deck_entry
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('deck_entry_updated_at');

-- -----------------------------------------------------
-- Table: content.generation_job
-- Purpose: AI content generation job (CMS-05).
-- -----------------------------------------------------
CREATE TABLE content.generation_job (
    generation_job_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    generation_job_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    generation_job_tenant_code BIGINT NOT NULL,
    generation_job_organization_id BIGINT NOT NULL,
    generation_job_requested_by BIGINT,
    generation_job_status VARCHAR(100) NOT NULL,
    generation_job_params JSONB NOT NULL,
    generation_job_requested_count SMALLINT NOT NULL,
    generation_job_produced_count SMALLINT NOT NULL DEFAULT 0,
    generation_job_failed_count SMALLINT NOT NULL DEFAULT 0,
    generation_job_model VARCHAR(60),
    generation_job_cost_micros BIGINT NOT NULL DEFAULT 0,
    generation_job_started_at TIMESTAMPTZ,
    generation_job_finished_at TIMESTAMPTZ,
    generation_job_error TEXT,
    generation_job_metadata JSONB NOT NULL DEFAULT '{}',
    generation_job_created_by BIGINT,
    generation_job_updated_by BIGINT,
    generation_job_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    generation_job_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_generation_job_tenant FOREIGN KEY (generation_job_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_generation_job_organization FOREIGN KEY (generation_job_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_generation_job_requested_by FOREIGN KEY (generation_job_requested_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_generation_job_status FOREIGN KEY (generation_job_status) REFERENCES enums.generation_job_status(generation_job_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_generation_job_created_by FOREIGN KEY (generation_job_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_generation_job_updated_by FOREIGN KEY (generation_job_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT chk_generation_job_requested_count_range CHECK (generation_job_requested_count BETWEEN 1 AND 50)
);
CREATE INDEX idx_generation_job_tenant_code ON content.generation_job (generation_job_tenant_code);
CREATE INDEX idx_generation_job_organization_id ON content.generation_job (generation_job_organization_id);
CREATE INDEX idx_generation_job_created_by ON content.generation_job (generation_job_created_by);
CREATE INDEX idx_generation_job_updated_by ON content.generation_job (generation_job_updated_by);
CREATE INDEX idx_generation_job_status_created_at ON content.generation_job (generation_job_status, generation_job_created_at);
CREATE INDEX idx_generation_job_requested_by ON content.generation_job (generation_job_requested_by);
CREATE TRIGGER trg_generation_job_updated_at BEFORE UPDATE ON content.generation_job
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('generation_job_updated_at');

-- -----------------------------------------------------
-- Table: content.exam_calendar_import
-- Purpose: ÖSYM takvim taraması; önerilen oturum değişiklikleri onaylanınca exam_session'a yazılır.
-- -----------------------------------------------------
CREATE TABLE content.exam_calendar_import (
    exam_calendar_import_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_calendar_import_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    exam_calendar_import_tenant_code BIGINT NOT NULL,
    exam_calendar_import_organization_id BIGINT NOT NULL,
    exam_calendar_import_status VARCHAR(100) NOT NULL,
    exam_calendar_import_source_url VARCHAR(400),
    exam_calendar_import_source_year SMALLINT,
    exam_calendar_import_source_hash VARCHAR(64),
    exam_calendar_import_parser VARCHAR(20),
    exam_calendar_import_proposals JSONB NOT NULL DEFAULT '[]',
    exam_calendar_import_error TEXT,
    exam_calendar_import_decided_by BIGINT,
    exam_calendar_import_decided_at TIMESTAMPTZ,
    exam_calendar_import_metadata JSONB NOT NULL DEFAULT '{}',
    exam_calendar_import_created_by BIGINT,
    exam_calendar_import_updated_by BIGINT,
    exam_calendar_import_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exam_calendar_import_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_exam_calendar_import_tenant FOREIGN KEY (exam_calendar_import_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_calendar_import_organization FOREIGN KEY (exam_calendar_import_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_calendar_import_status FOREIGN KEY (exam_calendar_import_status) REFERENCES enums.calendar_import_status(calendar_import_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_exam_calendar_import_decided_by FOREIGN KEY (exam_calendar_import_decided_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_calendar_import_created_by FOREIGN KEY (exam_calendar_import_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_calendar_import_updated_by FOREIGN KEY (exam_calendar_import_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_exam_calendar_import_tenant_code ON content.exam_calendar_import (exam_calendar_import_tenant_code);
CREATE INDEX idx_exam_calendar_import_organization_id ON content.exam_calendar_import (exam_calendar_import_organization_id);
CREATE INDEX idx_exam_calendar_import_status_created_at ON content.exam_calendar_import (exam_calendar_import_status, exam_calendar_import_created_at);
CREATE INDEX idx_exam_calendar_import_source_hash ON content.exam_calendar_import (exam_calendar_import_source_hash);
CREATE INDEX idx_exam_calendar_import_decided_by ON content.exam_calendar_import (exam_calendar_import_decided_by);
CREATE INDEX idx_exam_calendar_import_created_by ON content.exam_calendar_import (exam_calendar_import_created_by);
CREATE INDEX idx_exam_calendar_import_updated_by ON content.exam_calendar_import (exam_calendar_import_updated_by);
CREATE TRIGGER trg_exam_calendar_import_updated_at BEFORE UPDATE ON content.exam_calendar_import
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('exam_calendar_import_updated_at');

-- -----------------------------------------------------
-- Table: content.content_report
-- Purpose: Learner "report an error" on content.
-- -----------------------------------------------------
CREATE TABLE content.content_report (
    content_report_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content_report_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    content_report_tenant_code BIGINT NOT NULL,
    content_report_organization_id BIGINT NOT NULL,
    content_report_reporter_organization_id BIGINT,
    content_report_item_id BIGINT NOT NULL,
    content_report_item_revision_id BIGINT,
    content_report_reporter_user_account_id BIGINT,
    content_report_reason VARCHAR(100) NOT NULL,
    content_report_note VARCHAR(1000),
    content_report_context JSONB,
    content_report_status VARCHAR(100) NOT NULL DEFAULT 'open',
    content_report_resolved_by BIGINT,
    content_report_resolved_at TIMESTAMPTZ,
    content_report_resolution_note TEXT,
    content_report_metadata JSONB NOT NULL DEFAULT '{}',
    content_report_created_by BIGINT,
    content_report_updated_by BIGINT,
    content_report_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_report_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_content_report_tenant FOREIGN KEY (content_report_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_organization FOREIGN KEY (content_report_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_reporter_organization FOREIGN KEY (content_report_reporter_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_item FOREIGN KEY (content_report_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_item_revision FOREIGN KEY (content_report_item_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_reporter_user_account FOREIGN KEY (content_report_reporter_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_reason FOREIGN KEY (content_report_reason) REFERENCES enums.report_reason(report_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_content_report_status FOREIGN KEY (content_report_status) REFERENCES enums.report_status(report_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_content_report_resolved_by FOREIGN KEY (content_report_resolved_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_created_by FOREIGN KEY (content_report_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_content_report_updated_by FOREIGN KEY (content_report_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_content_report_tenant_code ON content.content_report (content_report_tenant_code);
CREATE INDEX idx_content_report_organization_id ON content.content_report (content_report_organization_id);
CREATE INDEX idx_content_report_created_by ON content.content_report (content_report_created_by);
CREATE INDEX idx_content_report_updated_by ON content.content_report (content_report_updated_by);
CREATE INDEX idx_content_report_status_created_at ON content.content_report (content_report_status, content_report_created_at);
CREATE INDEX idx_content_report_item_id ON content.content_report (content_report_item_id);
CREATE INDEX idx_content_report_item_revision_id ON content.content_report (content_report_item_revision_id);
CREATE INDEX idx_content_report_reporter_user_account_id ON content.content_report (content_report_reporter_user_account_id);
CREATE INDEX idx_content_report_reporter_organization_id ON content.content_report (content_report_reporter_organization_id);
CREATE INDEX idx_content_report_reason ON content.content_report (content_report_reason);
CREATE INDEX idx_content_report_resolved_by ON content.content_report (content_report_resolved_by);
CREATE TRIGGER trg_content_report_updated_at BEFORE UPDATE ON content.content_report
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('content_report_updated_at');

-- -----------------------------------------------------
-- Table: content.item_stat
-- Purpose: Nightly statistics summary per item.
-- -----------------------------------------------------
CREATE TABLE content.item_stat (
    item_stat_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_stat_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    item_stat_tenant_code BIGINT NOT NULL,
    item_stat_organization_id BIGINT NOT NULL,
    item_stat_item_id BIGINT NOT NULL,
    item_stat_attempt_count INT NOT NULL DEFAULT 0,
    item_stat_correct_rate NUMERIC(5,4),
    item_stat_avg_time_ms INT,
    item_stat_option_pick_counts JSONB,
    item_stat_hint_usage_rate NUMERIC(5,4),
    item_stat_report_count INT NOT NULL DEFAULT 0,
    item_stat_discrimination NUMERIC(5,4),
    item_stat_computed_at TIMESTAMPTZ,
    item_stat_metadata JSONB NOT NULL DEFAULT '{}',
    item_stat_created_by BIGINT,
    item_stat_updated_by BIGINT,
    item_stat_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_stat_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_item_stat_tenant FOREIGN KEY (item_stat_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_stat_organization FOREIGN KEY (item_stat_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_item_stat_item FOREIGN KEY (item_stat_item_id) REFERENCES content.item(item_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_item_stat_created_by FOREIGN KEY (item_stat_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_item_stat_updated_by FOREIGN KEY (item_stat_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT uq_item_stat_item_id UNIQUE (item_stat_item_id)
);
CREATE INDEX idx_item_stat_tenant_code ON content.item_stat (item_stat_tenant_code);
CREATE INDEX idx_item_stat_organization_id ON content.item_stat (item_stat_organization_id);
CREATE INDEX idx_item_stat_created_by ON content.item_stat (item_stat_created_by);
CREATE INDEX idx_item_stat_updated_by ON content.item_stat (item_stat_updated_by);
CREATE TRIGGER trg_item_stat_updated_at BEFORE UPDATE ON content.item_stat
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('item_stat_updated_at');

-- -----------------------------------------------------
-- Circular / forward foreign keys
-- -----------------------------------------------------
ALTER TABLE content.item
    ADD CONSTRAINT fk_item_latest_revision FOREIGN KEY (item_latest_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    ADD CONSTRAINT fk_item_published_revision FOREIGN KEY (item_published_revision_id) REFERENCES content.item_revision(item_revision_id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE content.item_revision
    ADD CONSTRAINT fk_item_revision_generation_job FOREIGN KEY (item_revision_generation_job_id) REFERENCES content.generation_job(generation_job_id) ON DELETE SET NULL ON UPDATE NO ACTION;

-- -----------------------------------------------------
-- Cross-schema FK into identity (content.exam must exist first)
-- -----------------------------------------------------
ALTER TABLE identity.waitlist_entry ADD CONSTRAINT fk_waitlist_entry_exam FOREIGN KEY (waitlist_entry_exam_id) REFERENCES content.exam(exam_id) ON DELETE RESTRICT;

-- -----------------------------------------------------
-- Table: content.word_gloss
-- Purpose: Dokun-çevir sözlük önbelleği — küratörlü sözlükte olmayan kelimenin AI açıklaması (biçim başına bir kez üretilir)
-- -----------------------------------------------------
CREATE TABLE content.word_gloss (
    word_gloss_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    word_gloss_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    word_gloss_tenant_code BIGINT NOT NULL,
    word_gloss_organization_id BIGINT,
    word_gloss_language VARCHAR(10) NOT NULL DEFAULT 'en',
    word_gloss_form VARCHAR(80) NOT NULL,
    word_gloss_lemma VARCHAR(80) NOT NULL,
    word_gloss_part_of_speech VARCHAR(100),
    word_gloss_pronunciation_ipa VARCHAR(120),
    word_gloss_form_note VARCHAR(200),
    word_gloss_meanings JSONB NOT NULL DEFAULT '[]',
    word_gloss_examples JSONB NOT NULL DEFAULT '[]',
    word_gloss_is_word BOOLEAN NOT NULL DEFAULT true,
    word_gloss_vocab_item_id BIGINT,
    word_gloss_model VARCHAR(120),
    word_gloss_lookup_count INT NOT NULL DEFAULT 0,
    word_gloss_metadata JSONB NOT NULL DEFAULT '{}',
    word_gloss_created_by BIGINT,
    word_gloss_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    word_gloss_updated_by BIGINT,
    word_gloss_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_word_gloss_tenant_language_form UNIQUE (word_gloss_tenant_code, word_gloss_language, word_gloss_form),
    CONSTRAINT fk_word_gloss_tenant FOREIGN KEY (word_gloss_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_word_gloss_organization FOREIGN KEY (word_gloss_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_word_gloss_vocab_item FOREIGN KEY (word_gloss_vocab_item_id) REFERENCES content.item(item_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_word_gloss_created_by FOREIGN KEY (word_gloss_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_word_gloss_updated_by FOREIGN KEY (word_gloss_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_word_gloss_tenant_code ON content.word_gloss (word_gloss_tenant_code);
CREATE INDEX idx_word_gloss_organization_id ON content.word_gloss (word_gloss_organization_id);
CREATE INDEX idx_word_gloss_lemma ON content.word_gloss (word_gloss_lemma);
CREATE INDEX idx_word_gloss_vocab_item_id ON content.word_gloss (word_gloss_vocab_item_id);
CREATE INDEX idx_word_gloss_created_by ON content.word_gloss (word_gloss_created_by);
CREATE INDEX idx_word_gloss_updated_by ON content.word_gloss (word_gloss_updated_by);
CREATE TRIGGER trg_word_gloss_updated_at BEFORE UPDATE ON content.word_gloss FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('word_gloss_updated_at');

-- -----------------------------------------------------
-- Table: content.sentence_translation
-- Purpose: Dokun-çevir cümle çevirisi önbelleği — normalize cümle metninin SHA-256'sı başına bir çeviri
-- -----------------------------------------------------
CREATE TABLE content.sentence_translation (
    sentence_translation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sentence_translation_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    sentence_translation_tenant_code BIGINT NOT NULL,
    sentence_translation_organization_id BIGINT,
    sentence_translation_hash CHAR(64) NOT NULL,
    sentence_translation_source_language VARCHAR(10) NOT NULL DEFAULT 'en',
    sentence_translation_target_language VARCHAR(10) NOT NULL DEFAULT 'tr',
    sentence_translation_source_text TEXT NOT NULL,
    sentence_translation_text TEXT NOT NULL,
    sentence_translation_model VARCHAR(120),
    sentence_translation_hit_count INT NOT NULL DEFAULT 0,
    sentence_translation_metadata JSONB NOT NULL DEFAULT '{}',
    sentence_translation_created_by BIGINT,
    sentence_translation_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sentence_translation_updated_by BIGINT,
    sentence_translation_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sentence_translation_tenant_hash UNIQUE (sentence_translation_tenant_code, sentence_translation_hash),
    CONSTRAINT fk_sentence_translation_tenant FOREIGN KEY (sentence_translation_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_sentence_translation_organization FOREIGN KEY (sentence_translation_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_sentence_translation_created_by FOREIGN KEY (sentence_translation_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_sentence_translation_updated_by FOREIGN KEY (sentence_translation_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_sentence_translation_tenant_code ON content.sentence_translation (sentence_translation_tenant_code);
CREATE INDEX idx_sentence_translation_organization_id ON content.sentence_translation (sentence_translation_organization_id);
CREATE INDEX idx_sentence_translation_created_by ON content.sentence_translation (sentence_translation_created_by);
CREATE INDEX idx_sentence_translation_updated_by ON content.sentence_translation (sentence_translation_updated_by);
CREATE TRIGGER trg_sentence_translation_updated_at BEFORE UPDATE ON content.sentence_translation FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('sentence_translation_updated_at');
