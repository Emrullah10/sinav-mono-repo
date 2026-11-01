-- Dokun-çevir ön-çevirisi + kontrol.
--
-- NEDEN: Yayındaki içeriğin kelime/cümleleri arka planda YALNIZ ücretsiz modelle önceden çevrilir (content işi lexicon-prefill).
-- Ücretsiz modeller anlam hatası yapabildiği için her kayıt ardından ucuz bir modelle (openrouter/auto + cost_tier low, düşünme
-- kapalı) denetlenir; kontrolcü yalnız hatalı kayıtları düzeltir. Hangi kaydın denetlendiği *_reviewed_at / *_review_model'de
-- tutulur. ai_usage'da ön-çeviri ve kontrol ayrı özellik olarak izlenir (maliyet kontrolü + günlük kontrol tavanı).
-- Önce salt okunur kontrol (boş dönmeli):
--   SELECT column_name FROM information_schema.columns WHERE table_schema = 'content' AND column_name IN ('word_gloss_reviewed_at', 'sentence_translation_reviewed_at');
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-11-01-1-lexicon-review.sql
BEGIN;

INSERT INTO enums.ai_feature (ai_feature_value, ai_feature_label, ai_feature_sort_order) VALUES
    ('lexicon_prefill', 'Lexicon prefill', 6),
    ('lexicon_review', 'Lexicon review', 7);

ALTER TABLE content.word_gloss
    ADD COLUMN word_gloss_reviewed_at TIMESTAMPTZ,
    ADD COLUMN word_gloss_review_model VARCHAR(120);

ALTER TABLE content.sentence_translation
    ADD COLUMN sentence_translation_reviewed_at TIMESTAMPTZ,
    ADD COLUMN sentence_translation_review_model VARCHAR(120);

COMMIT;
