-- Kitap okuma: hazır kitaplar + kullanıcının yüklediği PDF'ler, kaldığı yer, taranmış PDF için OCR kuyruğu.
--
-- NEDEN: Öğrenci sınav metinleri dışında da İngilizce okuyacak; kelimeye dokununca sözlük, cümleye basılı tutunca çeviri burada da çalışır.
-- Kitap ve ilerleme tek sorguda gerektiği için ikisi de content şemasında (P2 taslağındaki learning.reading_position yerine; docs/DECISIONS.md).
-- PDF dosyası diskte (BOOK_FILES_DIR/<kod>.pdf), burada yalnız metni ve bilgisi durur. Kişisel kitap kişisel organizasyona bağlıdır: hesap silinince
-- CASCADE ile gider, diskte kalan dosyayı content servisinin gece işi siler. Kişisel kitap cümleleri paylaşılan önbelleğe yazılmaz (belge özel olabilir).
-- Önce salt okunur kontrol (boş dönmeli): SELECT to_regclass('content.book'), to_regclass('enums.book_kind');
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-11-04-1-reading.sql
BEGIN;

-- -----------------------------------------------------
-- Table: enums.book_kind
-- Purpose: Allowed values of book_kind
-- -----------------------------------------------------
CREATE TABLE enums.book_kind (
    book_kind_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    book_kind_value VARCHAR(100) PRIMARY KEY,
    book_kind_label VARCHAR(255) NOT NULL,
    book_kind_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.book_kind (book_kind_value, book_kind_label, book_kind_sort_order) VALUES
    ('catalog', 'Catalog book', 1),
    ('personal', 'Personal upload', 2);

-- -----------------------------------------------------
-- Table: enums.book_status
-- Purpose: Allowed values of book_status
-- -----------------------------------------------------
CREATE TABLE enums.book_status (
    book_status_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    book_status_value VARCHAR(100) PRIMARY KEY,
    book_status_label VARCHAR(255) NOT NULL,
    book_status_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.book_status (book_status_value, book_status_label, book_status_sort_order) VALUES
    ('processing', 'Processing', 1),
    ('scanned', 'Scanned, no text', 2),
    ('ocr_queued', 'OCR queued', 3),
    ('ocr_running', 'OCR running', 4),
    ('ready', 'Ready', 5),
    ('failed', 'Failed', 6),
    ('retired', 'Retired', 7);

-- -----------------------------------------------------
-- Table: enums.book_level
-- Purpose: Allowed values of book_level (CEFR)
-- -----------------------------------------------------
CREATE TABLE enums.book_level (
    book_level_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    book_level_value VARCHAR(100) PRIMARY KEY,
    book_level_label VARCHAR(255) NOT NULL,
    book_level_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.book_level (book_level_value, book_level_label, book_level_sort_order) VALUES
    ('A2', 'A2', 1),
    ('B1', 'B1', 2),
    ('B2', 'B2', 3),
    ('C1', 'C1', 4);

-- -----------------------------------------------------
-- Table: enums.book_topic
-- Purpose: Allowed values of book_topic
-- -----------------------------------------------------
CREATE TABLE enums.book_topic (
    book_topic_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    book_topic_value VARCHAR(100) PRIMARY KEY,
    book_topic_label VARCHAR(255) NOT NULL,
    book_topic_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.book_topic (book_topic_value, book_topic_label, book_topic_sort_order) VALUES
    ('story', 'Story', 1),
    ('classic', 'Classic', 2),
    ('academic', 'Academic', 3),
    ('health', 'Health', 4),
    ('science', 'Science', 5),
    ('social', 'Social', 6);

-- -----------------------------------------------------
-- Table: enums.book_ocr_page_status
-- Purpose: Allowed values of book_ocr_page_status
-- -----------------------------------------------------
CREATE TABLE enums.book_ocr_page_status (
    book_ocr_page_status_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    book_ocr_page_status_value VARCHAR(100) PRIMARY KEY,
    book_ocr_page_status_label VARCHAR(255) NOT NULL,
    book_ocr_page_status_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.book_ocr_page_status (book_ocr_page_status_value, book_ocr_page_status_label, book_ocr_page_status_sort_order) VALUES
    ('pending', 'Pending', 1),
    ('done', 'Done', 2),
    ('failed', 'Failed', 3);

INSERT INTO enums.ai_feature (ai_feature_value, ai_feature_label, ai_feature_sort_order) VALUES
    ('book_ocr', 'Book OCR', 8);

-- -----------------------------------------------------
-- Table: content.book
-- Purpose: Kitap okuma — hazır kitap (catalog) ya da kullanıcının yüklediği PDF (personal). Kişisel kitap kişisel organizasyona bağlıdır, hesapla silinir.
-- -----------------------------------------------------
CREATE TABLE content.book (
    book_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    book_tenant_code BIGINT NOT NULL,
    book_organization_id BIGINT NOT NULL,
    book_kind VARCHAR(100) NOT NULL,
    book_user_account_id BIGINT,
    book_key VARCHAR(120),
    book_title VARCHAR(300) NOT NULL,
    book_author VARCHAR(200),
    book_description TEXT,
    book_language VARCHAR(10) NOT NULL DEFAULT 'en',
    book_level VARCHAR(100),
    book_topic VARCHAR(100),
    book_access_tier VARCHAR(100) NOT NULL DEFAULT 'free',
    book_license VARCHAR(120),
    book_attribution VARCHAR(300),
    book_source_url VARCHAR(500),
    book_status VARCHAR(100) NOT NULL DEFAULT 'processing',
    book_error_code VARCHAR(80),
    book_file_name VARCHAR(255),
    book_file_sha256 CHAR(64),
    book_file_byte_size BIGINT NOT NULL DEFAULT 0,
    book_has_file BOOLEAN NOT NULL DEFAULT false,
    book_page_count INT NOT NULL DEFAULT 0,
    book_textless_page_count INT NOT NULL DEFAULT 0,
    book_ocr_page_total INT NOT NULL DEFAULT 0,
    book_ocr_page_done INT NOT NULL DEFAULT 0,
    book_section_count INT NOT NULL DEFAULT 0,
    book_word_count INT NOT NULL DEFAULT 0,
    book_processing_started_at TIMESTAMPTZ,
    book_processing_attempts SMALLINT NOT NULL DEFAULT 0,
    book_processed_at TIMESTAMPTZ,
    book_published_at TIMESTAMPTZ,
    book_metadata JSONB NOT NULL DEFAULT '{}',
    book_created_by BIGINT,
    book_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_updated_by BIGINT,
    book_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_tenant_key UNIQUE (book_tenant_code, book_key),
    CONSTRAINT chk_book_owner CHECK ((book_kind = 'personal') = (book_user_account_id IS NOT NULL)),
    CONSTRAINT fk_book_kind FOREIGN KEY (book_kind) REFERENCES enums.book_kind(book_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_book_user_account FOREIGN KEY (book_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_level FOREIGN KEY (book_level) REFERENCES enums.book_level(book_level_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_book_topic FOREIGN KEY (book_topic) REFERENCES enums.book_topic(book_topic_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_book_access_tier FOREIGN KEY (book_access_tier) REFERENCES enums.access_tier(access_tier_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_book_status FOREIGN KEY (book_status) REFERENCES enums.book_status(book_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_book_tenant FOREIGN KEY (book_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_book_organization FOREIGN KEY (book_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_created_by FOREIGN KEY (book_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_book_updated_by FOREIGN KEY (book_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_book_tenant_code ON content.book (book_tenant_code);
CREATE INDEX idx_book_organization_id ON content.book (book_organization_id);
CREATE INDEX idx_book_kind ON content.book (book_kind);
CREATE INDEX idx_book_user_account_id ON content.book (book_user_account_id);
CREATE INDEX idx_book_level ON content.book (book_level);
CREATE INDEX idx_book_topic ON content.book (book_topic);
CREATE INDEX idx_book_access_tier ON content.book (book_access_tier);
CREATE INDEX idx_book_status ON content.book (book_status);
CREATE INDEX idx_book_created_by ON content.book (book_created_by);
CREATE INDEX idx_book_updated_by ON content.book (book_updated_by);
CREATE UNIQUE INDEX uq_book_personal_file ON content.book (book_user_account_id, book_file_sha256) WHERE book_kind = 'personal';
CREATE TRIGGER trg_book_updated_at BEFORE UPDATE ON content.book FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('book_updated_at');

-- -----------------------------------------------------
-- Table: content.book_section
-- Purpose: Kitabın okunan birimi (bölüm ya da uzun bölümün parçası). blocks: [{ t:'h'|'p', x:metin, pg:sayfa }]
-- -----------------------------------------------------
CREATE TABLE content.book_section (
    book_section_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_section_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    book_section_tenant_code BIGINT NOT NULL,
    book_section_organization_id BIGINT NOT NULL,
    book_section_book_id BIGINT NOT NULL,
    book_section_position INT NOT NULL,
    book_section_title VARCHAR(300),
    book_section_page_start INT,
    book_section_page_end INT,
    book_section_word_count INT NOT NULL DEFAULT 0,
    book_section_blocks JSONB NOT NULL DEFAULT '[]',
    book_section_metadata JSONB NOT NULL DEFAULT '{}',
    book_section_created_by BIGINT,
    book_section_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_section_updated_by BIGINT,
    book_section_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_section_position UNIQUE (book_section_book_id, book_section_position),
    CONSTRAINT fk_book_section_book FOREIGN KEY (book_section_book_id) REFERENCES content.book(book_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_section_tenant FOREIGN KEY (book_section_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_book_section_organization FOREIGN KEY (book_section_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_section_created_by FOREIGN KEY (book_section_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_book_section_updated_by FOREIGN KEY (book_section_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_book_section_tenant_code ON content.book_section (book_section_tenant_code);
CREATE INDEX idx_book_section_organization_id ON content.book_section (book_section_organization_id);
CREATE INDEX idx_book_section_created_by ON content.book_section (book_section_created_by);
CREATE INDEX idx_book_section_updated_by ON content.book_section (book_section_updated_by);
CREATE TRIGGER trg_book_section_updated_at BEFORE UPDATE ON content.book_section FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('book_section_updated_at');

-- -----------------------------------------------------
-- Table: content.book_progress
-- Purpose: Kullanıcının kitapta kaldığı yer (cihazlar arası); hesapla ve kitapla silinir.
-- -----------------------------------------------------
CREATE TABLE content.book_progress (
    book_progress_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_progress_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    book_progress_tenant_code BIGINT NOT NULL,
    book_progress_organization_id BIGINT NOT NULL,
    book_progress_user_account_id BIGINT NOT NULL,
    book_progress_book_id BIGINT NOT NULL,
    book_progress_section_position INT NOT NULL DEFAULT 0,
    book_progress_block_index INT NOT NULL DEFAULT 0,
    book_progress_page_no INT,
    book_progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    book_progress_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_progress_last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_progress_finished_at TIMESTAMPTZ,
    book_progress_metadata JSONB NOT NULL DEFAULT '{}',
    book_progress_created_by BIGINT,
    book_progress_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_progress_updated_by BIGINT,
    book_progress_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_progress_user_book UNIQUE (book_progress_user_account_id, book_progress_book_id),
    CONSTRAINT chk_book_progress_percent CHECK (book_progress_percent BETWEEN 0 AND 100),
    CONSTRAINT fk_book_progress_user_account FOREIGN KEY (book_progress_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_progress_book FOREIGN KEY (book_progress_book_id) REFERENCES content.book(book_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_progress_tenant FOREIGN KEY (book_progress_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_book_progress_organization FOREIGN KEY (book_progress_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_progress_created_by FOREIGN KEY (book_progress_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_book_progress_updated_by FOREIGN KEY (book_progress_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_book_progress_tenant_code ON content.book_progress (book_progress_tenant_code);
CREATE INDEX idx_book_progress_organization_id ON content.book_progress (book_progress_organization_id);
CREATE INDEX idx_book_progress_book_id ON content.book_progress (book_progress_book_id);
CREATE INDEX idx_book_progress_created_by ON content.book_progress (book_progress_created_by);
CREATE INDEX idx_book_progress_updated_by ON content.book_progress (book_progress_updated_by);
CREATE TRIGGER trg_book_progress_updated_at BEFORE UPDATE ON content.book_progress FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('book_progress_updated_at');

-- -----------------------------------------------------
-- Table: content.book_ocr_page
-- Purpose: Taranmış PDF: OCR sürerken sayfa başına sonuç; kitap oluşunca silinir.
-- -----------------------------------------------------
CREATE TABLE content.book_ocr_page (
    book_ocr_page_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_ocr_page_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    book_ocr_page_tenant_code BIGINT NOT NULL,
    book_ocr_page_organization_id BIGINT NOT NULL,
    book_ocr_page_book_id BIGINT NOT NULL,
    book_ocr_page_page_no INT NOT NULL,
    book_ocr_page_status VARCHAR(100) NOT NULL DEFAULT 'pending',
    book_ocr_page_text TEXT,
    book_ocr_page_attempts SMALLINT NOT NULL DEFAULT 0,
    book_ocr_page_cost_micros BIGINT NOT NULL DEFAULT 0,
    book_ocr_page_metadata JSONB NOT NULL DEFAULT '{}',
    book_ocr_page_created_by BIGINT,
    book_ocr_page_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_ocr_page_updated_by BIGINT,
    book_ocr_page_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_ocr_page UNIQUE (book_ocr_page_book_id, book_ocr_page_page_no),
    CONSTRAINT fk_book_ocr_page_book FOREIGN KEY (book_ocr_page_book_id) REFERENCES content.book(book_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_page_status FOREIGN KEY (book_ocr_page_status) REFERENCES enums.book_ocr_page_status(book_ocr_page_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_book_ocr_page_tenant FOREIGN KEY (book_ocr_page_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_page_organization FOREIGN KEY (book_ocr_page_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_page_created_by FOREIGN KEY (book_ocr_page_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_page_updated_by FOREIGN KEY (book_ocr_page_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_book_ocr_page_tenant_code ON content.book_ocr_page (book_ocr_page_tenant_code);
CREATE INDEX idx_book_ocr_page_organization_id ON content.book_ocr_page (book_ocr_page_organization_id);
CREATE INDEX idx_book_ocr_page_status ON content.book_ocr_page (book_ocr_page_status);
CREATE INDEX idx_book_ocr_page_created_by ON content.book_ocr_page (book_ocr_page_created_by);
CREATE INDEX idx_book_ocr_page_updated_by ON content.book_ocr_page (book_ocr_page_updated_by);
CREATE TRIGGER trg_book_ocr_page_updated_at BEFORE UPDATE ON content.book_ocr_page FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('book_ocr_page_updated_at');

-- -----------------------------------------------------
-- Table: content.book_ocr_usage
-- Purpose: Kullanıcının aylık OCR sayfa kullanımı. Ücretli iş olduğu için satır kilidiyle ayrılır (Redis değil).
-- -----------------------------------------------------
CREATE TABLE content.book_ocr_usage (
    book_ocr_usage_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_ocr_usage_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    book_ocr_usage_tenant_code BIGINT NOT NULL,
    book_ocr_usage_organization_id BIGINT NOT NULL,
    book_ocr_usage_user_account_id BIGINT NOT NULL,
    book_ocr_usage_period CHAR(7) NOT NULL,
    book_ocr_usage_pages_used INT NOT NULL DEFAULT 0,
    book_ocr_usage_metadata JSONB NOT NULL DEFAULT '{}',
    book_ocr_usage_created_by BIGINT,
    book_ocr_usage_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_ocr_usage_updated_by BIGINT,
    book_ocr_usage_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_ocr_usage_user_period UNIQUE (book_ocr_usage_user_account_id, book_ocr_usage_period),
    CONSTRAINT chk_book_ocr_usage_pages CHECK (book_ocr_usage_pages_used >= 0),
    CONSTRAINT fk_book_ocr_usage_user_account FOREIGN KEY (book_ocr_usage_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_usage_tenant FOREIGN KEY (book_ocr_usage_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_usage_organization FOREIGN KEY (book_ocr_usage_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_usage_created_by FOREIGN KEY (book_ocr_usage_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_book_ocr_usage_updated_by FOREIGN KEY (book_ocr_usage_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_book_ocr_usage_tenant_code ON content.book_ocr_usage (book_ocr_usage_tenant_code);
CREATE INDEX idx_book_ocr_usage_organization_id ON content.book_ocr_usage (book_ocr_usage_organization_id);
CREATE INDEX idx_book_ocr_usage_created_by ON content.book_ocr_usage (book_ocr_usage_created_by);
CREATE INDEX idx_book_ocr_usage_updated_by ON content.book_ocr_usage (book_ocr_usage_updated_by);
CREATE TRIGGER trg_book_ocr_usage_updated_at BEFORE UPDATE ON content.book_ocr_usage FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('book_ocr_usage_updated_at');

-- -----------------------------------------------------
-- Table: content.book_sentence_translation
-- Purpose: Kişisel kitabın cümle çevirileri (paylaşılan önbelleğe yazılmaz; kitapla silinir).
-- -----------------------------------------------------
CREATE TABLE content.book_sentence_translation (
    book_sentence_translation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_sentence_translation_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    book_sentence_translation_tenant_code BIGINT NOT NULL,
    book_sentence_translation_organization_id BIGINT NOT NULL,
    book_sentence_translation_book_id BIGINT NOT NULL,
    book_sentence_translation_hash CHAR(64) NOT NULL,
    book_sentence_translation_text TEXT NOT NULL,
    book_sentence_translation_model VARCHAR(120),
    book_sentence_translation_metadata JSONB NOT NULL DEFAULT '{}',
    book_sentence_translation_created_by BIGINT,
    book_sentence_translation_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_sentence_translation_updated_by BIGINT,
    book_sentence_translation_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_sentence_translation_book_hash UNIQUE (book_sentence_translation_book_id, book_sentence_translation_hash),
    CONSTRAINT fk_book_sentence_translation_book FOREIGN KEY (book_sentence_translation_book_id) REFERENCES content.book(book_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_sentence_translation_tenant FOREIGN KEY (book_sentence_translation_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_book_sentence_translation_organization FOREIGN KEY (book_sentence_translation_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_sentence_translation_created_by FOREIGN KEY (book_sentence_translation_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_book_sentence_translation_updated_by FOREIGN KEY (book_sentence_translation_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_book_sentence_translation_tenant_code ON content.book_sentence_translation (book_sentence_translation_tenant_code);
CREATE INDEX idx_book_sentence_translation_organization_id ON content.book_sentence_translation (book_sentence_translation_organization_id);
CREATE INDEX idx_book_sentence_translation_created_by ON content.book_sentence_translation (book_sentence_translation_created_by);
CREATE INDEX idx_book_sentence_translation_updated_by ON content.book_sentence_translation (book_sentence_translation_updated_by);
CREATE TRIGGER trg_book_sentence_translation_updated_at BEFORE UPDATE ON content.book_sentence_translation FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('book_sentence_translation_updated_at');

COMMIT;
