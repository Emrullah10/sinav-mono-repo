-- Geri bildirim: kullanıcılar uygulamayı kullanırken hata, öneri ya da kullanım senaryosu bildirir.
--
-- NEDEN: İletişim formu (identity.contact_message) e-posta zorunlu, metin odaklı bir destek kanalı; ek almaz ve
-- hangi ekranda olunduğunu bilmez. Geri bildirim oturum açmış herkesten (misafir dahil) gelir, bağlamı
-- (ekran, sürüm, cihaz) otomatik taşır ve fotoğraf/ekran görüntüsü (en çok 3) ile sesli kayıt (en çok 1) ekleyebilir.
-- Ekler storage.blob'da durur (anahtar feedback/{kod}/{sıra}, sahip identity + geri bildirim kodu, organizasyon =
-- gönderenin kişisel organizasyonu); hesap silinince ekler de silinir, metin anonim kalır.
-- Önce salt okunur kontrol (boş dönmeli): SELECT to_regclass('identity.feedback'), to_regclass('enums.feedback_kind');
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-31-1-feedback.sql
BEGIN;

-- -----------------------------------------------------
-- Table: enums.feedback_kind
-- Purpose: Allowed values of feedback_kind
-- -----------------------------------------------------
CREATE TABLE enums.feedback_kind (
    feedback_kind_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    feedback_kind_value VARCHAR(100) PRIMARY KEY,
    feedback_kind_label VARCHAR(255) NOT NULL,
    feedback_kind_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.feedback_kind (feedback_kind_value, feedback_kind_label, feedback_kind_sort_order) VALUES
    ('bug', 'Bug', 1),
    ('suggestion', 'Suggestion', 2),
    ('other', 'Other', 3);

-- -----------------------------------------------------
-- Table: identity.feedback
-- Purpose: In-app feedback (bug / suggestion / usage scenario) with optional photo and voice attachments in storage.blob
-- -----------------------------------------------------
CREATE TABLE identity.feedback (
    feedback_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    feedback_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    feedback_tenant_code BIGINT NOT NULL,
    feedback_organization_id BIGINT NOT NULL,
    feedback_sender_organization_id BIGINT,
    feedback_user_account_id BIGINT,
    feedback_kind VARCHAR(100) NOT NULL DEFAULT 'bug',
    feedback_message TEXT NOT NULL DEFAULT '',
    feedback_screen VARCHAR(200),
    feedback_client_platform VARCHAR(100),
    feedback_app_version VARCHAR(20),
    feedback_locale VARCHAR(10),
    feedback_context JSONB NOT NULL DEFAULT '{}',
    feedback_attachment_count INT NOT NULL DEFAULT 0,
    feedback_status VARCHAR(100) NOT NULL DEFAULT 'open',
    feedback_resolution_note TEXT,
    feedback_handled_by BIGINT,
    feedback_handled_at TIMESTAMP WITH TIME ZONE,
    feedback_metadata JSONB NOT NULL DEFAULT '{}',
    feedback_created_by BIGINT,
    feedback_updated_by BIGINT,
    feedback_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    feedback_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_feedback_tenant FOREIGN KEY (feedback_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_feedback_organization FOREIGN KEY (feedback_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_feedback_sender_organization FOREIGN KEY (feedback_sender_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL,
    CONSTRAINT fk_feedback_user_account FOREIGN KEY (feedback_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_feedback_kind FOREIGN KEY (feedback_kind) REFERENCES enums.feedback_kind(feedback_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_feedback_client_platform FOREIGN KEY (feedback_client_platform) REFERENCES enums.client_platform(client_platform_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_feedback_status FOREIGN KEY (feedback_status) REFERENCES enums.report_status(report_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_feedback_handled_by FOREIGN KEY (feedback_handled_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_feedback_created_by FOREIGN KEY (feedback_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_feedback_updated_by FOREIGN KEY (feedback_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT chk_feedback_message_length CHECK (char_length(feedback_message) <= 5000),
    CONSTRAINT chk_feedback_attachment_count CHECK (feedback_attachment_count BETWEEN 0 AND 4)
);

CREATE INDEX idx_feedback_status_created_at ON identity.feedback(feedback_status, feedback_created_at);
CREATE INDEX idx_feedback_tenant_code ON identity.feedback(feedback_tenant_code);
CREATE INDEX idx_feedback_organization_id ON identity.feedback(feedback_organization_id);
CREATE INDEX idx_feedback_sender_organization_id ON identity.feedback(feedback_sender_organization_id);
CREATE INDEX idx_feedback_user_account_id ON identity.feedback(feedback_user_account_id);
CREATE INDEX idx_feedback_kind ON identity.feedback(feedback_kind);
CREATE INDEX idx_feedback_client_platform ON identity.feedback(feedback_client_platform);
CREATE INDEX idx_feedback_handled_by ON identity.feedback(feedback_handled_by);
CREATE INDEX idx_feedback_created_by ON identity.feedback(feedback_created_by);
CREATE INDEX idx_feedback_updated_by ON identity.feedback(feedback_updated_by);

CREATE TRIGGER trg_feedback_updated_at BEFORE UPDATE ON identity.feedback
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('feedback_updated_at');

COMMIT;
