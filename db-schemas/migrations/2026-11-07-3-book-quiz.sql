-- Kitap soruları (2026-11-07):
-- 1) PDF çıkarma sürüm 3: kitabın kendi soruları (çoktan seçmeli test, "Activities/Exercises" bölümleri, cevap anahtarı)
--    okuma metninden ayrılır, kitap üst verisinde (book_metadata.quiz) saklanır (book-quiz-extract.js).
--    Dosyalı, okunabilir kitaplar yeniden işleme sırasına alınır ('book-process' cron'u dakikada bir alır; hata olursa eski hâline döner).
-- 2) content.book_quiz: kitap başına bir kez, biri soruları ilk açtığında kitabın soruları + yapay zekâyla tamamlananlar (en ucuz model).
-- 3) book_quiz özelliği: yalnız ücretli ürünlerde açık. Yapay zekâ ücreti tutor.ai_usage'a 'book_quiz' olarak yazılır.
-- Tekrar koşmak aynı sonucu verir.

CREATE TABLE IF NOT EXISTS enums.book_quiz_status (
    book_quiz_status_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    book_quiz_status_value VARCHAR(100) PRIMARY KEY,
    book_quiz_status_label VARCHAR(255) NOT NULL,
    book_quiz_status_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.book_quiz_status (book_quiz_status_value, book_quiz_status_label, book_quiz_status_sort_order) VALUES
    ('generating', 'Generating', 1),
    ('ready', 'Ready', 2),
    ('failed', 'Failed', 3)
ON CONFLICT (book_quiz_status_value) DO NOTHING;

CREATE TABLE IF NOT EXISTS content.book_quiz (
    book_quiz_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_quiz_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    book_quiz_tenant_code BIGINT NOT NULL,
    book_quiz_organization_id BIGINT NOT NULL,
    book_quiz_book_id BIGINT NOT NULL,
    book_quiz_status VARCHAR(100) NOT NULL DEFAULT 'generating',
    book_quiz_questions JSONB NOT NULL DEFAULT '[]',
    book_quiz_activities JSONB NOT NULL DEFAULT '[]',
    book_quiz_model VARCHAR(100),
    book_quiz_cost_micros BIGINT NOT NULL DEFAULT 0,
    book_quiz_attempts SMALLINT NOT NULL DEFAULT 0,
    book_quiz_error_code VARCHAR(100),
    book_quiz_started_at TIMESTAMPTZ,
    book_quiz_metadata JSONB NOT NULL DEFAULT '{}',
    book_quiz_created_by BIGINT,
    book_quiz_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    book_quiz_updated_by BIGINT,
    book_quiz_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_quiz_book UNIQUE (book_quiz_book_id),
    CONSTRAINT fk_book_quiz_book FOREIGN KEY (book_quiz_book_id) REFERENCES content.book(book_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_quiz_status FOREIGN KEY (book_quiz_status) REFERENCES enums.book_quiz_status(book_quiz_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_book_quiz_tenant FOREIGN KEY (book_quiz_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_book_quiz_organization FOREIGN KEY (book_quiz_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_book_quiz_created_by FOREIGN KEY (book_quiz_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_book_quiz_updated_by FOREIGN KEY (book_quiz_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS idx_book_quiz_tenant_code ON content.book_quiz (book_quiz_tenant_code);
CREATE INDEX IF NOT EXISTS idx_book_quiz_organization_id ON content.book_quiz (book_quiz_organization_id);
CREATE INDEX IF NOT EXISTS idx_book_quiz_status ON content.book_quiz (book_quiz_status);
CREATE INDEX IF NOT EXISTS idx_book_quiz_created_by ON content.book_quiz (book_quiz_created_by);
CREATE INDEX IF NOT EXISTS idx_book_quiz_updated_by ON content.book_quiz (book_quiz_updated_by);
DROP TRIGGER IF EXISTS trg_book_quiz_updated_at ON content.book_quiz;
CREATE TRIGGER trg_book_quiz_updated_at BEFORE UPDATE ON content.book_quiz FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('book_quiz_updated_at');

INSERT INTO enums.ai_feature (ai_feature_value, ai_feature_label, ai_feature_sort_order)
VALUES ('book_quiz', 'Book quiz', 10)
ON CONFLICT (ai_feature_value) DO NOTHING;

INSERT INTO enums.feature (feature_value, feature_label, feature_sort_order)
VALUES ('book_quiz', 'Book quiz', 10)
ON CONFLICT (feature_value) DO NOTHING;

INSERT INTO billing.product_feature (product_feature_tenant_code, product_feature_organization_id, product_feature_product_id,
                                     product_feature_feature, product_feature_limit_value, product_feature_limit_period, product_feature_is_enabled)
SELECT p.product_tenant_code, p.product_organization_id, p.product_id, 'book_quiz', NULL, NULL, p.product_key <> 'free'
  FROM billing.product p
ON CONFLICT (product_feature_product_id, product_feature_feature) DO NOTHING;

UPDATE content.book
   SET book_status = 'processing', book_processing_started_at = NULL, book_processing_attempts = 0,
       book_metadata = book_metadata || '{"reprocess": true}'::jsonb
 WHERE book_status = 'ready' AND book_has_file AND book_ocr_page_done = 0
   AND coalesce((book_metadata->>'extractVersion')::int, 1) < 3;
