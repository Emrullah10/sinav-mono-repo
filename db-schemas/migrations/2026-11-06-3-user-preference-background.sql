-- Arka plan tercihi (2026-11-06): uygulama arka planı (sade / hazır desen / özel desen) ve kullanıcının
-- Desen stüdyosu'nda kaydettiği özel arka planlar (en fazla 6; biçim packages/modules/shared/domain/backgrounds.js).
-- Premium'a özel seçimler sunucuda doğrulanır; Premium biterse kayıt korunur, görünen arka plan sadeye düşer.
ALTER TABLE identity.user_preference
    ADD COLUMN IF NOT EXISTS user_preference_background JSONB NOT NULL DEFAULT '{"key":"plain"}'::jsonb,
    ADD COLUMN IF NOT EXISTS user_preference_custom_backgrounds JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE identity.user_preference DROP CONSTRAINT IF EXISTS chk_user_preference_custom_backgrounds_array;
ALTER TABLE identity.user_preference
    ADD CONSTRAINT chk_user_preference_custom_backgrounds_array CHECK (jsonb_typeof(user_preference_custom_backgrounds) = 'array');
