-- Kitap okuma (2026-11-07):
-- 1) PDF çıkarma sürüm 2: telif/başlık/içindekiler sayfaları, yayınevi reklamı, arka kapak ve adres satırları okuma
--    modundan çıkar; bölümler içindekiler sayfasından ayrılır; harf aralıklı kelimeler birleşir (book-extract.js EXTRACT_VERSION).
--    Okunabilir durumdaki dosyalı kitaplar yeniden işleme sırasına alınır; 'book-process' cron'u dakikada bir alır.
--    OCR'lı kitaplar alınmaz (OCR metni işlemeden sonra silinir, yeniden çıkarmada kaybolur).
--    Hata olursa kitap eski hâline döner (books.js failBook, metadata.reprocess). Okuma yeri PDF sayfasına göre taşınır.
-- 2) Sesli okuma (read_aloud): ücretli tüm ürünlerde açık, ücretsizde kapalı. Cihazın konuşma motoru kullanılır, sunucu maliyeti yok.
-- Tekrar koşmak aynı sonucu verir.

UPDATE content.book
   SET book_status = 'processing', book_processing_started_at = NULL, book_processing_attempts = 0,
       book_metadata = book_metadata || '{"reprocess": true}'::jsonb
 WHERE book_status = 'ready' AND book_has_file AND book_ocr_page_done = 0
   AND coalesce((book_metadata->>'extractVersion')::int, 1) < 2;

INSERT INTO enums.feature (feature_value, feature_label, feature_sort_order)
VALUES ('read_aloud', 'Read aloud', 9)
ON CONFLICT (feature_value) DO NOTHING;

INSERT INTO billing.product_feature (product_feature_tenant_code, product_feature_organization_id, product_feature_product_id,
                                     product_feature_feature, product_feature_limit_value, product_feature_limit_period, product_feature_is_enabled)
SELECT p.product_tenant_code, p.product_organization_id, p.product_id, 'read_aloud', NULL, NULL, p.product_key <> 'free'
  FROM billing.product p
ON CONFLICT (product_feature_product_id, product_feature_feature) DO NOTHING;
