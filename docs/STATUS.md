# Durum (2026-10-09) — oturum limiti nedeniyle durduruldu

## Tamam (doğrulandı)
- Faz 0: iki repo (`sinav-mono-repo`, `sinav-mobile`), design/docs taşındı, DECISIONS/PLAN-P0/ARCHITECTURE.
- Faz 1–2: kök iskelet, compose (PG 5434, Redis 6380, Mailpit), `.env`, AI katmanı, `packages/*` (tropiq temiz), design-tokens, i18n, client-sdk (identity+gateway).
- Faz 3: 102 tablo + 89 enum (`db-schemas/00–10`), P0 migration'ları; `scripts/verify-schema-paths.mjs` iki kurulum yolunun aynı şemayı ürettiğini doğruladı; `gen-table-definitions` ile 5 core.
- Faz 5: identity servisi (guest/kod/kayıt/giriş/şifre/hesap/tercih/silme/veri talebi/bildirim kuyruğu/waitlist/contact) — Mailpit ile uçtan uca denendi.
- Faz 6: gateway (bearer taşıma, Redis rate limit, bakım modu, landing CORS) — çerez+CSRF ve bearer akışları, refresh rotasyonu, logout denendi.
- Faz 8 altyapı: `sinav-web-app` (sağlayıcılar, axios, router, düzenler, bileşenler) build+lint temiz; `sinav-landing-app` iskeleti.
- İçerik (seed JSON): sözcük/dil bilgisi/cümle tamamlama (200), okuma (24 metin), cloze (14 metin). Uzman onayı BEKLİYOR.
- Yardımcılar: `scripts/dev/client.mjs`, `check-client-sdk.mjs`, `validate-auth-config.js` (yeşil), `update.sh`, CI, `docs/SERVICE-GUIDE.md`, `SEED-FORMAT.md`, `WEB-GUIDE.md`, `docs/api/identity.md`.

## Yarım kalan (ajanlar limitte kesildi; dosyaları diskte, doğrulanmadı)
seed yükleyici+taksonomi+katalog (`scripts/seed`, `db-schemas/seed/yds/{taxonomy,catalog,notes}.json`), content/learning/billing/tutor servisleri (kısmen yazıldı), çeviri/diyalog/yakın anlam/paragraf içerikleri, hap not/kelime/makale/yasal içerik, mobil temel (Expo kısmen kuruldu), web auth/onboarding/diagnostic ekranları.

## Kalan
learning L2 (kelime FSRS, hata tekrarı, deneme), web ekranları (HOME/STUDY/TUTOR/EXAM/ME/PAY/CMS/SYS), tanıtım sitesi, mobil ekranlar, demo öğrenciler (Elif/Zeynep), Faz 9 kabul koşusu, `.gitignore`/§0.4 grep temizliği, iki repoda son commit.
Devam: yarım kalan ajanları sırayla yeniden başlat (diskteki dosyalardan sürdürerek).
