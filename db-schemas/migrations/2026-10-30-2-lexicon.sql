-- Dokun-çevir: kelimeye dokununca sözlük, cümleye basılı tutunca cümle çevirisi.
--
-- NEDEN: Küratörlü sözlük (content.vocab_entry) birkaç yüz kelime; metinlerdeki her kelime için AI açıklaması
-- bir kez üretilip content.word_gloss'ta saklanır (sonraki dokunuşlar AI'sız). Cümle çevirileri de cümle metninin
-- özetine göre content.sentence_translation'da saklanır. Öğrenci kelimeyi kartlarına eklerse açıklama
-- 'ai_gloss' kaynaklı yayımlanmış bir vocab_entry kaydına dönüşür (CMS'te kaynağa göre süzülüp gözden geçirilebilir).
-- Önce salt okunur kontrol (boş dönmeli): SELECT to_regclass('content.word_gloss'), to_regclass('content.sentence_translation');
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-30-2-lexicon.sql
BEGIN;

INSERT INTO enums.ai_feature (ai_feature_value, ai_feature_label, ai_feature_sort_order) VALUES
    ('word_gloss', 'Word gloss', 4),
    ('sentence_translation', 'Sentence translation', 5);

INSERT INTO enums.content_origin (content_origin_value, content_origin_label, content_origin_sort_order) VALUES
    ('ai_gloss', 'AI dictionary gloss', 5);

INSERT INTO enums.part_of_speech (part_of_speech_value, part_of_speech_label, part_of_speech_sort_order) VALUES
    ('pronoun', 'Pronoun', 10),
    ('determiner', 'Determiner', 11),
    ('interjection', 'Interjection', 12),
    ('numeral', 'Numeral', 13);

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

COMMIT;
