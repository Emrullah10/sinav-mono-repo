-- P0 başlangıç şeması: 06-learning-schema.sql (docs/PLAN-P0.md §2).
--
-- NEDEN: çalışan veritabanlarının taze kurulumla aynı şemaya ulaşması.
-- Idempotent değil; defter (public.schema_migrations) her dosyayı bir kez çalıştırır.
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-08-7-p0-learning.sql
BEGIN;

-- learning schema (owner: learning service). Student data: personal org scope, CASCADE on org/user delete, no created_by/updated_by FKs.
-- Depends on: 00-enums, 01-identity, 05-content.

CREATE SCHEMA IF NOT EXISTS learning;

-- -----------------------------------------------------
-- Table: learning.enrollment
-- Purpose: Active exam enrollment and target per learner
-- -----------------------------------------------------
CREATE TABLE learning.enrollment (
    enrollment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    enrollment_tenant_code BIGINT NOT NULL,
    enrollment_organization_id BIGINT NOT NULL,
    enrollment_user_account_id BIGINT NOT NULL,
    enrollment_track_id BIGINT NOT NULL,
    enrollment_status VARCHAR(100) NOT NULL DEFAULT 'active',
    enrollment_is_active BOOLEAN NOT NULL DEFAULT true,
    enrollment_target_score NUMERIC(6,2) NOT NULL,
    enrollment_date_mode VARCHAR(100) NOT NULL,
    enrollment_exam_session_id BIGINT,
    enrollment_custom_exam_date DATE,
    enrollment_started_at TIMESTAMPTZ NOT NULL,
    enrollment_completed_at TIMESTAMPTZ,
    enrollment_metadata JSONB NOT NULL DEFAULT '{}',
    enrollment_created_by BIGINT,
    enrollment_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    enrollment_updated_by BIGINT,
    enrollment_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_enrollment_date CHECK ((enrollment_date_mode='session' AND enrollment_exam_session_id IS NOT NULL) OR (enrollment_date_mode='custom' AND enrollment_custom_exam_date IS NOT NULL) OR (enrollment_date_mode='unknown' AND enrollment_exam_session_id IS NULL AND enrollment_custom_exam_date IS NULL)),
    CONSTRAINT chk_enrollment_target_score CHECK (enrollment_target_score >= 0),
    CONSTRAINT fk_enrollment_tenant FOREIGN KEY (enrollment_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_organization FOREIGN KEY (enrollment_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_user_account FOREIGN KEY (enrollment_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_track FOREIGN KEY (enrollment_track_id) REFERENCES content.exam_track(exam_track_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_status FOREIGN KEY (enrollment_status) REFERENCES enums.enrollment_status(enrollment_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_enrollment_date_mode FOREIGN KEY (enrollment_date_mode) REFERENCES enums.exam_date_mode(exam_date_mode_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_enrollment_exam_session FOREIGN KEY (enrollment_exam_session_id) REFERENCES content.exam_session(exam_session_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX uq_enrollment_active ON learning.enrollment (enrollment_user_account_id) WHERE enrollment_is_active;
CREATE INDEX idx_enrollment_user_account_id ON learning.enrollment (enrollment_user_account_id);
CREATE INDEX idx_enrollment_track_id ON learning.enrollment (enrollment_track_id);
CREATE INDEX idx_enrollment_status ON learning.enrollment (enrollment_status);
CREATE INDEX idx_enrollment_date_mode ON learning.enrollment (enrollment_date_mode);
CREATE INDEX idx_enrollment_exam_session_id ON learning.enrollment (enrollment_exam_session_id);
CREATE INDEX idx_enrollment_tenant_code ON learning.enrollment (enrollment_tenant_code);
CREATE INDEX idx_enrollment_organization_id ON learning.enrollment (enrollment_organization_id);
CREATE TRIGGER trg_enrollment_updated_at BEFORE UPDATE ON learning.enrollment FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('enrollment_updated_at');

-- -----------------------------------------------------
-- Table: learning.enrollment_reason
-- Purpose: Goal reasons chosen for an enrollment
-- -----------------------------------------------------
CREATE TABLE learning.enrollment_reason (
    enrollment_reason_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_reason_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    enrollment_reason_tenant_code BIGINT NOT NULL,
    enrollment_reason_organization_id BIGINT NOT NULL,
    enrollment_reason_user_account_id BIGINT NOT NULL,
    enrollment_reason_enrollment_id BIGINT NOT NULL,
    enrollment_reason_goal_reason_id BIGINT NOT NULL,
    enrollment_reason_metadata JSONB NOT NULL DEFAULT '{}',
    enrollment_reason_created_by BIGINT,
    enrollment_reason_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    enrollment_reason_updated_by BIGINT,
    enrollment_reason_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_enrollment_reason_enrollment_id_goal_reason_id UNIQUE (enrollment_reason_enrollment_id, enrollment_reason_goal_reason_id),
    CONSTRAINT fk_enrollment_reason_tenant FOREIGN KEY (enrollment_reason_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_reason_organization FOREIGN KEY (enrollment_reason_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_reason_user_account FOREIGN KEY (enrollment_reason_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_reason_enrollment FOREIGN KEY (enrollment_reason_enrollment_id) REFERENCES learning.enrollment(enrollment_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_enrollment_reason_goal_reason FOREIGN KEY (enrollment_reason_goal_reason_id) REFERENCES content.goal_reason(goal_reason_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_enrollment_reason_goal_reason_id ON learning.enrollment_reason (enrollment_reason_goal_reason_id);
CREATE INDEX idx_enrollment_reason_tenant_code ON learning.enrollment_reason (enrollment_reason_tenant_code);
CREATE INDEX idx_enrollment_reason_organization_id ON learning.enrollment_reason (enrollment_reason_organization_id);
CREATE INDEX idx_enrollment_reason_user_account_id ON learning.enrollment_reason (enrollment_reason_user_account_id);
CREATE TRIGGER trg_enrollment_reason_updated_at BEFORE UPDATE ON learning.enrollment_reason FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('enrollment_reason_updated_at');

-- -----------------------------------------------------
-- Table: learning.weekly_availability
-- Purpose: Daily study minutes per ISO weekday
-- -----------------------------------------------------
CREATE TABLE learning.weekly_availability (
    weekly_availability_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    weekly_availability_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    weekly_availability_tenant_code BIGINT NOT NULL,
    weekly_availability_organization_id BIGINT NOT NULL,
    weekly_availability_user_account_id BIGINT NOT NULL,
    weekly_availability_weekday SMALLINT NOT NULL,
    weekly_availability_minutes SMALLINT NOT NULL,
    weekly_availability_metadata JSONB NOT NULL DEFAULT '{}',
    weekly_availability_created_by BIGINT,
    weekly_availability_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    weekly_availability_updated_by BIGINT,
    weekly_availability_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_weekly_availability_user_account_id_weekday UNIQUE (weekly_availability_user_account_id, weekly_availability_weekday),
    CONSTRAINT chk_weekly_availability_weekday CHECK (weekly_availability_weekday BETWEEN 1 AND 7),
    CONSTRAINT chk_weekly_availability_minutes CHECK (weekly_availability_minutes BETWEEN 0 AND 240),
    CONSTRAINT fk_weekly_availability_tenant FOREIGN KEY (weekly_availability_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_weekly_availability_organization FOREIGN KEY (weekly_availability_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_weekly_availability_user_account FOREIGN KEY (weekly_availability_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX idx_weekly_availability_tenant_code ON learning.weekly_availability (weekly_availability_tenant_code);
CREATE INDEX idx_weekly_availability_organization_id ON learning.weekly_availability (weekly_availability_organization_id);
CREATE TRIGGER trg_weekly_availability_updated_at BEFORE UPDATE ON learning.weekly_availability FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('weekly_availability_updated_at');

-- -----------------------------------------------------
-- Table: learning.learner_setting
-- Purpose: Per-learner study settings (1:1)
-- -----------------------------------------------------
CREATE TABLE learning.learner_setting (
    learner_setting_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    learner_setting_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    learner_setting_tenant_code BIGINT NOT NULL,
    learner_setting_organization_id BIGINT NOT NULL,
    learner_setting_user_account_id BIGINT NOT NULL,
    learner_setting_default_mock_mode VARCHAR(100) NOT NULL DEFAULT 'standard',
    learner_setting_extra_time_percent SMALLINT NOT NULL DEFAULT 0,
    learner_setting_diagnostic_skipped_at TIMESTAMPTZ,
    learner_setting_onboarding_completed_at TIMESTAMPTZ,
    learner_setting_metadata JSONB NOT NULL DEFAULT '{}',
    learner_setting_created_by BIGINT,
    learner_setting_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    learner_setting_updated_by BIGINT,
    learner_setting_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_learner_setting_user_account_id UNIQUE (learner_setting_user_account_id),
    CONSTRAINT chk_learner_setting_extra_time CHECK (learner_setting_extra_time_percent IN (0, 25, 50)),
    CONSTRAINT fk_learner_setting_tenant FOREIGN KEY (learner_setting_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_learner_setting_organization FOREIGN KEY (learner_setting_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_learner_setting_user_account FOREIGN KEY (learner_setting_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_learner_setting_default_mock_mode FOREIGN KEY (learner_setting_default_mock_mode) REFERENCES enums.study_mode(study_mode_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_learner_setting_default_mock_mode ON learning.learner_setting (learner_setting_default_mock_mode);
CREATE INDEX idx_learner_setting_tenant_code ON learning.learner_setting (learner_setting_tenant_code);
CREATE INDEX idx_learner_setting_organization_id ON learning.learner_setting (learner_setting_organization_id);
CREATE TRIGGER trg_learner_setting_updated_at BEFORE UPDATE ON learning.learner_setting FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('learner_setting_updated_at');

-- -----------------------------------------------------
-- Table: learning.study_session
-- Purpose: Parent of every study activity
-- -----------------------------------------------------
CREATE TABLE learning.study_session (
    study_session_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    study_session_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    study_session_tenant_code BIGINT NOT NULL,
    study_session_organization_id BIGINT NOT NULL,
    study_session_user_account_id BIGINT NOT NULL,
    study_session_enrollment_id BIGINT,
    study_session_kind VARCHAR(100) NOT NULL,
    study_session_status VARCHAR(100) NOT NULL DEFAULT 'in_progress',
    study_session_mode VARCHAR(100),
    study_session_source_plan_task_id BIGINT,
    study_session_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    study_session_client_ref UUID,
    study_session_started_at TIMESTAMPTZ NOT NULL,
    study_session_ended_at TIMESTAMPTZ,
    study_session_last_activity_at TIMESTAMPTZ,
    study_session_active_seconds INTEGER NOT NULL DEFAULT 0,
    study_session_planned_item_count SMALLINT,
    study_session_answered_count SMALLINT NOT NULL DEFAULT 0,
    study_session_correct_count SMALLINT NOT NULL DEFAULT 0,
    study_session_wrong_count SMALLINT NOT NULL DEFAULT 0,
    study_session_blank_count SMALLINT NOT NULL DEFAULT 0,
    study_session_hints_used SMALLINT NOT NULL DEFAULT 0,
    study_session_score NUMERIC(6,2),
    study_session_metadata JSONB NOT NULL DEFAULT '{}',
    study_session_created_by BIGINT,
    study_session_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    study_session_updated_by BIGINT,
    study_session_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_study_session_user_account_id_client_ref UNIQUE (study_session_user_account_id, study_session_client_ref),
    CONSTRAINT chk_study_session_counters CHECK (study_session_active_seconds >= 0 AND study_session_planned_item_count >= 0 AND study_session_answered_count >= 0 AND study_session_correct_count >= 0 AND study_session_wrong_count >= 0 AND study_session_blank_count >= 0 AND study_session_hints_used >= 0),
    CONSTRAINT chk_study_session_answered CHECK (study_session_answered_count = study_session_correct_count + study_session_wrong_count),
    CONSTRAINT fk_study_session_tenant FOREIGN KEY (study_session_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_organization FOREIGN KEY (study_session_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_user_account FOREIGN KEY (study_session_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_enrollment FOREIGN KEY (study_session_enrollment_id) REFERENCES learning.enrollment(enrollment_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_kind FOREIGN KEY (study_session_kind) REFERENCES enums.study_session_kind(study_session_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_study_session_status FOREIGN KEY (study_session_status) REFERENCES enums.study_session_status(study_session_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_study_session_mode FOREIGN KEY (study_session_mode) REFERENCES enums.study_mode(study_mode_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_study_session_user_account_id_started_at ON learning.study_session (study_session_user_account_id, study_session_started_at DESC);
CREATE INDEX idx_study_session_enrollment_id ON learning.study_session (study_session_enrollment_id);
CREATE INDEX idx_study_session_kind_status ON learning.study_session (study_session_kind, study_session_status);
CREATE INDEX idx_study_session_status_last_activity_at ON learning.study_session (study_session_status, study_session_last_activity_at);
CREATE INDEX idx_study_session_mode ON learning.study_session (study_session_mode);
CREATE INDEX idx_study_session_source_plan_task_id ON learning.study_session (study_session_source_plan_task_id);
CREATE INDEX idx_study_session_tenant_code ON learning.study_session (study_session_tenant_code);
CREATE INDEX idx_study_session_organization_id ON learning.study_session (study_session_organization_id);
CREATE TRIGGER trg_study_session_updated_at BEFORE UPDATE ON learning.study_session FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('study_session_updated_at');

-- -----------------------------------------------------
-- Table: learning.study_session_item
-- Purpose: Answer sheet row of a study session
-- -----------------------------------------------------
CREATE TABLE learning.study_session_item (
    study_session_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    study_session_item_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    study_session_item_tenant_code BIGINT NOT NULL,
    study_session_item_organization_id BIGINT NOT NULL,
    study_session_item_study_session_id BIGINT NOT NULL,
    study_session_item_position SMALLINT NOT NULL,
    study_session_item_item_id BIGINT NOT NULL,
    study_session_item_question_id BIGINT NOT NULL,
    study_session_item_status VARCHAR(100) NOT NULL DEFAULT 'pending',
    study_session_item_option_order VARCHAR(2)[],
    study_session_item_selected_label VARCHAR(2),
    study_session_item_is_correct BOOLEAN,
    study_session_item_is_flagged BOOLEAN NOT NULL DEFAULT false,
    study_session_item_eliminated_labels VARCHAR(2)[] NOT NULL DEFAULT '{}',
    study_session_item_tries SMALLINT NOT NULL DEFAULT 0,
    study_session_item_hints_revealed SMALLINT NOT NULL DEFAULT 0,
    study_session_item_solution_viewed BOOLEAN NOT NULL DEFAULT false,
    study_session_item_time_spent_ms INTEGER NOT NULL DEFAULT 0,
    study_session_item_first_seen_at TIMESTAMPTZ,
    study_session_item_answered_at TIMESTAMPTZ,
    study_session_item_client_ref UUID,
    study_session_item_metadata JSONB NOT NULL DEFAULT '{}',
    study_session_item_created_by BIGINT,
    study_session_item_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    study_session_item_updated_by BIGINT,
    study_session_item_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_study_session_item_study_session_id_position UNIQUE (study_session_item_study_session_id, study_session_item_position),
    CONSTRAINT chk_study_session_item_position CHECK (study_session_item_position > 0),
    CONSTRAINT chk_study_session_item_tries CHECK (study_session_item_tries BETWEEN 0 AND 3),
    CONSTRAINT chk_study_session_item_hints CHECK (study_session_item_hints_revealed BETWEEN 0 AND 10),
    CONSTRAINT chk_study_session_item_time CHECK (study_session_item_time_spent_ms >= 0),
    CONSTRAINT fk_study_session_item_tenant FOREIGN KEY (study_session_item_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_item_organization FOREIGN KEY (study_session_item_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_item_study_session FOREIGN KEY (study_session_item_study_session_id) REFERENCES learning.study_session(study_session_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_item_item FOREIGN KEY (study_session_item_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_item_question FOREIGN KEY (study_session_item_question_id) REFERENCES content.question(question_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_study_session_item_status FOREIGN KEY (study_session_item_status) REFERENCES enums.session_item_status(session_item_status_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_study_session_item_item_id ON learning.study_session_item (study_session_item_item_id);
CREATE INDEX idx_study_session_item_question_id ON learning.study_session_item (study_session_item_question_id);
CREATE INDEX idx_study_session_item_status ON learning.study_session_item (study_session_item_status);
CREATE INDEX idx_study_session_item_tenant_code ON learning.study_session_item (study_session_item_tenant_code);
CREATE INDEX idx_study_session_item_organization_id ON learning.study_session_item (study_session_item_organization_id);
CREATE TRIGGER trg_study_session_item_updated_at BEFORE UPDATE ON learning.study_session_item FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('study_session_item_updated_at');

-- -----------------------------------------------------
-- Table: learning.exam_sitting
-- Purpose: Mock exam extension of a study session (1:1)
-- -----------------------------------------------------
CREATE TABLE learning.exam_sitting (
    exam_sitting_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_sitting_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    exam_sitting_tenant_code BIGINT NOT NULL,
    exam_sitting_organization_id BIGINT NOT NULL,
    exam_sitting_study_session_id BIGINT NOT NULL,
    exam_sitting_exam_form_item_id BIGINT NOT NULL,
    exam_sitting_exam_form_id BIGINT NOT NULL,
    exam_sitting_blueprint_id BIGINT NOT NULL,
    exam_sitting_time_limit_seconds INTEGER NOT NULL,
    exam_sitting_extra_time_percent SMALLINT NOT NULL DEFAULT 0,
    exam_sitting_deadline_at TIMESTAMPTZ,
    exam_sitting_paused_at TIMESTAMPTZ,
    exam_sitting_remaining_seconds_at_pause INTEGER,
    exam_sitting_paused_total_seconds INTEGER NOT NULL DEFAULT 0,
    exam_sitting_current_position SMALLINT NOT NULL DEFAULT 1,
    exam_sitting_submitted_at TIMESTAMPTZ,
    exam_sitting_submit_reason VARCHAR(100),
    exam_sitting_score NUMERIC(6,2),
    exam_sitting_correct_count SMALLINT,
    exam_sitting_wrong_count SMALLINT,
    exam_sitting_blank_count SMALLINT,
    exam_sitting_is_personal_best BOOLEAN NOT NULL DEFAULT false,
    exam_sitting_metadata JSONB NOT NULL DEFAULT '{}',
    exam_sitting_created_by BIGINT,
    exam_sitting_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    exam_sitting_updated_by BIGINT,
    exam_sitting_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_sitting_study_session_id UNIQUE (exam_sitting_study_session_id),
    CONSTRAINT chk_exam_sitting_time_limit CHECK (exam_sitting_time_limit_seconds > 0),
    CONSTRAINT chk_exam_sitting_pause CHECK (exam_sitting_paused_at IS NULL OR exam_sitting_remaining_seconds_at_pause IS NOT NULL),
    CONSTRAINT chk_exam_sitting_submit CHECK ((exam_sitting_submitted_at IS NULL) = (exam_sitting_submit_reason IS NULL)),
    CONSTRAINT fk_exam_sitting_tenant FOREIGN KEY (exam_sitting_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_sitting_organization FOREIGN KEY (exam_sitting_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_sitting_study_session FOREIGN KEY (exam_sitting_study_session_id) REFERENCES learning.study_session(study_session_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_sitting_exam_form_item FOREIGN KEY (exam_sitting_exam_form_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_sitting_exam_form FOREIGN KEY (exam_sitting_exam_form_id) REFERENCES content.exam_form(exam_form_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_sitting_blueprint FOREIGN KEY (exam_sitting_blueprint_id) REFERENCES content.blueprint(blueprint_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_exam_sitting_submit_reason FOREIGN KEY (exam_sitting_submit_reason) REFERENCES enums.sitting_submit_reason(sitting_submit_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_exam_sitting_exam_form_item_id ON learning.exam_sitting (exam_sitting_exam_form_item_id);
CREATE INDEX idx_exam_sitting_exam_form_id ON learning.exam_sitting (exam_sitting_exam_form_id);
CREATE INDEX idx_exam_sitting_blueprint_id ON learning.exam_sitting (exam_sitting_blueprint_id);
CREATE INDEX idx_exam_sitting_submit_reason ON learning.exam_sitting (exam_sitting_submit_reason);
CREATE INDEX idx_exam_sitting_deadline_open ON learning.exam_sitting (exam_sitting_deadline_at) WHERE exam_sitting_submitted_at IS NULL;
CREATE INDEX idx_exam_sitting_tenant_code ON learning.exam_sitting (exam_sitting_tenant_code);
CREATE INDEX idx_exam_sitting_organization_id ON learning.exam_sitting (exam_sitting_organization_id);
CREATE TRIGGER trg_exam_sitting_updated_at BEFORE UPDATE ON learning.exam_sitting FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('exam_sitting_updated_at');

-- -----------------------------------------------------
-- Table: learning.attempt
-- Purpose: Immutable evaluation event
-- -----------------------------------------------------
CREATE TABLE learning.attempt (
    attempt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    attempt_tenant_code BIGINT NOT NULL,
    attempt_organization_id BIGINT NOT NULL,
    attempt_user_account_id BIGINT NOT NULL,
    attempt_study_session_id BIGINT NOT NULL,
    attempt_study_session_item_id BIGINT NOT NULL,
    attempt_item_id BIGINT NOT NULL,
    attempt_question_id BIGINT NOT NULL,
    attempt_question_type_id BIGINT NOT NULL,
    attempt_try_no SMALLINT NOT NULL DEFAULT 1,
    attempt_selected_label VARCHAR(2),
    attempt_is_correct BOOLEAN NOT NULL,
    attempt_is_blank BOOLEAN NOT NULL DEFAULT false,
    attempt_hints_revealed SMALLINT NOT NULL DEFAULT 0,
    attempt_time_ms INTEGER NOT NULL,
    attempt_answered_at TIMESTAMPTZ NOT NULL,
    attempt_client_ref UUID,
    attempt_counts_for_mastery BOOLEAN NOT NULL DEFAULT true,
    attempt_metadata JSONB NOT NULL DEFAULT '{}',
    attempt_created_by BIGINT,
    attempt_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempt_updated_by BIGINT,
    attempt_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_attempt_user_account_id_client_ref UNIQUE (attempt_user_account_id, attempt_client_ref),
    CONSTRAINT chk_attempt_try_no CHECK (attempt_try_no BETWEEN 1 AND 3),
    CONSTRAINT chk_attempt_time CHECK (attempt_time_ms >= 0),
    CONSTRAINT chk_attempt_blank_correct CHECK (NOT (attempt_is_blank AND attempt_is_correct)),
    CONSTRAINT chk_attempt_blank_label CHECK (attempt_is_blank = (attempt_selected_label IS NULL)),
    CONSTRAINT fk_attempt_tenant FOREIGN KEY (attempt_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_attempt_organization FOREIGN KEY (attempt_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_attempt_user_account FOREIGN KEY (attempt_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_attempt_study_session FOREIGN KEY (attempt_study_session_id) REFERENCES learning.study_session(study_session_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_attempt_study_session_item FOREIGN KEY (attempt_study_session_item_id) REFERENCES learning.study_session_item(study_session_item_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_attempt_item FOREIGN KEY (attempt_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_attempt_question FOREIGN KEY (attempt_question_id) REFERENCES content.question(question_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_attempt_question_type FOREIGN KEY (attempt_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_attempt_user_account_id_answered_at ON learning.attempt (attempt_user_account_id, attempt_answered_at);
CREATE INDEX idx_attempt_study_session_id ON learning.attempt (attempt_study_session_id);
CREATE INDEX idx_attempt_study_session_item_id ON learning.attempt (attempt_study_session_item_id);
CREATE INDEX idx_attempt_item_id_answered_at ON learning.attempt (attempt_item_id, attempt_answered_at);
CREATE INDEX idx_attempt_question_id ON learning.attempt (attempt_question_id);
CREATE INDEX idx_attempt_question_type_id_user_account_id ON learning.attempt (attempt_question_type_id, attempt_user_account_id);
CREATE INDEX idx_attempt_tenant_code ON learning.attempt (attempt_tenant_code);
CREATE INDEX idx_attempt_organization_id ON learning.attempt (attempt_organization_id);
CREATE TRIGGER trg_attempt_updated_at BEFORE UPDATE ON learning.attempt FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('attempt_updated_at');

-- -----------------------------------------------------
-- Table: learning.diagnostic_result
-- Purpose: Placement test extension of a study session (1:1)
-- -----------------------------------------------------
CREATE TABLE learning.diagnostic_result (
    diagnostic_result_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    diagnostic_result_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    diagnostic_result_tenant_code BIGINT NOT NULL,
    diagnostic_result_organization_id BIGINT NOT NULL,
    diagnostic_result_user_account_id BIGINT NOT NULL,
    diagnostic_result_study_session_id BIGINT NOT NULL,
    diagnostic_result_enrollment_id BIGINT NOT NULL,
    diagnostic_result_algorithm_version VARCHAR(20) NOT NULL,
    diagnostic_result_score_low NUMERIC(6,2),
    diagnostic_result_score_high NUMERIC(6,2),
    diagnostic_result_score_point NUMERIC(6,2),
    diagnostic_result_confidence NUMERIC(4,3),
    diagnostic_result_basis_question_count SMALLINT,
    diagnostic_result_type_estimates JSONB NOT NULL,
    diagnostic_result_halfway_break_at TIMESTAMPTZ,
    diagnostic_result_metadata JSONB NOT NULL DEFAULT '{}',
    diagnostic_result_created_by BIGINT,
    diagnostic_result_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    diagnostic_result_updated_by BIGINT,
    diagnostic_result_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_diagnostic_result_study_session_id UNIQUE (diagnostic_result_study_session_id),
    CONSTRAINT chk_diagnostic_result_score_range CHECK (diagnostic_result_score_high >= diagnostic_result_score_low),
    CONSTRAINT chk_diagnostic_result_confidence CHECK (diagnostic_result_confidence BETWEEN 0 AND 1),
    CONSTRAINT fk_diagnostic_result_tenant FOREIGN KEY (diagnostic_result_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_diagnostic_result_organization FOREIGN KEY (diagnostic_result_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_diagnostic_result_user_account FOREIGN KEY (diagnostic_result_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_diagnostic_result_study_session FOREIGN KEY (diagnostic_result_study_session_id) REFERENCES learning.study_session(study_session_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_diagnostic_result_enrollment FOREIGN KEY (diagnostic_result_enrollment_id) REFERENCES learning.enrollment(enrollment_id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX idx_diagnostic_result_enrollment_id ON learning.diagnostic_result (diagnostic_result_enrollment_id);
CREATE INDEX idx_diagnostic_result_tenant_code ON learning.diagnostic_result (diagnostic_result_tenant_code);
CREATE INDEX idx_diagnostic_result_organization_id ON learning.diagnostic_result (diagnostic_result_organization_id);
CREATE INDEX idx_diagnostic_result_user_account_id ON learning.diagnostic_result (diagnostic_result_user_account_id);
CREATE TRIGGER trg_diagnostic_result_updated_at BEFORE UPDATE ON learning.diagnostic_result FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('diagnostic_result_updated_at');

-- -----------------------------------------------------
-- Table: learning.skill_mastery
-- Purpose: Mastery per skill
-- -----------------------------------------------------
CREATE TABLE learning.skill_mastery (
    skill_mastery_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    skill_mastery_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    skill_mastery_tenant_code BIGINT NOT NULL,
    skill_mastery_organization_id BIGINT NOT NULL,
    skill_mastery_user_account_id BIGINT NOT NULL,
    skill_mastery_skill_id BIGINT NOT NULL,
    skill_mastery_mastery NUMERIC(5,2) NOT NULL DEFAULT 0,
    skill_mastery_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
    skill_mastery_evidence_count INTEGER NOT NULL DEFAULT 0,
    skill_mastery_last_delta NUMERIC(5,2),
    skill_mastery_last_evidence_at TIMESTAMPTZ,
    skill_mastery_metadata JSONB NOT NULL DEFAULT '{}',
    skill_mastery_created_by BIGINT,
    skill_mastery_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    skill_mastery_updated_by BIGINT,
    skill_mastery_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_skill_mastery_user_account_id_skill_id UNIQUE (skill_mastery_user_account_id, skill_mastery_skill_id),
    CONSTRAINT chk_skill_mastery_mastery CHECK (skill_mastery_mastery BETWEEN 0 AND 100),
    CONSTRAINT fk_skill_mastery_tenant FOREIGN KEY (skill_mastery_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_mastery_organization FOREIGN KEY (skill_mastery_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_mastery_user_account FOREIGN KEY (skill_mastery_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_skill_mastery_skill FOREIGN KEY (skill_mastery_skill_id) REFERENCES content.skill(skill_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_skill_mastery_skill_id ON learning.skill_mastery (skill_mastery_skill_id);
CREATE INDEX idx_skill_mastery_tenant_code ON learning.skill_mastery (skill_mastery_tenant_code);
CREATE INDEX idx_skill_mastery_organization_id ON learning.skill_mastery (skill_mastery_organization_id);
CREATE TRIGGER trg_skill_mastery_updated_at BEFORE UPDATE ON learning.skill_mastery FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('skill_mastery_updated_at');

-- -----------------------------------------------------
-- Table: learning.question_type_mastery
-- Purpose: Mastery per question type
-- -----------------------------------------------------
CREATE TABLE learning.question_type_mastery (
    question_type_mastery_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_type_mastery_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    question_type_mastery_tenant_code BIGINT NOT NULL,
    question_type_mastery_organization_id BIGINT NOT NULL,
    question_type_mastery_user_account_id BIGINT NOT NULL,
    question_type_mastery_question_type_id BIGINT NOT NULL,
    question_type_mastery_mastery NUMERIC(5,2) NOT NULL DEFAULT 0,
    question_type_mastery_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
    question_type_mastery_evidence_count INTEGER NOT NULL DEFAULT 0,
    question_type_mastery_last_delta NUMERIC(5,2),
    question_type_mastery_last_evidence_at TIMESTAMPTZ,
    question_type_mastery_metadata JSONB NOT NULL DEFAULT '{}',
    question_type_mastery_created_by BIGINT,
    question_type_mastery_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    question_type_mastery_updated_by BIGINT,
    question_type_mastery_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_question_type_mastery_user_account_id_question_type_id UNIQUE (question_type_mastery_user_account_id, question_type_mastery_question_type_id),
    CONSTRAINT chk_question_type_mastery_mastery CHECK (question_type_mastery_mastery BETWEEN 0 AND 100),
    CONSTRAINT fk_question_type_mastery_tenant FOREIGN KEY (question_type_mastery_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_mastery_organization FOREIGN KEY (question_type_mastery_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_mastery_user_account FOREIGN KEY (question_type_mastery_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_question_type_mastery_question_type FOREIGN KEY (question_type_mastery_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_question_type_mastery_question_type_id ON learning.question_type_mastery (question_type_mastery_question_type_id);
CREATE INDEX idx_question_type_mastery_tenant_code ON learning.question_type_mastery (question_type_mastery_tenant_code);
CREATE INDEX idx_question_type_mastery_organization_id ON learning.question_type_mastery (question_type_mastery_organization_id);
CREATE TRIGGER trg_question_type_mastery_updated_at BEFORE UPDATE ON learning.question_type_mastery FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('question_type_mastery_updated_at');

-- -----------------------------------------------------
-- Table: learning.mastery_snapshot
-- Purpose: Daily mastery snapshot for 7-day change
-- -----------------------------------------------------
CREATE TABLE learning.mastery_snapshot (
    mastery_snapshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mastery_snapshot_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    mastery_snapshot_tenant_code BIGINT NOT NULL,
    mastery_snapshot_organization_id BIGINT NOT NULL,
    mastery_snapshot_user_account_id BIGINT NOT NULL,
    mastery_snapshot_snapshot_date DATE NOT NULL,
    mastery_snapshot_skill_id BIGINT,
    mastery_snapshot_question_type_id BIGINT,
    mastery_snapshot_mastery NUMERIC(5,2) NOT NULL,
    mastery_snapshot_metadata JSONB NOT NULL DEFAULT '{}',
    mastery_snapshot_created_by BIGINT,
    mastery_snapshot_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    mastery_snapshot_updated_by BIGINT,
    mastery_snapshot_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mastery_snapshot_user_account_id_snapshot_date_skillde034fb0 UNIQUE NULLS NOT DISTINCT (mastery_snapshot_user_account_id, mastery_snapshot_snapshot_date, mastery_snapshot_skill_id, mastery_snapshot_question_type_id),
    CONSTRAINT chk_mastery_snapshot_target CHECK (num_nonnulls(mastery_snapshot_skill_id, mastery_snapshot_question_type_id) = 1),
    CONSTRAINT fk_mastery_snapshot_tenant FOREIGN KEY (mastery_snapshot_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_mastery_snapshot_organization FOREIGN KEY (mastery_snapshot_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_mastery_snapshot_user_account FOREIGN KEY (mastery_snapshot_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_mastery_snapshot_skill FOREIGN KEY (mastery_snapshot_skill_id) REFERENCES content.skill(skill_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_mastery_snapshot_question_type FOREIGN KEY (mastery_snapshot_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_mastery_snapshot_skill_id ON learning.mastery_snapshot (mastery_snapshot_skill_id);
CREATE INDEX idx_mastery_snapshot_question_type_id ON learning.mastery_snapshot (mastery_snapshot_question_type_id);
CREATE INDEX idx_mastery_snapshot_tenant_code ON learning.mastery_snapshot (mastery_snapshot_tenant_code);
CREATE INDEX idx_mastery_snapshot_organization_id ON learning.mastery_snapshot (mastery_snapshot_organization_id);
CREATE TRIGGER trg_mastery_snapshot_updated_at BEFORE UPDATE ON learning.mastery_snapshot FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('mastery_snapshot_updated_at');

-- -----------------------------------------------------
-- Table: learning.score_estimate
-- Purpose: Score estimate history (always a range)
-- -----------------------------------------------------
CREATE TABLE learning.score_estimate (
    score_estimate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    score_estimate_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    score_estimate_tenant_code BIGINT NOT NULL,
    score_estimate_organization_id BIGINT NOT NULL,
    score_estimate_user_account_id BIGINT NOT NULL,
    score_estimate_enrollment_id BIGINT NOT NULL,
    score_estimate_source VARCHAR(100) NOT NULL,
    score_estimate_source_session_id BIGINT,
    score_estimate_score_low NUMERIC(6,2) NOT NULL,
    score_estimate_score_high NUMERIC(6,2) NOT NULL,
    score_estimate_score_point NUMERIC(6,2) NOT NULL,
    score_estimate_confidence NUMERIC(4,3),
    score_estimate_basis_question_count INTEGER,
    score_estimate_computed_at TIMESTAMPTZ NOT NULL,
    score_estimate_metadata JSONB NOT NULL DEFAULT '{}',
    score_estimate_created_by BIGINT,
    score_estimate_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    score_estimate_updated_by BIGINT,
    score_estimate_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_score_estimate_score_range CHECK (score_estimate_score_high >= score_estimate_score_low),
    CONSTRAINT fk_score_estimate_tenant FOREIGN KEY (score_estimate_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_score_estimate_organization FOREIGN KEY (score_estimate_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_score_estimate_user_account FOREIGN KEY (score_estimate_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_score_estimate_enrollment FOREIGN KEY (score_estimate_enrollment_id) REFERENCES learning.enrollment(enrollment_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_score_estimate_source FOREIGN KEY (score_estimate_source) REFERENCES enums.score_estimate_source(score_estimate_source_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_score_estimate_source_session FOREIGN KEY (score_estimate_source_session_id) REFERENCES learning.study_session(study_session_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_score_estimate_enrollment_id_computed_at ON learning.score_estimate (score_estimate_enrollment_id, score_estimate_computed_at DESC);
CREATE INDEX idx_score_estimate_user_account_id ON learning.score_estimate (score_estimate_user_account_id);
CREATE INDEX idx_score_estimate_source ON learning.score_estimate (score_estimate_source);
CREATE INDEX idx_score_estimate_source_session_id ON learning.score_estimate (score_estimate_source_session_id);
CREATE INDEX idx_score_estimate_tenant_code ON learning.score_estimate (score_estimate_tenant_code);
CREATE INDEX idx_score_estimate_organization_id ON learning.score_estimate (score_estimate_organization_id);
CREATE TRIGGER trg_score_estimate_updated_at BEFORE UPDATE ON learning.score_estimate FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('score_estimate_updated_at');

-- -----------------------------------------------------
-- Table: learning.study_plan
-- Purpose: Versioned study plan
-- -----------------------------------------------------
CREATE TABLE learning.study_plan (
    study_plan_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    study_plan_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    study_plan_tenant_code BIGINT NOT NULL,
    study_plan_organization_id BIGINT NOT NULL,
    study_plan_user_account_id BIGINT NOT NULL,
    study_plan_enrollment_id BIGINT NOT NULL,
    study_plan_version_no INTEGER NOT NULL,
    study_plan_status VARCHAR(100) NOT NULL,
    study_plan_regen_reason VARCHAR(100) NOT NULL,
    study_plan_generator_version VARCHAR(20) NOT NULL,
    study_plan_horizon_start DATE NOT NULL,
    study_plan_horizon_end DATE NOT NULL,
    study_plan_inputs JSONB NOT NULL,
    study_plan_generated_at TIMESTAMPTZ NOT NULL,
    study_plan_metadata JSONB NOT NULL DEFAULT '{}',
    study_plan_created_by BIGINT,
    study_plan_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    study_plan_updated_by BIGINT,
    study_plan_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_study_plan_enrollment_id_version_no UNIQUE (study_plan_enrollment_id, study_plan_version_no),
    CONSTRAINT chk_study_plan_horizon CHECK (study_plan_horizon_end >= study_plan_horizon_start),
    CONSTRAINT fk_study_plan_tenant FOREIGN KEY (study_plan_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_study_plan_organization FOREIGN KEY (study_plan_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_study_plan_user_account FOREIGN KEY (study_plan_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_study_plan_enrollment FOREIGN KEY (study_plan_enrollment_id) REFERENCES learning.enrollment(enrollment_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_study_plan_status FOREIGN KEY (study_plan_status) REFERENCES enums.plan_status(plan_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_study_plan_regen_reason FOREIGN KEY (study_plan_regen_reason) REFERENCES enums.plan_regen_reason(plan_regen_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX uq_study_plan_active ON learning.study_plan (study_plan_enrollment_id) WHERE study_plan_status='active';
CREATE INDEX idx_study_plan_user_account_id ON learning.study_plan (study_plan_user_account_id);
CREATE INDEX idx_study_plan_status ON learning.study_plan (study_plan_status);
CREATE INDEX idx_study_plan_regen_reason ON learning.study_plan (study_plan_regen_reason);
CREATE INDEX idx_study_plan_tenant_code ON learning.study_plan (study_plan_tenant_code);
CREATE INDEX idx_study_plan_organization_id ON learning.study_plan (study_plan_organization_id);
CREATE TRIGGER trg_study_plan_updated_at BEFORE UPDATE ON learning.study_plan FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('study_plan_updated_at');

-- -----------------------------------------------------
-- Table: learning.plan_day
-- Purpose: Day of a study plan
-- -----------------------------------------------------
CREATE TABLE learning.plan_day (
    plan_day_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_day_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    plan_day_tenant_code BIGINT NOT NULL,
    plan_day_organization_id BIGINT NOT NULL,
    plan_day_study_plan_id BIGINT NOT NULL,
    plan_day_user_account_id BIGINT NOT NULL,
    plan_day_plan_date DATE NOT NULL,
    plan_day_planned_minutes SMALLINT NOT NULL,
    plan_day_status VARCHAR(100) NOT NULL DEFAULT 'pending',
    plan_day_adjusted_reason VARCHAR(100),
    plan_day_completed_at TIMESTAMPTZ,
    plan_day_metadata JSONB NOT NULL DEFAULT '{}',
    plan_day_created_by BIGINT,
    plan_day_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    plan_day_updated_by BIGINT,
    plan_day_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_plan_day_study_plan_id_plan_date UNIQUE (plan_day_study_plan_id, plan_day_plan_date),
    CONSTRAINT chk_plan_day_minutes CHECK (plan_day_planned_minutes BETWEEN 0 AND 480),
    CONSTRAINT fk_plan_day_tenant FOREIGN KEY (plan_day_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_day_organization FOREIGN KEY (plan_day_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_day_study_plan FOREIGN KEY (plan_day_study_plan_id) REFERENCES learning.study_plan(study_plan_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_day_user_account FOREIGN KEY (plan_day_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_day_status FOREIGN KEY (plan_day_status) REFERENCES enums.plan_day_status(plan_day_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_plan_day_adjusted_reason FOREIGN KEY (plan_day_adjusted_reason) REFERENCES enums.plan_regen_reason(plan_regen_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_plan_day_user_account_id_plan_date ON learning.plan_day (plan_day_user_account_id, plan_day_plan_date);
CREATE INDEX idx_plan_day_status ON learning.plan_day (plan_day_status);
CREATE INDEX idx_plan_day_adjusted_reason ON learning.plan_day (plan_day_adjusted_reason);
CREATE INDEX idx_plan_day_tenant_code ON learning.plan_day (plan_day_tenant_code);
CREATE INDEX idx_plan_day_organization_id ON learning.plan_day (plan_day_organization_id);
CREATE TRIGGER trg_plan_day_updated_at BEFORE UPDATE ON learning.plan_day FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('plan_day_updated_at');

-- -----------------------------------------------------
-- Table: learning.plan_task
-- Purpose: Task within a plan day
-- -----------------------------------------------------
CREATE TABLE learning.plan_task (
    plan_task_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_task_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    plan_task_tenant_code BIGINT NOT NULL,
    plan_task_organization_id BIGINT NOT NULL,
    plan_task_plan_day_id BIGINT NOT NULL,
    plan_task_position SMALLINT NOT NULL,
    plan_task_kind VARCHAR(100) NOT NULL,
    plan_task_status VARCHAR(100) NOT NULL DEFAULT 'pending',
    plan_task_reason VARCHAR(100) NOT NULL,
    plan_task_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan_task_reason_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan_task_estimated_minutes SMALLINT NOT NULL,
    plan_task_progress_pct SMALLINT NOT NULL DEFAULT 0,
    plan_task_target_item_id BIGINT,
    plan_task_target_question_type_id BIGINT,
    plan_task_target_skill_id BIGINT,
    plan_task_postponed_to_task_id BIGINT,
    plan_task_started_at TIMESTAMPTZ,
    plan_task_completed_at TIMESTAMPTZ,
    plan_task_metadata JSONB NOT NULL DEFAULT '{}',
    plan_task_created_by BIGINT,
    plan_task_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    plan_task_updated_by BIGINT,
    plan_task_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_plan_task_plan_day_id_position UNIQUE (plan_task_plan_day_id, plan_task_position),
    CONSTRAINT chk_plan_task_minutes CHECK (plan_task_estimated_minutes > 0),
    CONSTRAINT chk_plan_task_progress CHECK (plan_task_progress_pct BETWEEN 0 AND 100),
    CONSTRAINT fk_plan_task_tenant FOREIGN KEY (plan_task_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_task_organization FOREIGN KEY (plan_task_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_task_plan_day FOREIGN KEY (plan_task_plan_day_id) REFERENCES learning.plan_day(plan_day_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_task_kind FOREIGN KEY (plan_task_kind) REFERENCES enums.plan_task_kind(plan_task_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_plan_task_status FOREIGN KEY (plan_task_status) REFERENCES enums.plan_task_status(plan_task_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_plan_task_reason FOREIGN KEY (plan_task_reason) REFERENCES enums.plan_task_reason(plan_task_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_plan_task_target_item FOREIGN KEY (plan_task_target_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_task_target_question_type FOREIGN KEY (plan_task_target_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_task_target_skill FOREIGN KEY (plan_task_target_skill_id) REFERENCES content.skill(skill_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_plan_task_postponed_to_task FOREIGN KEY (plan_task_postponed_to_task_id) REFERENCES learning.plan_task(plan_task_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_plan_task_kind ON learning.plan_task (plan_task_kind);
CREATE INDEX idx_plan_task_status ON learning.plan_task (plan_task_status);
CREATE INDEX idx_plan_task_reason ON learning.plan_task (plan_task_reason);
CREATE INDEX idx_plan_task_target_item_id ON learning.plan_task (plan_task_target_item_id);
CREATE INDEX idx_plan_task_target_question_type_id ON learning.plan_task (plan_task_target_question_type_id);
CREATE INDEX idx_plan_task_target_skill_id ON learning.plan_task (plan_task_target_skill_id);
CREATE INDEX idx_plan_task_postponed_to_task_id ON learning.plan_task (plan_task_postponed_to_task_id);
CREATE INDEX idx_plan_task_tenant_code ON learning.plan_task (plan_task_tenant_code);
CREATE INDEX idx_plan_task_organization_id ON learning.plan_task (plan_task_organization_id);
CREATE TRIGGER trg_plan_task_updated_at BEFORE UPDATE ON learning.plan_task FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('plan_task_updated_at');

-- -----------------------------------------------------
-- Table: learning.activity_day
-- Purpose: Per-day activity summary (streak source)
-- -----------------------------------------------------
CREATE TABLE learning.activity_day (
    activity_day_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    activity_day_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    activity_day_tenant_code BIGINT NOT NULL,
    activity_day_organization_id BIGINT NOT NULL,
    activity_day_user_account_id BIGINT NOT NULL,
    activity_day_activity_date DATE NOT NULL,
    activity_day_active_seconds INTEGER NOT NULL DEFAULT 0,
    activity_day_questions_answered INTEGER NOT NULL DEFAULT 0,
    activity_day_correct_answers INTEGER NOT NULL DEFAULT 0,
    activity_day_cards_reviewed INTEGER NOT NULL DEFAULT 0,
    activity_day_new_cards INTEGER NOT NULL DEFAULT 0,
    activity_day_notes_read SMALLINT NOT NULL DEFAULT 0,
    activity_day_goal_minutes SMALLINT,
    activity_day_goal_met BOOLEAN NOT NULL DEFAULT false,
    activity_day_freeze_used BOOLEAN NOT NULL DEFAULT false,
    activity_day_metadata JSONB NOT NULL DEFAULT '{}',
    activity_day_created_by BIGINT,
    activity_day_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activity_day_updated_by BIGINT,
    activity_day_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_activity_day_user_account_id_activity_date UNIQUE (activity_day_user_account_id, activity_day_activity_date),
    CONSTRAINT chk_activity_day_counters CHECK (activity_day_active_seconds >= 0 AND activity_day_questions_answered >= 0 AND activity_day_correct_answers >= 0 AND activity_day_cards_reviewed >= 0 AND activity_day_new_cards >= 0 AND activity_day_notes_read >= 0),
    CONSTRAINT fk_activity_day_tenant FOREIGN KEY (activity_day_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_activity_day_organization FOREIGN KEY (activity_day_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_activity_day_user_account FOREIGN KEY (activity_day_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX idx_activity_day_tenant_code ON learning.activity_day (activity_day_tenant_code);
CREATE INDEX idx_activity_day_organization_id ON learning.activity_day (activity_day_organization_id);
CREATE TRIGGER trg_activity_day_updated_at BEFORE UPDATE ON learning.activity_day FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('activity_day_updated_at');

-- -----------------------------------------------------
-- Table: learning.streak
-- Purpose: Streak state (1:1)
-- -----------------------------------------------------
CREATE TABLE learning.streak (
    streak_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    streak_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    streak_tenant_code BIGINT NOT NULL,
    streak_organization_id BIGINT NOT NULL,
    streak_user_account_id BIGINT NOT NULL,
    streak_current_length INTEGER NOT NULL DEFAULT 0,
    streak_longest_length INTEGER NOT NULL DEFAULT 0,
    streak_current_started_on DATE,
    streak_last_active_date DATE,
    streak_last_freeze_granted_on DATE,
    streak_freezes_available SMALLINT NOT NULL DEFAULT 0,
    streak_last_milestone_celebrated INTEGER NOT NULL DEFAULT 0,
    streak_metadata JSONB NOT NULL DEFAULT '{}',
    streak_created_by BIGINT,
    streak_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    streak_updated_by BIGINT,
    streak_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_streak_user_account_id UNIQUE (streak_user_account_id),
    CONSTRAINT chk_streak_freezes CHECK (streak_freezes_available BETWEEN 0 AND 5),
    CONSTRAINT chk_streak_longest CHECK (streak_longest_length >= streak_current_length),
    CONSTRAINT fk_streak_tenant FOREIGN KEY (streak_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_streak_organization FOREIGN KEY (streak_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_streak_user_account FOREIGN KEY (streak_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX idx_streak_tenant_code ON learning.streak (streak_tenant_code);
CREATE INDEX idx_streak_organization_id ON learning.streak (streak_organization_id);
CREATE TRIGGER trg_streak_updated_at BEFORE UPDATE ON learning.streak FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('streak_updated_at');

-- -----------------------------------------------------
-- Table: learning.mistake
-- Purpose: Mistake notebook entry
-- -----------------------------------------------------
CREATE TABLE learning.mistake (
    mistake_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mistake_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    mistake_tenant_code BIGINT NOT NULL,
    mistake_organization_id BIGINT NOT NULL,
    mistake_user_account_id BIGINT NOT NULL,
    mistake_item_id BIGINT NOT NULL,
    mistake_question_type_id BIGINT NOT NULL,
    mistake_first_attempt_id BIGINT,
    mistake_last_attempt_id BIGINT,
    mistake_status VARCHAR(100) NOT NULL DEFAULT 'open',
    mistake_mistake_type VARCHAR(100),
    mistake_suggested_mistake_type VARCHAR(100),
    mistake_wrong_count SMALLINT NOT NULL DEFAULT 1,
    mistake_review_count SMALLINT NOT NULL DEFAULT 0,
    mistake_correct_streak SMALLINT NOT NULL DEFAULT 0,
    mistake_interval_days NUMERIC(6,2),
    mistake_next_review_at TIMESTAMPTZ,
    mistake_last_reviewed_at TIMESTAMPTZ,
    mistake_resolved_at TIMESTAMPTZ,
    mistake_metadata JSONB NOT NULL DEFAULT '{}',
    mistake_created_by BIGINT,
    mistake_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    mistake_updated_by BIGINT,
    mistake_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mistake_user_account_id_item_id UNIQUE (mistake_user_account_id, mistake_item_id),
    CONSTRAINT fk_mistake_tenant FOREIGN KEY (mistake_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_mistake_organization FOREIGN KEY (mistake_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_mistake_user_account FOREIGN KEY (mistake_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_mistake_item FOREIGN KEY (mistake_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_mistake_question_type FOREIGN KEY (mistake_question_type_id) REFERENCES content.question_type(question_type_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_mistake_first_attempt FOREIGN KEY (mistake_first_attempt_id) REFERENCES learning.attempt(attempt_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_mistake_last_attempt FOREIGN KEY (mistake_last_attempt_id) REFERENCES learning.attempt(attempt_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_mistake_status FOREIGN KEY (mistake_status) REFERENCES enums.mistake_status(mistake_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_mistake_mistake_type FOREIGN KEY (mistake_mistake_type) REFERENCES enums.mistake_type(mistake_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_mistake_suggested_mistake_type FOREIGN KEY (mistake_suggested_mistake_type) REFERENCES enums.mistake_type(mistake_type_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_mistake_user_account_id_status_next_review_at ON learning.mistake (mistake_user_account_id, mistake_status, mistake_next_review_at);
CREATE INDEX idx_mistake_item_id ON learning.mistake (mistake_item_id);
CREATE INDEX idx_mistake_question_type_id ON learning.mistake (mistake_question_type_id);
CREATE INDEX idx_mistake_first_attempt_id ON learning.mistake (mistake_first_attempt_id);
CREATE INDEX idx_mistake_last_attempt_id ON learning.mistake (mistake_last_attempt_id);
CREATE INDEX idx_mistake_status ON learning.mistake (mistake_status);
CREATE INDEX idx_mistake_mistake_type ON learning.mistake (mistake_mistake_type);
CREATE INDEX idx_mistake_suggested_mistake_type ON learning.mistake (mistake_suggested_mistake_type);
CREATE INDEX idx_mistake_tenant_code ON learning.mistake (mistake_tenant_code);
CREATE INDEX idx_mistake_organization_id ON learning.mistake (mistake_organization_id);
CREATE TRIGGER trg_mistake_updated_at BEFORE UPDATE ON learning.mistake FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('mistake_updated_at');

-- -----------------------------------------------------
-- Table: learning.card
-- Purpose: FSRS flashcard
-- -----------------------------------------------------
CREATE TABLE learning.card (
    card_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    card_tenant_code BIGINT NOT NULL,
    card_organization_id BIGINT NOT NULL,
    card_user_account_id BIGINT NOT NULL,
    card_vocab_item_id BIGINT NOT NULL,
    card_source VARCHAR(100) NOT NULL,
    card_source_deck_id BIGINT,
    card_state VARCHAR(100) NOT NULL DEFAULT 'new',
    card_due_at TIMESTAMPTZ NOT NULL,
    card_stability NUMERIC(10,4),
    card_difficulty NUMERIC(6,4),
    card_elapsed_days INTEGER NOT NULL DEFAULT 0,
    card_scheduled_days INTEGER NOT NULL DEFAULT 0,
    card_reps INTEGER NOT NULL DEFAULT 0,
    card_lapses INTEGER NOT NULL DEFAULT 0,
    card_last_review_at TIMESTAMPTZ,
    card_suspended_at TIMESTAMPTZ,
    card_metadata JSONB NOT NULL DEFAULT '{}',
    card_created_by BIGINT,
    card_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    card_updated_by BIGINT,
    card_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_user_account_id_vocab_item_id UNIQUE (card_user_account_id, card_vocab_item_id),
    CONSTRAINT fk_card_tenant FOREIGN KEY (card_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_card_organization FOREIGN KEY (card_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_card_user_account FOREIGN KEY (card_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_card_vocab_item FOREIGN KEY (card_vocab_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_card_source FOREIGN KEY (card_source) REFERENCES enums.card_source(card_source_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_card_source_deck FOREIGN KEY (card_source_deck_id) REFERENCES content.deck(deck_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_card_state FOREIGN KEY (card_state) REFERENCES enums.card_state(card_state_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_card_user_account_id_due_at ON learning.card (card_user_account_id, card_due_at);
CREATE INDEX idx_card_vocab_item_id ON learning.card (card_vocab_item_id);
CREATE INDEX idx_card_source ON learning.card (card_source);
CREATE INDEX idx_card_source_deck_id ON learning.card (card_source_deck_id);
CREATE INDEX idx_card_state ON learning.card (card_state);
CREATE INDEX idx_card_tenant_code ON learning.card (card_tenant_code);
CREATE INDEX idx_card_organization_id ON learning.card (card_organization_id);
CREATE TRIGGER trg_card_updated_at BEFORE UPDATE ON learning.card FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('card_updated_at');

-- -----------------------------------------------------
-- Table: learning.card_review
-- Purpose: Append-only card review log
-- -----------------------------------------------------
CREATE TABLE learning.card_review (
    card_review_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_review_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    card_review_tenant_code BIGINT NOT NULL,
    card_review_organization_id BIGINT NOT NULL,
    card_review_card_id BIGINT NOT NULL,
    card_review_user_account_id BIGINT NOT NULL,
    card_review_study_session_id BIGINT,
    card_review_rating VARCHAR(100) NOT NULL,
    card_review_state_before VARCHAR(100) NOT NULL,
    card_review_reviewed_at TIMESTAMPTZ NOT NULL,
    card_review_duration_ms INTEGER,
    card_review_elapsed_days INTEGER,
    card_review_scheduled_days INTEGER,
    card_review_card_before JSONB NOT NULL,
    card_review_undone_at TIMESTAMPTZ,
    card_review_metadata JSONB NOT NULL DEFAULT '{}',
    card_review_created_by BIGINT,
    card_review_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    card_review_updated_by BIGINT,
    card_review_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_card_review_tenant FOREIGN KEY (card_review_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_card_review_organization FOREIGN KEY (card_review_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_card_review_card FOREIGN KEY (card_review_card_id) REFERENCES learning.card(card_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_card_review_user_account FOREIGN KEY (card_review_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_card_review_study_session FOREIGN KEY (card_review_study_session_id) REFERENCES learning.study_session(study_session_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_card_review_rating FOREIGN KEY (card_review_rating) REFERENCES enums.review_rating(review_rating_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_card_review_state_before FOREIGN KEY (card_review_state_before) REFERENCES enums.card_state(card_state_value) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX idx_card_review_card_id_reviewed_at ON learning.card_review (card_review_card_id, card_review_reviewed_at DESC);
CREATE INDEX idx_card_review_user_account_id_reviewed_at ON learning.card_review (card_review_user_account_id, card_review_reviewed_at);
CREATE INDEX idx_card_review_study_session_id ON learning.card_review (card_review_study_session_id);
CREATE INDEX idx_card_review_rating ON learning.card_review (card_review_rating);
CREATE INDEX idx_card_review_state_before ON learning.card_review (card_review_state_before);
CREATE INDEX idx_card_review_tenant_code ON learning.card_review (card_review_tenant_code);
CREATE INDEX idx_card_review_organization_id ON learning.card_review (card_review_organization_id);
CREATE TRIGGER trg_card_review_updated_at BEFORE UPDATE ON learning.card_review FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('card_review_updated_at');

-- -----------------------------------------------------
-- Table: learning.deck_subscription
-- Purpose: Deck subscription with daily new-card limit
-- -----------------------------------------------------
CREATE TABLE learning.deck_subscription (
    deck_subscription_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deck_subscription_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    deck_subscription_tenant_code BIGINT NOT NULL,
    deck_subscription_organization_id BIGINT NOT NULL,
    deck_subscription_user_account_id BIGINT NOT NULL,
    deck_subscription_deck_id BIGINT NOT NULL,
    deck_subscription_new_per_day SMALLINT NOT NULL,
    deck_subscription_is_active BOOLEAN NOT NULL DEFAULT true,
    deck_subscription_metadata JSONB NOT NULL DEFAULT '{}',
    deck_subscription_created_by BIGINT,
    deck_subscription_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deck_subscription_updated_by BIGINT,
    deck_subscription_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_deck_subscription_user_account_id_deck_id UNIQUE (deck_subscription_user_account_id, deck_subscription_deck_id),
    CONSTRAINT chk_deck_subscription_new_per_day CHECK (deck_subscription_new_per_day BETWEEN 0 AND 100),
    CONSTRAINT fk_deck_subscription_tenant FOREIGN KEY (deck_subscription_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_subscription_organization FOREIGN KEY (deck_subscription_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_subscription_user_account FOREIGN KEY (deck_subscription_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_deck_subscription_deck FOREIGN KEY (deck_subscription_deck_id) REFERENCES content.deck(deck_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_deck_subscription_deck_id ON learning.deck_subscription (deck_subscription_deck_id);
CREATE INDEX idx_deck_subscription_tenant_code ON learning.deck_subscription (deck_subscription_tenant_code);
CREATE INDEX idx_deck_subscription_organization_id ON learning.deck_subscription (deck_subscription_organization_id);
CREATE TRIGGER trg_deck_subscription_updated_at BEFORE UPDATE ON learning.deck_subscription FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('deck_subscription_updated_at');

-- -----------------------------------------------------
-- Table: learning.note_progress
-- Purpose: Study-note reading progress
-- -----------------------------------------------------
CREATE TABLE learning.note_progress (
    note_progress_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    note_progress_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    note_progress_tenant_code BIGINT NOT NULL,
    note_progress_organization_id BIGINT NOT NULL,
    note_progress_user_account_id BIGINT NOT NULL,
    note_progress_note_item_id BIGINT NOT NULL,
    note_progress_status VARCHAR(100) NOT NULL,
    note_progress_first_read_at TIMESTAMPTZ,
    note_progress_last_read_at TIMESTAMPTZ,
    note_progress_understood_at TIMESTAMPTZ,
    note_progress_read_count SMALLINT NOT NULL DEFAULT 1,
    note_progress_best_check_score SMALLINT,
    note_progress_last_check_session_id BIGINT,
    note_progress_metadata JSONB NOT NULL DEFAULT '{}',
    note_progress_created_by BIGINT,
    note_progress_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    note_progress_updated_by BIGINT,
    note_progress_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_note_progress_user_account_id_note_item_id UNIQUE (note_progress_user_account_id, note_progress_note_item_id),
    CONSTRAINT chk_note_progress_best_check CHECK (note_progress_best_check_score >= 0),
    CONSTRAINT fk_note_progress_tenant FOREIGN KEY (note_progress_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_note_progress_organization FOREIGN KEY (note_progress_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_note_progress_user_account FOREIGN KEY (note_progress_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_note_progress_note_item FOREIGN KEY (note_progress_note_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_note_progress_status FOREIGN KEY (note_progress_status) REFERENCES enums.note_progress_status(note_progress_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_note_progress_last_check_session FOREIGN KEY (note_progress_last_check_session_id) REFERENCES learning.study_session(study_session_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_note_progress_note_item_id ON learning.note_progress (note_progress_note_item_id);
CREATE INDEX idx_note_progress_status ON learning.note_progress (note_progress_status);
CREATE INDEX idx_note_progress_last_check_session_id ON learning.note_progress (note_progress_last_check_session_id);
CREATE INDEX idx_note_progress_tenant_code ON learning.note_progress (note_progress_tenant_code);
CREATE INDEX idx_note_progress_organization_id ON learning.note_progress (note_progress_organization_id);
CREATE TRIGGER trg_note_progress_updated_at BEFORE UPDATE ON learning.note_progress FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('note_progress_updated_at');

-- -----------------------------------------------------
-- Table: learning.bookmark
-- Purpose: Saved items
-- -----------------------------------------------------
CREATE TABLE learning.bookmark (
    bookmark_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bookmark_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    bookmark_tenant_code BIGINT NOT NULL,
    bookmark_organization_id BIGINT NOT NULL,
    bookmark_user_account_id BIGINT NOT NULL,
    bookmark_kind VARCHAR(100) NOT NULL,
    bookmark_item_id BIGINT,
    bookmark_tutor_message_code BIGINT,
    bookmark_note VARCHAR(300),
    bookmark_metadata JSONB NOT NULL DEFAULT '{}',
    bookmark_created_by BIGINT,
    bookmark_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    bookmark_updated_by BIGINT,
    bookmark_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bookmark_user_account_id_item_id_tutor_message_code UNIQUE NULLS NOT DISTINCT (bookmark_user_account_id, bookmark_item_id, bookmark_tutor_message_code),
    CONSTRAINT chk_bookmark_target CHECK (num_nonnulls(bookmark_item_id, bookmark_tutor_message_code) = 1),
    CONSTRAINT fk_bookmark_tenant FOREIGN KEY (bookmark_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_bookmark_organization FOREIGN KEY (bookmark_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_bookmark_user_account FOREIGN KEY (bookmark_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_bookmark_kind FOREIGN KEY (bookmark_kind) REFERENCES enums.bookmark_kind(bookmark_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_bookmark_item FOREIGN KEY (bookmark_item_id) REFERENCES content.item(item_id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX idx_bookmark_item_id ON learning.bookmark (bookmark_item_id);
CREATE INDEX idx_bookmark_kind ON learning.bookmark (bookmark_kind);
CREATE INDEX idx_bookmark_tenant_code ON learning.bookmark (bookmark_tenant_code);
CREATE INDEX idx_bookmark_organization_id ON learning.bookmark (bookmark_organization_id);
CREATE TRIGGER trg_bookmark_updated_at BEFORE UPDATE ON learning.bookmark FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('bookmark_updated_at');

-- Forward references (target table defined later in this file)
ALTER TABLE learning.study_session ADD CONSTRAINT fk_study_session_source_plan_task FOREIGN KEY (study_session_source_plan_task_id) REFERENCES learning.plan_task(plan_task_id) ON DELETE SET NULL ON UPDATE NO ACTION;


COMMIT;
