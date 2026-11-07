-- Sesli okuma yapay zekâ sesi (2026-11-07): cihaz sesi "duygusuz" bulundu; okuyucu artık cümle sesini sunucudan alır
-- (OpenRouter fish-audio/drama-3, tutor servisi üzerinden). Ücret tutor.ai_usage'a 'read_aloud' özelliğiyle yazılır;
-- günlük/kullanıcı tavanları buradan okunur (book-speech.js). Tekrar koşmak aynı sonucu verir.
INSERT INTO enums.ai_feature (ai_feature_value, ai_feature_label, ai_feature_sort_order)
VALUES ('read_aloud', 'Read aloud', 9)
ON CONFLICT (ai_feature_value) DO NOTHING;
