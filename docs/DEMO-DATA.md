# Demo verisi (Elif ve Zeynep)

`scripts/seed/demo-learners.mjs`, iki demo öğrenciyi **gerçek servisler** (gateway :2000) üzerinden oluşturur. Tablolara doğrudan yazmaz; DB yalnızca soruların doğru şıkkını okumak için açılır (doğruluk oranını kişiliğe göre ayarlamak için).

## Çalıştırma
Ön koşul: compose (PG, Redis, Mailpit), migration + içerik seed'i (`npm run seed`) ve servisler (pm2) ayakta.

```
node scripts/seed/demo-learners.mjs              # ikisi de
node scripts/seed/demo-learners.mjs --only elif  # yalnız biri (elif | zeynep)
```

## Hesaplar
| Öğrenci | E-posta | Plan | Hedef |
|---|---|---|---|
| Elif | `elif.demo@sinav.local` | Premium (7 gün deneme, `premium-monthly`) | YDS 75 |
| Zeynep | `zeynep.demo@sinav.local` | Ücretsiz | YDS 55 |

Şifre (her ikisi): `DemoSinav2026!` (`DEMO_PASSWORD` ile değişir). Yalnız yerel geliştirme içindir. İlk çalıştırmada hesap e-posta koduyla (Mailpit) açılır ve şifre konur; sonraki çalıştırmalar şifreyle girer (saatlik kod sınırına takılmaz).

## Oluşan veri
| Adım | Elif (güçlü, düzenli) | Zeynep (başlangıç, ücretsiz) |
|---|---|---|
| Kayıt + müsaitlik | YDS-EN, hedef 75, haftada ~6 saat | YDS-EN, hedef 55, haftada ~100 dk |
| Seviye tespiti | 30 soru, ~%60 | 30 soru, ~%38 |
| Alıştırma | 5 oturum (okuma, dil bilgisi, kelime, karışık, süreli), ~%72 | 1 oturum, ~%46 |
| Kelime (FSRS) | `yds-frequent`, 2 oturum | `yds-frequent`, 1 oturum (günlük 20 kart sınırı) |
| Hata defteri | Yanlışlardan otomatik girer; hatalara tür etiketi (bilgi eksiği, dikkat, süre, tuzak, kelime) yazılır | aynı |
| Deneme | 1 mini + 1 tam deneme | 1 mini deneme (ücretsiz kota: ayda 1) |
| Puan tahmini | `mock_exam` kaynaklı aralık | aynı |

Rastgelelik kişi adından tohumlanır (deterministik); `clientRef` değerleri girdiden türetilir.

## Idempotency
Her adım mevcut durumu sorgular ve doluysa atlar: kayıt (`enrollments/active`), seviye tespiti (`diagnostic.status`), alıştırma (`progress/overview` toplam soru), kelime (`vocab/overview` kart sayısı), deneme (`exams/overview` geçmişi), premium (`entitlements`). Hata türü etiketleme yalnız etiketsiz hatalara dokunur (sayfa başı 50; tekrar çalıştırınca tamamlanır). Baştan başlamak için `npm run db:fresh` + `npm run seed`.

## Notlar
- Geçmişe tarih basılmaz: tüm etkinlik çalıştırma gününe düşer (seri 1). Çok günlü geçmiş gerekirse servislerin zaman enjeksiyonu eklenmeli.
- Günlük soru hakkı (ücretsiz 15) dolarsa Zeynep'in alıştırması kesilir; hata değildir.
- Hata tekrar vadeleri (3 gün sonra) bugün için boş görünür; vadeli hata görmek için birkaç gün sonra çalıştırın.
