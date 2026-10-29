-- ÖSYM sınav takvimi içe aktarma: enums.calendar_import_status + content.exam_calendar_import.
--
-- NEDEN: Yıllık sınav tarihleri elle girilmesin; aylık tarama önerileri bu tabloya yazar,
-- gözden geçiren onaylayınca content.exam_session güncellenir.
-- Önce salt okunur kontrol (boş dönmeli): SELECT to_regclass('content.exam_calendar_import');
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-29-1-exam-calendar-import.sql
BEGIN;

-- -----------------------------------------------------
-- Table: enums.calendar_import_status
-- Purpose: Allowed values of calendar_import_status
-- -----------------------------------------------------
CREATE TABLE enums.calendar_import_status (
    calendar_import_status_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    calendar_import_status_value VARCHAR(100) PRIMARY KEY,
    calendar_import_status_label VARCHAR(255) NOT NULL,
    calendar_import_status_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.calendar_import_status (calendar_import_status_value, calendar_import_status_label, calendar_import_status_sort_order) VALUES
    ('pending', 'Pending review', 1),
    ('applied', 'Applied', 2),
    ('rejected', 'Rejected', 3),
    ('no_change', 'No change', 4),
    ('failed', 'Failed', 5);

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

GRANT SELECT, INSERT, UPDATE, DELETE ON content.exam_calendar_import TO sinav_svc;
GRANT SELECT ON enums.calendar_import_status TO sinav_svc;

COMMIT;
