# Kararlar

Yer tutucular: proje=sinav · Proje=ODAK (BEKLİYOR: marka) · PROJE=SINAV · proje_db=sinav · PORT_BASE=2000 · TZ=Europe/Istanbul · diller=tr,en · DB rolü sinav_svc
Ayrıntılı plan: docs/PLAN-P0.md (§8 varsayımlar).

[2026-10-08] Çok servisli mimari (gateway+identity/content/learning/billing/tutor) — sınırlar net kalsın — tek servise birleştirilebilir
[2026-10-08] PORT_BASE 2000, PG 5434, Redis 6380 — 1000/5432/6379 başka projede dolu — .env'den değişir
[2026-10-08] Test dosyası yazılmaz, yalnız klasör yapısı — kullanıcı kuralı — sonradan eklenebilir
[2026-10-08] design/shots git dışında — 331 MB, render.cjs ile yeniden üretilir — .gitignore satırı silinir
[2026-10-08] Yapay zekâ OpenRouter — kullanıcı tercihi — adaptör tek dosya

BEKLİYOR: iyzico hesabı, e-Arşiv, Apple/Google giriş, Expo/EAS, alan adları, üretim SMTP, marka adı, OPENROUTER_API_KEY, hukuk/içerik onayı, deploy
[2026-10-08] PG portu 5434 — 5433 arch_postgres tarafından kullanılıyor — compose+.env
