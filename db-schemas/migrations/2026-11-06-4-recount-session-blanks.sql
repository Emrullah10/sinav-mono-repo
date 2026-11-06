-- Boş cevap sayımı düzeltmesi (2026-11-06): "Bilmiyorum, geç" kesin sayılan oturumlarda (seviye tespiti) ve
-- cevapsız "çözümü gör"de madde answered + seçimsiz kaydedilir; sayaç bunları YANLIŞ saydığı için sonuçta "0 boş" görünüyordu.
-- Kod artık seçimsiz maddeyi boş sayıyor (attempts.js recomputeSessionCounters). Bu göç, yalnız böyle maddesi olan
-- oturumların wrong/blank sayaçlarını aynı kuralla yeniden hesaplar. Tekrar koşmak aynı sonucu verir.
--
-- answered_count = BİTİRİLEN madde (ilerleme, yarı yol molası, plan görevi yüzdesi bunu kullanır) ve seçimsiz
-- (boş) maddeleri de içerir; bu yüzden eşitlik kısıtı answered = correct + wrong, answered >= correct + wrong olur.
ALTER TABLE learning.study_session DROP CONSTRAINT IF EXISTS chk_study_session_answered;
ALTER TABLE learning.study_session ADD CONSTRAINT chk_study_session_answered
    CHECK (study_session_answered_count >= study_session_correct_count + study_session_wrong_count);

WITH a AS (
  SELECT i.study_session_item_study_session_id AS sid,
         count(*) FILTER (WHERE i.study_session_item_status = 'answered')::int AS answered,
         count(*) FILTER (WHERE i.study_session_item_status = 'answered' AND i.study_session_item_is_correct)::int AS correct,
         count(*) FILTER (WHERE i.study_session_item_status = 'skipped')::int AS skipped,
         count(*) FILTER (WHERE i.study_session_item_status = 'answered' AND i.study_session_item_selected_label IS NULL
                                AND i.study_session_item_is_correct IS NOT TRUE)::int AS answered_blank,
         count(*)::int AS total
    FROM learning.study_session_item i
   GROUP BY i.study_session_item_study_session_id
)
UPDATE learning.study_session s
   SET study_session_wrong_count = a.answered - a.correct - a.answered_blank,
       study_session_blank_count = (CASE WHEN s.study_session_status IN ('completed', 'expired', 'abandoned')
                                         THEN a.total - a.answered ELSE a.skipped END) + a.answered_blank
  FROM a
 WHERE s.study_session_id = a.sid
   AND a.answered_blank > 0;
