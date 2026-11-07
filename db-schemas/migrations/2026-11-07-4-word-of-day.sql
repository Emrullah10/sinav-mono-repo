-- Günün kelimesi bildirimi (2026-11-07): mobil uygulama her gün öğlen yerel bildirimle bir kelime / bağlaç / phrasal verb gösterir.
-- Tercih varsayılan açık; Ayarlar › Bildirimler'den kapatılır. Tekrar koşmak aynı sonucu verir.
ALTER TABLE notify.preference ADD COLUMN IF NOT EXISTS preference_word_of_day_enabled BOOLEAN NOT NULL DEFAULT true;
