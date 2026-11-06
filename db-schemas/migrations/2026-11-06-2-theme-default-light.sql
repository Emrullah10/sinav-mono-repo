-- Varsayılan tema açık (2026-11-06): yeni kullanıcılar açık temayla başlar.
-- Mevcut satırlardan yalnız HİÇ DOKUNULMAMIŞ olanlar ('system' ve updated_at = created_at,
-- yani kullanıcı tercih ekranında hiçbir şey değiştirmemiş) açığa çekilir; bilinçli seçim korunur.
ALTER TABLE identity.user_preference ALTER COLUMN user_preference_theme SET DEFAULT 'light';

UPDATE identity.user_preference
   SET user_preference_theme = 'light'
 WHERE user_preference_theme = 'system'
   AND user_preference_updated_at = user_preference_created_at;
