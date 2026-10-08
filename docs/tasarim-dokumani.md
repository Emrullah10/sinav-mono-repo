# YDS Platformu Tasarım Dokümanı

Oct 1, 2026 · @filont

## 1. Bu doküman nasıl kullanılır

Bu doküman, platformun web, mobil ve tablette, açık ve koyu temada bütün ekranlarını tasarlamak için gereken kararları tek yerde toplar. Tasarımcı bunu hem brif hem şartname olarak kullanır; burada yazmayan bir şeye karar vermesi gerekirse Bölüm 22'deki açık kararlar listesine ekler.

### Kapsam

- **Öğrenci uygulaması:** iOS, Android ve web (masaüstü, mobil tarayıcı, PWA).
- **Kurum paneli ve hoca stüdyosu:** önce masaüstü web; tablet ve telefonda okunabilir, temel işlemler yapılabilir.
- **İç araçlar:** içerik editörü ve inceleme kuyruğu, yalnızca masaüstü web.
- **Çevre:** pazarlama sitesi, e-posta ve bildirim şablonları, mağaza görselleri, sosyal medya şablonları, basılı kitap sistemi.
- **Temalar:** açık, koyu ve sistem; kurumlar için logo ve sınırlı aksan rengi.
- **Dil:** v1 Türkçe. Arayüz İngilizceye hazır kurulur: metinler koddan ayrı tutulur, %30 uzama payı bırakılır.

### Kim ne için okur

| Okuyucu | Kullandığı bölümler |
| --- | --- |
| Ürün tasarımcısı | Hepsi; özellikle 3, 5–13, 16–18 |
| Marka tasarımcısı | 4, 5, 6, 20 |
| Geliştirici | 5–8, 10, 16–18, 21 |
| İçerik ekibi | 9, 19, 22 |
| Ürün sahibi | 2, 12, 21, 22 |

### Öncelik etiketleri

| Etiket | Anlamı | Zaman |
| --- | --- | --- |
| P0 | MVP; bu olmadan yayına çıkılmaz | Aralık 2026 – Şubat 2027 |
| P1 | Sürüm 2: mobil uygulamalar ve YÖKDİL | Mart – Temmuz 2027 |
| P2 | Kurumlar, hocalar, kitaplar | Ağustos – Aralık 2027 |
| P3 | Gelecek modüller; şimdi yalnızca yer açılır | 2028 ve sonrası |

P3 ekranları şimdi çizilmez. Ama gezinme, bileşenler ve token'lar onlara yer bırakacak şekilde kurulur (Bölüm 15).

### Bir ekran ne zaman bitmiş sayılır

1. Telefon: 390 × 844 pt çerçevede açık ve koyu; 360 ve 430 pt genişlikte taşma kontrolü.
2. Masaüstü web: 1440 × 900 px çerçevede açık ve koyu; 1280 ve 1920 px genişlikte kontrol.
3. Tablet: yalnızca envanterde "T" işaretli ekranlar için 834 × 1194 pt dikey ve 1194 × 834 pt yatay.
4. Durumlar: boş, yükleniyor, hata; varsa çevrimdışı, kilitli (Premium) ve izin yok.
5. Metin testi: en uzun gerçek Türkçe metinle ve yazı boyutu %200'de.
6. Etkileşim notları; P0 akışlarında tıklanabilir prototip.

### Bu dokümanın dışında kalanlar

Sunucu ve API ayrıntıları ayrı teknik dokümanda; kampanya metinleri ayrı içerik planında. Pazar ve rakip analizi için [YDS Platform Stratejisi](https://claude.ai/artifact/9kv3qcmZsSTS1RsHr1tbxT) raporuna bakılır.

## 2. Ürün özeti ve personalar

Ürün, YDS'ye hazırlanan yetişkinlere sınavı bilen bir yapay zekâ öğretmeni, her gün yenilenen bir plan ve uzman onaylı içerik sunar. YDS ile başlar; aynı çekirdekle e-YDS, YÖKDİL ve sonra başka sınavlara açılır. Konumlanma cümlesi: **Sınavı bilen bir öğretmen, kursun onda biri fiyatına.**

### Tasarımcının bilmesi gereken sınav gerçekleri

| Konu | Gerçek | Tasarıma etkisi |
| --- | --- | --- |
| Biçim | 80 soru, 180 dakika, her soruda 5 seçenek (A–E) | Soru kartı, seçenek baloncukları, sayaç |
| Puan | Her doğru 1,25 puan; yanlış doğruyu götürmez | "Boş bırakma" uyarıları; puan = doğru × 1,25 |
| Hedefler | 50 yüksek lisans; 55 doktora ve doçentlik; 70 ve üzeri dil tazminatı | Hedef seçici ve "gereken doğru" göstergesi |
| Soru tipleri | 10 tip; dağılım Bölüm 22'de | Çalış merkezi ve analizler bu 10 tipe göre |
| Oturumlar | YDS yılda iki kez (Nisan, Kasım); e-YDS İngilizce 2026'da 8 kez; YÖKDİL yılda iki kez | Sınav tarihi seçici, geri sayım |
| e-YDS | ÖSYM e-sınav merkezlerinde bilgisayarda | Masaüstünde e-YDS deneme modu |
| YÖKDİL | Fen, Sağlık ve Sosyal alanları | Alan seçimi, alan metinleri, alan sözlüğü |
| Konuşma ve dinleme | YDS'de yok | Ses özellikleri P3 |

### İş modeli ve ekranlara yansıması

| Plan | Fiyat | Ekranda nerede görünür |
| --- | --- | --- |
| Ücretsiz | 0 TL; günde 15 soru, 5 öğretmen mesajı, 20 kelime kartı, ayda 1 mini deneme | Limit sayacı, limit doldu ekranı |
| Premium | 349 TL/ay, 7 gün ücretsiz | Paywall, abonelik yönetimi |
| Sınav dönemi | 1.490 TL tek ödeme, bir sonraki oturuma kadar | Paywall'da önerilen plan |
| Yıllık | 2.490 TL; kurucu üyelere 1.790 TL | Paywall, kurucu üyelik sayfası |
| Kurum | Öğrenci başı aya 120–200 TL | Kurum paneli, lisans ekranı |

Fiyatlar değişecek; tasarımda sabit metin değil, değişken alan olarak ele alınır.

### Personalar

| Persona | Hedef | Bağlam | Acı noktası | Tasarım için anlamı |
| --- | --- | --- | --- | --- |
| Zeynep, 27, doktora adayı (sosyal bilimler) | 55; Şubat'taki doktora başvurusu | Dizüstü ve telefon; akşamları 1–2 saat, kütüphane | Neye çalışacağını bilmiyor, kaynaklar dağınık, bütçesi dar | "Bugün ne?" sorusuna tek cevap; ücretsiz planla güven |
| Dr. Murat, 38, doçent adayı (mühendislik) | 60; garantiye almak | Telefon; işe gidiş geliş 2 × 25 dk, hafta sonu | Zamanı yok; çocuksu uygulamalardan soğuyor | 10–15 dakikalık oturumlar, ciddi ton, tek dokunuşla devam |
| Dr. Elif, 31, uzman hekim (YÖKDİL Sağlık) | 65 | Telefon; nöbet sonrası gece, koyu tema | Yorgunluk, düzensiz program | Kusursuz koyu tema, cezalandırmayan plan, tıbbi metinler |
| Ahmet, 42, kamu personeli | 80; B düzeyi dil tazminatı | Masaüstü (iş yeri) ve telefon | Gramer temeli zayıf, yıllardır İngilizce kullanmamış | Temelden başlatan plan, kazanç hesabı, büyük yazı desteği |
| Selin Hoca, 35, bağımsız YDS hocası | Öğrencilerini izlemek, kendi içeriğini satmak | Masaüstü | Takip WhatsApp'ta dağınık | Hoca stüdyosu, sınıf yönetimi, gelir ekranı (P2) |
| Kurum yöneticisi (enstitü, dil okulu, kamu kurumu) | Lisans yönetimi ve toplu ilerleme | Masaüstü | Kimin çalıştığını göremiyor | Tablolar, dışa aktarım, net göstergeler (P2) |
| İçerik editörü (iç ekip) | Soru yazmak ve onaylamak | Masaüstü, yoğun klavye | Tekrarlayan form doldurma | Hızlı editör, klavye kısayolları, inceleme kuyruğu (P0) |

### Kullanım bağlamlarının tasarım kararları

- **Kısa oturum:** tipik 10–25 dakika. Her an çıkılıp dönülebilir; ilerleme otomatik kaydedilir, "devam et" her zaman tek dokunuş.
- **Gece kullanımı:** koyu tema birinci sınıf vatandaş; açık temadan sonra değil, onunla birlikte tasarlanır.
- **Tek elle kullanım:** toplu taşımada ana eylemler ekranın alt yarısında, başparmağın eriştiği bölgede.
- **Uzun okuma:** paragraf sorularında masaüstü ve tablette metin ile sorular yan yana; telefonda metin katlanır.
- **Zayıf bağlantı:** metro ve otobüste kelime kartları ve indirilen setler çevrimdışı çalışır (P1).

### Tasarımın doğrudan etkilediği ölçütler

| Ölçüt | Hedef |
| --- | --- |
| Yeni kullanıcının ilk soruya ulaşma süresi | 3 dakikadan kısa |
| Aktivasyon: seviye tespiti ve ilk çalışma | %40 ve üzeri |
| 7. gün tutundurma | %25 ve üzeri |
| Ücretsizden ücretliye geçiş | %3–5 |
| Erişilebilirlik | WCAG 2.2 AA |

## 3. Tasarım ilkeleri

Sekiz ilke tüm kararların hakemidir: iki çözüm arasında kalındığında, buradaki ilkelere daha çok uyan seçilir.

| İlke | Yap | Yapma |
| --- | --- | --- |
| **1. Tek ekranda tek iş** | Soru ekranında yalnızca soru, seçenekler, ipucu ve ilerleme | Soru çözerken bildirim, rozet ya da kampanya göstermek |
| **2. Okumak için tasarla** | Okuma metni Literata 18 px, satır başına 60–70 karakter, sola yaslı | Metni dar karta sıkıştırmak, iki yana yaslamak, gri üzerine gri yazmak |
| **3. Önce düşündür, sonra anlat** | Yanlışta önce ipucu merdiveni; çözüm bir dokunuş uzakta | Yanlışın hemen ardından uzun bir açıklama duvarı |
| **4. Renk anlam taşır, tek başına değil** | Doğru = yeşil + ✓ ikonu + "Doğru" yazısı | Durumu yalnızca renkle anlatmak; dekoratif kırmızı |
| **5. Kaygıyı büyütme** | Geri sayımı sakin göster: "52 gün" ve yanında plan | Kırmızı alarm, ünlem, suçlayan bildirim ("3 gündür yoksun!") |
| **6. İlerlemeyi görünür kıl** | Hedef için kalan doğru sayısı, tahmini puan aralığı, beceri ustalığı | Anlamı olmayan XP puanları, sahte seviyeler, sonsuz rozet |
| **7. Yetişkine saygı** | Sade, sıcak, ciddi dil; gerçek kilometre taşları | Maskot, konfeti yağmuru, çocuksu ses efektleri |
| **8. Her tema ve her boyut eşit** | Koyu tema ve %200 yazı boyutu ilk taslaktan itibaren | Koyu temayı sonradan renkleri ters çevirerek üretmek |

Tek istisna: günlük hedef tamamlandığında ve seri kilometre taşlarında (7, 30, 100 gün) kısa, ölçülü bir kutlama anı vardır. Bu, ürünün tek "gösteri" anıdır (Bölüm 7, hareket).

## 4. Marka

Marka sakin, güvenilir ve sıcak; adı sınavdan bağımsız olur ve ana motifi ÖSYM optik formundaki cevap baloncuğudur. İsim henüz kesin değil; tasarımlarda yer tutucu olarak **\[Marka\]** kullanılır.

### Kişilik

| Biziz | Biz değiliz |
| --- | --- |
| Sakin bir koç | Bağıran bir motivasyon hocası |
| Akademik ama anlaşılır | Ders kitabı kuruluğunda |
| Sıcak | Çocuksu |
| Kesin ve dürüst | "Garanti" vaat eden |
| Çağdaş | Oyun uygulaması |

### İsim

- Adaylar: **Etüt**, **Hapnot**, **Pusula**. Her biri için TÜRKPATENT ve alan adı kontrolü gerekli.
- Kurallar: sınav adı içermez; 2–3 hece; Türkçe okunuşu tek; .com.tr ya da .app alan adı alınabilir; mağaza aramasında ayırt edilir.
- Logo çalışması isim kesinleşince başlar. O zamana kadar ekranlar yer tutucu kelime markasıyla tasarlanır.

### Logo brifi

- **Parçalar:** sembol, kelime markası, yatay ve dikey kilit (lockup), yalnızca sembol.
- **Sembol fikri:** dolu bir optik form baloncuğu ile ilerleme ya da yol fikri; "doğru cevabı işaretleme" anı. Tasarımcı en az üç yön önerir.
- **Renk:** Petrol 600 zemin üzerinde beyaz; tek renk siyah ve beyaz sürümler zorunlu.
- **Küçük boyut:** sembol 16 px favicon'da, kelime markası 80 px genişlikte okunur.
- **Boşluk alanı:** sembol yüksekliğinin yarısı; yanlış kullanım örnekleri (germe, gölge, gradyan, döndürme) tek sayfada.
- **Kelime markası:** isim Türkçe karakter içeriyorsa (ı, ş, ü gibi) harf çizimi özel kontrol edilir.

### Uygulama ikonu

| Platform | Gereken |
| --- | --- |
| iOS | 1024 × 1024 PNG, saydamlık yok, köşeleri sistem yuvarlar; açık, koyu ve renklendirilmiş (tinted) varyantlar; güncel katmanlı ikon yapısı için Apple'ın Icon Composer aracına uygun katmanlar |
| Android | Uyarlanabilir ikon: 108 × 108 dp ön ve arka katman, görünen alan 72 dp, logo 66 dp çaplı güvenli alanda; tek renkli (themed) katman; Play Store için 512 × 512 PNG |
| Web | SVG favicon, 32 px favicon.ico, 180 × 180 apple-touch-icon, PWA için 192 ve 512 px ile 512 px maskable |

İkonda yazı kullanılmaz. Mağaza ölçüleri teslimden önce Apple ve Google'ın güncel yönergelerinden doğrulanır.

### Optik form motifi

- **Kullanıldığı yerler:** seçenek baloncukları (gerçek işlev), bölüm numaraları, yükleme göstergesi (beş baloncuk sırayla dolar), boş durum illüstrasyonları, pazarlama görselleri.
- **Kurallar:** baloncuk her zaman tam dairedir; dolu = seçildi ya da tamamlandı, boş = bekliyor. Süs olarak rastgele serpiştirilmez. Bir ekranda motif yalnızca bir yerde vurgu olur.

### Öğretmenin görünümü

Öğretmen bir maskot ya da insan avatarı değil, bir sestir. Petrol renkli küçük bir sembolle temsil edilir (örneğin baloncuk içinde kalem ucu). Yapay zekâ için yaygın "sihirli pırıltı" ikonu kullanılmaz; öğretmen sihir değil, yöntemdir. Adı şimdilik yalnızca "Öğretmen" (Bölüm 22, açık kararlar).

### İllüstrasyon

- **Stil:** düz renk, 1,5–2 px çizgi, az ayrıntı. Nesneler: kâğıt, kalem, baloncuk, yol, kitap, saat, masa lambası.
- **İnsan figürü:** gerekirse yüzsüz ya da yarı soyut; farklı yaş ve görünüşte yetişkinler.
- **Renk:** nötrler, Petrol, vurgu için az Safran. Her illüstrasyonun koyu tema varyantı çizilir.
- **Yasak:** maskot, emoji yüzleri, hazır stok setleri.

Gereken illüstrasyonlar (17 adet):

| # | Yer | Konu |
| --- | --- | --- |
| 1–3 | Karşılama | Sınavı bilen öğretmen; her gün sana özel plan; yanlışlarından öğren |
| 4 | Boş durum | Hata defteri boş |
| 5 | Boş durum | Henüz deneme yok |
| 6 | Boş durum | Bugün tekrar edilecek kart yok |
| 7 | Boş durum | Kaydedilen yok |
| 8 | Boş durum | Bildirim yok |
| 9 | Boş durum | Hocanın sınıfı yok |
| 10 | Hata | Bağlantı yok |
| 11 | Hata | Sunucu hatası |
| 12 | Sistem | Bakım |
| 13 | Kutlama | Gün tamamlandı |
| 14 | Kutlama | Hedef puana ulaşıldı (gerçek sınav sonucu) |
| 15 | Paywall | Başlık görseli |
| 16–17 | E-posta | Hoş geldin ve haftalık rapor başlıkları |

### İkonlar

- **Temel set:** [Lucide](https://lucide.dev) (açık kaynak), 24 px ızgara, çizgi kalınlığı 1,5 px'e ayarlı, yuvarlak uçlar.
- **Boyutlar:** 16, 20, 24 (varsayılan), 32.
- **Özel ikonlar** (Lucide çizgi diliyle): hap not, ipucu, cümle röntgeni, hata defteri, deneme (optik form), e-YDS (monitör ve baloncuk), seri (alev), seri dondurma, tahmini puan, beceri haritası, çeviri koçu, kelime kartı, öğretmen sembolü, kamp, kurum, hoca.
- **Kural:** ikon ilk kullanımında etiketle birlikte görünür; tek başına anlam taşımak zorunda kalmaz. Alt sekme çubuğunda etiket her zaman görünür.

### Fotoğraf

Uygulama içinde fotoğraf yok. Pazarlamada doğal ışıkta çalışan gerçek yetişkinler: kütüphane, mutfak masası, nöbet odası, toplu taşıma. Mezuniyet kepi, abartılı gülümseme ve stok klişeleri yok.

## 5. Renk sistemi

Renk iki katmanlıdır: ilkel ölçekler (Petrol, Safran, Yaprak, Tuğla, Mürekkep, Gece) ve ekranlarda kullanılan anlamsal token'lar. Ekran tasarımında doğrudan onaltılık kod kullanılmaz; her renk bir token'dan gelir, böylece açık ve koyu tema tek taşla değişir.

&#91;image: Renk paleti: ilkel ölçekler ve grafik serileri\]

### 5.1 İlkel ölçekler

Ölçekler OKLCH renk uzayında eşit açıklık adımlarıyla üretildi. Çapa tonlar: Petrol 600 (açık temada ana renk), Petrol 400 (koyu temada ana renk), Safran 500 ve 400, Yaprak 600 ve 400, Tuğla 600 ve 400. Mürekkep 0 = #FFFFFF.

```csv
olcek,50,100,200,300,400,500,600,700,800,900,950
petrol,#F2F8F8,#DCEDEC,#B4DEDB,#87CDC8,#4DB6B0,#2D8D8D,#0E6A6E,#0A5458,#0B4043,#0A2F31,#041F21
safran,#FBF7ED,#FBEFD2,#F8DEA7,#F4CB78,#F0B43A,#E9A514,#B68116,#91650B,#714E04,#523700,#382501
yaprak,#F3F9F5,#DFF1E6,#B5E5C7,#83D2A1,#4CC27D,#359D60,#1F7A45,#026333,#014D26,#04381B,#00240F
tugla,#FCF5F2,#F8E3DC,#F8C8B8,#F3A992,#EE8A6E,#C9654B,#A33D27,#8C2711,#6C1F0F,#51190D,#370C05
murekkep,#F4F6F5,#E9EDEC,#DAE1E0,#C3CDCC,#9AA7A8,#77868A,#5E6B70,#46565C,#2A3A40,#13232A,
```

Koyu tema için ayrı nötrler ve düşük doygunluklu tonlar:

| Ad | Değer | Kullanım |
| --- | --- | --- |
| gece.canvas | #0E171B | Koyu temada uygulama zemini |
| gece.surface | #142127 | Kart, soru kutusu |
| gece.raised | #1B2B32 | Sayfa (sheet), modal, açılır menü |
| gece.overlay | #22343B | Boş soru zemini, seçili satır alternatifi |
| gece.line-1 / 2 / 3 | #24343A / #33474E / #4A5F66 | Çizgiler, kenarlar |
| petrol.tint | #16363A | Vurgu zemini (öğretmen kartı, seçili çip) |
| yaprak.tint | #163524 | Doğru zemini |
| tugla.tint | #3D211A | Yanlış zemini |
| safran.tint | #3A2E12 | Ödül ve uyarı zemini |

### 5.2 Anlamsal token'lar

| Token | Açık | Koyu | Kullanım |
| --- | --- | --- | --- |
| bg.canvas | #F4F6F5 | #0E171B | Uygulama zemini |
| bg.surface | #FFFFFF | #142127 | Kart, soru kutusu, liste |
| bg.raised | #FFFFFF + gölge | #1B2B32 | Sheet, modal, menü |
| bg.input | #FFFFFF | #0E171B | Giriş alanları |
| bg.selected | #DCEDEC | #16363A | Seçili satır ve seçenek |
| bg.hover | Mürekkep 900, %4 | #E4ECEC, %6 | Üzerine gelme |
| bg.pressed | Mürekkep 900, %8 | #E4ECEC, %10 | Basılı durum |
| bg.inverse | #13232A | #E4ECEC | Toast, tooltip |
| bg.scrim | #13232A, %48 | #000000, %60 | Modal ve sheet arkası |
| text.primary | #13232A | #E4ECEC | Ana metin |
| text.reading | #13232A | #D3DCDC | Uzun okuma metni; koyu temada parlamayı azaltır |
| text.secondary | #46565C | #A9B8BA | İkincil metin |
| text.tertiary | #5E6B70 | #8D9DA1 | Yardımcı metin, zaman damgası |
| text.disabled | #9AA7A8 | #5C6D72 | Pasif öğeler |
| text.inverse | #F4F6F5 | #13232A | Ters zemin üzerinde |
| text.link | #0E6A6E | #4DB6B0 | Bağlantılar |
| text.on-accent | #FFFFFF | #0E171B | Petrol düğme üzerinde |
| border.subtle | #E9EDEC | #1F2F35 | Kart içi ayırıcı |
| border.default | #DAE1E0 | #24343A | Kart kenarı, tablo çizgisi |
| border.strong | #C3CDCC | #33474E | Vurgulu kenar |
| border.input | #77868A | #71838A | Giriş alanı kenarı (en az 3:1) |
| border.focus | #0E6A6E | #4DB6B0 | Odak halkası: 2 px çizgi + 2 px boşluk |
| accent.default | #0E6A6E | #4DB6B0 | Birincil düğme, seçili sekme |
| accent.hover | #0A5458 | #87CDC8 | Üzerine gelme |
| accent.pressed | #0B4043 | #B4DEDB | Basılı |
| accent.subtle-bg | #DCEDEC | #16363A | Öğretmen kartı, seçili çip |
| accent.subtle-fg | #0A5458 | #87CDC8 | Vurgu zemini üzerindeki metin |
| reward.default | #E9A514 | #F0B43A | Seri, hedef çizgisi, kutlama; yalnızca dolgu |
| reward.subtle-bg | #FBEFD2 | #3A2E12 | Seri rozeti zemini |
| reward.icon | #B68116 | #F0B43A | Alev ikonu |
| success.fg / bg / border | #1F7A45 / #DFF1E6 / #83D2A1 | #4CC27D / #163524 / #359D60 | Doğru cevap |
| danger.fg / bg / border | #A33D27 / #F8E3DC / #F3A992 | #EE8A6E / #3D211A / #C9654B | Yanlış cevap, yıkıcı eylem |
| warning.fg / bg / border | #714E04 / #FBEFD2 / #F4CB78 | #F0B43A / #3A2E12 / #91650B | Uyarı, süre az kaldı |
| blank.fg / bg | #5E6B70 / #E9EDEC | #9AA7A8 / #22343B | Boş bırakılan soru |
| info | accent.subtle | accent.subtle | Bilgi notları |
| exam.paper / exam.ink | #FFFFFF / #000000 | Aynı (gerçekçi mod) | Kâğıt deneme modu |
| chart.series-1–4 | #0F9485, #505AC8, #BA7F14, #9E427B | #04A19B, #7483E0, #C0851F, #C06099 | Grafik serileri, sıra sabit |
| chart.muted | #A3B1B0 | #4F646A | Bağlam serisi, "diğerleri" |
| chart.grid / chart.axis | #E9EDEC / #C3CDCC | #1F2F35 / #33474E | Izgara ve eksen |
| chart.target | #E9A514 | #F0B43A | Hedef puan çizgisi (kesikli) |
| chart.sequential | Petrol 100 → 600 | Petrol 800 → 300 | Ustalık ısı haritası |

### 5.3 Kurallar

- **Oran:** ekranın yaklaşık %80'i nötr, %15'i petrol, en fazla %5'i safran ve durum renkleri.
- **Safran metin rengi değildir.** Yalnızca dolgu ve ikon; üzerindeki yazı her iki temada koyu (#13232A, koyu temada #0E171B).
- **Tuğla yalnızca iki yerde:** yanlış cevap ve yıkıcı eylem (hesabı sil). Geri sayım, uyarı ve süre için kullanılmaz.
- **Durum = renk + ikon + metin**, üçü birlikte.
- **Gradyan yok** (uygulama içinde). Pazarlamada yalnızca çok hafif zemin geçişleri.
- **Koyu tema ters çevirme değildir:** yükselti açık yüzeyle anlatılır, doygun renkler bir kademe açılır (600 → 400), okuma metni text.reading.
- **Kurum aksanı:** kurum yalnızca accent.default'u değiştirebilir; renk iki temada da metinle 4,5:1 sağlamazsa sistem en yakın geçerli tonu önerir (Bölüm 16).

### 5.4 Kontrast tablosu

WCAG AA: normal metin 4,5:1, büyük metin ve arayüz bileşeni 3:1. Hepsi hesaplandı; text.disabled ve chart.muted eşikten muaf, çünkü tek başına bilgi taşımazlar.

| Çift | Açık | Koyu |
| --- | --- | --- |
| text.primary / bg.canvas | 14,9 | 15,1 |
| text.primary / bg.surface | 16,1 | 13,7 |
| text.secondary / bg.surface | 7,6 | 8,0 |
| text.tertiary / bg.surface | 5,5 | 5,9 |
| text.link / bg.surface | 6,4 | 6,8 |
| text.on-accent / accent.default | 6,4 | 7,5 |
| accent.subtle-fg / accent.subtle-bg | 7,2 | 7,1 |
| success.fg / bg.surface | 5,3 | 7,3 |
| success.fg / success.bg | 4,5 | 5,9 |
| danger.fg / bg.surface | 6,5 | 6,7 |
| danger.fg / danger.bg | 5,2 | 5,9 |
| warning.fg / warning.bg | 6,6 | 7,2 |
| koyu metin / reward.default | 7,6 | 9,8 |
| blank.fg / blank.bg | 4,7 | 5,2 |
| text.inverse / bg.inverse | 14,9 | 13,5 |
| border.focus / bg.canvas | 5,9 | 7,5 |
| border.input / bg.surface | 3,8 | 4,2 |

Grafik serileri renk körlüğü simülasyonuyla da doğrulandı: komşu seriler arasında en kötü fark ΔE 18,8 (açık) ve 11,8 (koyu), hepsi yüzeye karşı 3:1'in üzerinde.

## 6. Tipografi

Üç aile kullanılır: arayüz için Figtree, okuma metinleri için Literata, yalnızca büyük marka anlarında Bricolage Grotesque. Üçü de Google Fonts'ta SIL Open Font License ile dağıtılır; uygulamaya gömülebilir ve web'de kendi sunucumuzdan sunulur.

### 6.1 Aileler

| Rol | Aile | Ağırlıklar | Nerede | Yedek yığın |
| --- | --- | --- | --- | --- |
| Arayüz | [Figtree](https://fonts.google.com/specimen/Figtree) | 400, 500, 600, 700 | Bütün arayüz, düğmeler, sayılar | system-ui, -apple-system, Segoe UI, Roboto, sans-serif |
| Okuma | [Literata](https://fonts.google.com/specimen/Literata) (değişken, optik boyutlu) | 400, 500, 600; italik 400 | Okuma parçaları, soru kökleri, seçenekler, hap not örnekleri, kitaplar | Georgia, Times New Roman, serif |
| Marka | [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) (değişken) | 600, 700 | Ekran başına en çok bir büyük başlık: karşılama, kutlama, paywall, pazarlama | Figtree |
| Tek aralıklı | Sistem: SF Mono, Roboto Mono, Menlo | 500 | Davet kodu, kupon, oturum kodu | monospace |

- **Web:** woff2, latin ve latin-ext alt kümeleri (Türkçe karakterler latin-ext'te), değişken dosyalar, font-display: swap; ilk ekrandaki iki dosya önceden yüklenir.
- **Mobil:** fontlar uygulama paketine gömülür.
- **Rakamlar:** sayacı, tabloyu ve puan sütunlarını tablo rakamlarıyla (tnum) dizeriz. Figtree'nin tnum desteği teslimde doğrulanır; yoksa sayacın her rakamı sabit genişlikte kutuya yerleştirilir. Büyük tekil sayılarda (puan) orantılı rakam kullanılır.

### 6.2 Ölçek

Boyutlar px/pt; "16/24" = yazı boyutu / satır yüksekliği.

| Token | Aile | Mobil | Masaüstü | Ağırlık | Harf aralığı | Kullanım |
| --- | --- | --- | --- | --- | --- | --- |
| display-l | Bricolage | 40/44 | 56/60 | 700 | −2% | Pazarlama ana başlığı, kutlama |
| display-m | Bricolage | 32/36 | 44/48 | 700 | −1,5% | Karşılama, paywall başlığı |
| heading-1 | Figtree | 28/34 | 32/40 | 700 | −1% | Ekran başlığı |
| heading-2 | Figtree | 22/28 | 24/32 | 700 | −0,5% | Bölüm başlığı |
| heading-3 | Figtree | 18/24 | 20/28 | 600 | 0 | Kart başlığı |
| title | Figtree | 16/22 | 17/24 | 600 | 0 | Liste satırı başlığı |
| body-l | Figtree | 17/26 | 18/28 | 400 | 0 | Öğretmen mesajı, açıklamalar |
| body-m | Figtree | 16/24 | 16/24 | 400 | 0 | Varsayılan metin |
| body-s | Figtree | 14/20 | 14/20 | 400 | 0 | İkincil metin |
| label-l | Figtree | 16/20 | 16/20 | 600 | 0 | Büyük düğme |
| label-m | Figtree | 14/18 | 14/18 | 600 | +0,5% | Düğme, çip, sekme |
| label-s | Figtree | 12/16 | 12/16 | 600 | +2% | Etiket, alt sekme yazısı |
| caption | Figtree | 12/16 | 13/18 | 400 | 0 | Yardımcı metin, zaman |
| overline | Figtree | 11/14 | 12/16 | 700 | +8%, büyük harf | Bölüm üstü etiketi |
| reading-l | Literata | 18/29 | 19/32 | 400 | 0 | Okuma parçası |
| reading-m | Literata | 17/27 | 18/29 | 400 | 0 | Soru kökü |
| reading-s | Literata | 16/25 | 17/26 | 400 | 0 | Seçenek metni |
| numeric-xl | Figtree | 48/52 | 64/68 | 700 | −2% | Puan, büyük sayı |
| numeric-l | Figtree | 28/32 | 32/36 | 700 | 0, tnum | Sınav sayacı |
| numeric-m | Figtree | 20/24 | 22/28 | 600 | 0, tnum | İstatistik |

### 6.3 Okuma kuralları

- **Satır uzunluğu:** okuma metni 60–70 karakter; masaüstünde okuma sütunu en fazla 680 px.
- **Hizalama:** sola yaslı; iki yana yaslama yok; Türkçede heceleme kapalı, İngilizce parçalarda isteğe bağlı.
- **Paragraf aralığı:** satır yüksekliğinin %75'i.
- **Okuma ayarları (kullanıcı):** yazı boyutu 4 kademe (−1, varsayılan, +1, +2), satır aralığı 2 kademe, okuma yazı tipi seçimi: Literata, Figtree ya da yüksek okunurluklu bir sans (örneğin Atkinson Hyperlegible; Türkçe desteği doğrulanmalı).
- **Boşluk gösterimi:** soru kökündeki boşluk alt çizgi karakterleriyle değil, 6 karakter genişliğinde 2 px alt çizgili bir bileşenle gösterilir. Seçenek seçilince boşlukta önizlenir (P1).
- **Dil etiketi:** İngilizce içerik lang="en" ile işaretlenir; ekran okuyucu doğru telaffuz eder.
- **Koyu tema:** okuma metni text.reading (#D3DCDC), saf beyaz değil.

### 6.4 Türkçe biçimlendirme

- **Büyük harf:** dönüşüm Türkçe yerel ayarla yapılır: i → İ, ı → I ("BİLGİ", "BILGI" değil).
- **Sayılar:** binlik nokta (1.490), ondalık virgül (57,5), yüzde işareti önde (%26).
- **Para:** her yerde "349 TL".
- **Tarih ve saat:** "22 Kasım 2026", kısa "22 Kas"; 24 saat ("23:12").
- **Süre:** "45 dk", "1 sa 20 dk"; sayaç "02:14:36".
- **Ekler:** değişken değerlerle ek uyumu gerekir (Elif'in, YDS/2'ye, 52 gün). Şablonlar ek gerektirmeyen kalıpla yazılır ("Sınav: YDS/2 · 22 Kasım"); kaçınılmazsa çekim kuralı desteklenir.
- **Uzunluk:** Türkçe kelimeler uzundur (Kaydedilenler, Doğrulanmadı). Düğme ve sekmeler 1,3 kat uzun metinle test edilir.

### 6.5 Sistem yazı boyutu

Tüm metin sistem yazı boyutuyla ölçeklenir: iOS'ta erişilebilirlik boyutlarına kadar, Android'de %200'e kadar. Sabit yükseklikli metin kutusu yoktur; düzen aşağı akar, yatay çubuklar iki satıra iner.

| Token | iOS Dynamic Type | Android |
| --- | --- | --- |
| display-m | Large Title | sp, sistem ölçeğiyle |
| heading-1 | Title 1 | sp |
| heading-2 | Title 2 | sp |
| heading-3 | Title 3 | sp |
| title | Headline | sp |
| body-l, reading-\* | Body | sp |
| body-m | Callout | sp |
| body-s | Subheadline | sp |
| caption | Caption 1 | sp |
| label-s | Caption 2 | sp |

## 7. Boşluk, ızgara, köşe, yükselti ve hareket

Her ölçü 4'ün katıdır ve her ekran üç kabuktan birine oturur: telefonda alt sekme çubuğu, tablette gezinme rayı, masaüstünde kenar çubuğu.

### 7.1 Boşluk ölçeği

| Token | Değer (px/pt) | Tipik kullanım |
| --- | --- | --- |
| space-1 | 2 | İkon ile rozet arası |
| space-2 | 4 | Sıkı satır içi |
| space-3 | 8 | İkon ile metin, çipler arası |
| space-4 | 12 | Liste satırı iç dikey boşluk |
| space-5 | 16 | Telefonda kenar boşluğu ve kart içi |
| space-6 | 20 | Form alanları arası |
| space-7 | 24 | Masaüstünde kart içi; telefonda bölümler arası |
| space-8 | 32 | Masaüstünde bölümler arası |
| space-9 | 40 | Büyük bloklar arası |
| space-10 | 48 | Ekran üstü boşluğu (masaüstü) |
| space-11 | 64 | Sayfa altı ve üstü (masaüstü) |
| space-12 | 80 | Pazarlama bölümleri |
| space-13 | 96 | Pazarlama ana bölümleri |

### 7.2 Kırılma noktaları ve ızgara

| Ad | Genişlik | Sütun | Kenar | Oluk | Kabuk |
| --- | --- | --- | --- | --- | --- |
| xs | 0–599 | 4 | 16 | 12 | Telefon: üst çubuk ve alt sekme |
| sm | 600–899 | 8 | 24 | 16 | Büyük telefon, küçük tablet: alt sekme, iki sütunlu kartlar |
| md | 900–1199 | 8 | 32 | 24 | Tablet ve küçük dizüstü: 72 px gezinme rayı |
| lg | 1200–1439 | 12 | 32 | 24 | Masaüstü: 248 px kenar çubuğu |
| xl | 1440 ve üzeri | 12 | 40 | 24 | Geniş masaüstü: içerik en çok 1200 px, ortada |

- **Okuma sütunu:** en çok 680 px.
- **Soru ve öğretmen:** içerik 760 px, sağda 380 px öğretmen paneli.
- **Pazarlama sitesi:** en çok 1280 px. **Kurum paneli:** akışkan, en çok 1440 px.

### 7.3 Uygulama kabukları

- **Telefon:** üst çubuk 56 pt + güvenli alan; içerik; alt sekme çubuğu 56 pt + güvenli alan, beş sekme, ikon ve etiket birlikte.
- **Tablet:** solda 72 pt gezinme rayı (ikon ve etiket); okuma ekranları iki bölmeli.
- **Masaüstü:** solda 248 px kenar çubuğu (72 px'e daraltılabilir), 64 px üst çubuk (arama, bildirim, profil), içerik; soru ve deneme ekranlarında sağda açılır kapanır öğretmen paneli.
- **Odak modu:** soru çözme, deneme ve kelime oturumlarında gezinme gizlenir; yalnızca "çık", ilerleme ve zaman kalır.

&#91;embedded content: uygulama kabukları · telefon, tablet, masaüstü\]

Gezinme telefonda alta, tablette sola ray olarak, masaüstünde kenar çubuğuna taşınır; içerik ve bileşenler aynı kalır.

### 7.4 Dokunma hedefleri

- En az 44 × 44 pt (iOS), 48 × 48 dp (Android), web'de 44 px. Seçenek satırları en az 56 pt yüksekliğinde.
- İki hedef arasında en az 8 pt.
- Birincil eylem (Devam et, Gönder, Kontrol et) telefonda alt kenara yapışık, başparmak bölgesinde.

### 7.5 Köşe yarıçapı

| Token | Değer | Kullanım |
| --- | --- | --- |
| radius-0 | 0 | Tablolar, tam genişlik bantlar |
| radius-xs | 4 | Onay kutusu, etiket, grafik çubuk ucu |
| radius-sm | 8 | Küçük düğme, tooltip |
| radius-md | 12 | Düğme, giriş alanı, seçenek satırı |
| radius-lg | 16 | Kart, soru kutusu, liste grubu |
| radius-xl | 24 | Alt sayfa (sheet), modal, büyük kart |
| radius-full | 999 | Çip, rozet, avatar, seçenek baloncuğu |

### 7.6 Yükselti

| Seviye | Açık tema | Koyu tema | Kullanım |
| --- | --- | --- | --- |
| e0 | Gölge yok, border.default | Gölge yok, border.default | Varsayılan kart |
| e1 | 0 1 2 Mürekkep %6 ve 0 2 8 %4 | Yüzey #142127, kenar #24343A | Vurgulu kart, sabit alt çubuk |
| e2 | 0 4 16 %10 | Yüzey #1B2B32, kenar #33474E | Menü, popover, tooltip |
| e3 | 0 12 32 %14 | #1B2B32 ve bg.scrim | Modal, alt sayfa |
| e4 | 0 8 24 %18 | bg.inverse | Toast |

Koyu temada gölge görünmez; yükselti daha açık yüzeyle anlatılır. Bir ekranda aynı anda en çok iki yükselti seviyesi görünür.

### 7.7 Kenarlık

1 px varsayılan; 1,5 px seçenek baloncuğu ve ikon çizgisi; 2 px seçili seçenek ve odak halkası.

### 7.8 Hareket

| Token | Süre | Eğri | Kullanım |
| --- | --- | --- | --- |
| motion-instant | 0 ms | – | Hareket azaltma açıkken |
| motion-fast | 100 ms | standart | Basma, üzerine gelme |
| motion-base | 200 ms | standart | Seçim, açma kapama, çip |
| motion-moderate | 280 ms | yavaşlayan | Kart açılması, ipucu basamağı |
| motion-slow | 400 ms | yavaşlayan | Sayfa geçişi, alt sayfa |
| motion-celebrate | 900 ms | yay (spring) | Gün tamamlandı, seri kilometre taşı |

Eğriler: standart cubic-bezier(0.2, 0, 0, 1); yavaşlayan cubic-bezier(0.05, 0.7, 0.1, 1); hızlanan cubic-bezier(0.3, 0, 0.8, 0.15).

- **Cevap geri bildirimi:** seçenek 100 ms basılır; kontrol sonrası renk 200 ms'de geçer, ikon 150 ms gecikmeyle belirir. Sallama yok.
- **İpucu merdiveni:** her basamak 280 ms'de açılır, içeriği 40 ms gecikmeyle belirir.
- **Öğretmen mesajı:** "yazıyor" göstergesi en çok 1,5 sn; metin akış halinde gelir. Kullanıcı yukarı kaydırdıysa ekran zorla aşağı inmez; "yeni mesaj" çipi çıkar.
- **Sayfa geçişleri:** telefonda platformun varsayılanı; masaüstünde 200 ms solma.
- **Kutlama:** tek ve kısa: baloncuklar sırayla dolar, sayı yükselir. Konfeti yok. Lottie dosyası, en çok 150 KB.
- **Yükleme:** önce iskelet (skeleton); 400 ms'yi aşan beklemelerde beş baloncuğun sırayla dolması.
- **Hareket azaltma:** tüm geçişler 0–150 ms solmaya iner; kutlama durağan görsel olur.

### 7.9 Dokunsal geri bildirim (mobil)

| An | iOS | Android |
| --- | --- | --- |
| Seçenek seçildi | Seçim (selection) | Hafif tık |
| Doğru cevap | Hafif darbe (light impact) | Onay (confirm) |
| Yanlış cevap | Yok | Yok |
| Seri kilometre taşı | Başarı bildirimi (success) | Onay |
| Süre uyarısı (son 5 dk) | Uyarı (warning) | Tek darbe |
| Kart çevirme | Yumuşak darbe | Hafif tık |

Yanlışa titreşim verilmez; cezalandırıcı hissettirir. Ayarlardan kapatılabilir.

### 7.10 Ses

Varsayılan kapalı. Açılırsa doğru cevapta kısa ve yumuşak bir tık, kutlamada iki notalık kısa bir ses. Yanlışa ses yok. Kelime kartlarında İngilizce telaffuz ayrı bir ayardır (P1).

## 8. Bileşen kütüphanesi

Bileşenler iki gruptur: her üründe olan temel bileşenler ve bu ürüne özgü öğrenme bileşenleri. Her biri Figma'da açık ve koyu temada, tüm durumlarıyla varyant olarak kurulur; ekranlar yalnızca bu bileşenlerden oluşur.

### 8.1 Ortak durumlar

| Durum | Görünüm | Not |
| --- | --- | --- |
| Varsayılan | Token renkleri | – |
| Üzerine gelme | bg.hover katmanı | Yalnızca fare ve kalemle |
| Basılı | bg.pressed; telefonda %98 ölçek | 100 ms |
| Odak | 2 px border.focus halka + 2 px boşluk | Klavyeyle her zaman görünür |
| Seçili | bg.selected, accent kenar ya da ikon | Renk + biçim birlikte |
| Pasif | text.disabled, bg.canvas dolgu | Opaklık kullanılmaz; koyu temada okunmaz olur |
| Yükleniyor | Etiket yerinde dönen gösterge; genişlik sabit | Çift tıklama engellenir |
| Hata | danger.fg metin, danger.border kenar, ikon | Hata metni alanın hemen altında |

### 8.2 Temel bileşenler

| Bileşen | Varyantlar | Boyutlar | Kurallar |
| --- | --- | --- | --- |
| Düğme | Birincil (petrol dolu), ikincil (çerçeveli), üçüncül (metin), yıkıcı (tuğla) | Yükseklik 52 / 44 / 36 | Etiket fiille başlar; ekran başına tek birincil; telefonda birincil tam genişlik |
| İkon düğmesi | Standart, tonal, çerçeveli | 44 / 36 / 32 | Her biri için erişilebilir ad |
| Bağlantı | Satır içi, bağımsız | – | Satır içinde altı çizili |
| Metin alanı | Tek satır, çok satır (çeviri), şifre, arama | 48 mobil, 44 masaüstü | Etiket üstte ve hep görünür; yer tutucu etiket değildir; yardımcı ve hata metni altta; çeviride karakter sayacı |
| Seçim listesi | Telefonda yerel seçici, web'de özel liste | 48 / 44 | Aranabilir liste 8 öğenin üzerinde |
| Sınav tarihi seçici | ÖSYM oturum listesi + "başka tarih" | – | Önce resmi oturumlar, sonra serbest tarih |
| Saat seçici | Hatırlatma saati | – | Platformun yerel seçicisi |
| Onay kutusu, radyo, anahtar | – | Kutu 20, hedef 44 | Anahtar yalnızca anında etkili ayarlar için |
| Kaydırıcı | Günlük süre 10–120 dk, 5 dk adım | – | Değer etiketi üstte |
| Segment kontrol | 2–4 seçenek | 36 | Haftalık / Aylık gibi |
| Çip | Filtre, seçim, silinebilir, durum | 32 / 28 | Seçili çipte ✓ ikonu |
| Rozet ve sayaç | Sayı, nokta | 16 / 8 | 99'un üzeri "99+" |
| Etiket | Soru tipi, zorluk, hata türü, "Pilot", "Premium" | 24 | Renk + metin |
| Avatar | Baş harf, fotoğraf, kurum logosu | 24 / 32 / 40 / 64 | Fotoğraf yoksa baş harf, nötr zemin |
| Kart | Standart, tıklanabilir, vurgulu, kilitli | – | Tıklanabilir kartta tüm kart hedeftir |
| Liste satırı | Tek ve iki satır; başta ikon/avatar; sonda değer, ok ya da anahtar | 56 / 72 | – |
| Tablo (web) | Yoğun, rahat; sıralama, seçim, sabit başlık, sayfalama | Satır 40 / 48 | Telefonda kart listesine dönüşür |
| Sekmeler | Alt çizgili, segment | 44 | Yatay kaydırma 4 sekmenin üzerinde |
| Üst çubuk | Büyük başlıklı, standart, odak modu | 56 / 64 | Odak modunda yalnızca kapat, ilerleme, zaman |
| Alt sekme çubuğu | 5 sekme | 56 + güvenli alan | Etiket hep görünür; seçili sekme petrol ikon ve etiket |
| Kenar çubuğu ve ray | Geniş, dar | 248 / 72 | Dar halde etiket tooltip'te |
| Adım göstergesi | Noktalar, "2 / 5" | – | Karşılama ve seviye tespiti |
| İlerleme çubuğu | Belirli, belirsiz, bölümlü (7/10) | 4 / 8 | – |
| İlerleme halkası | Günlük hedef, ustalık | 24 / 48 / 96 | Ortada sayı |
| Modal | Bilgi, onay, yıkıcı onay | En çok 560 px | Telefonda alt sayfaya dönüşür |
| Alt sayfa | Yarım, tam, sürüklenebilir | – | Kapatma tutamaç ve kapat düğmesiyle |
| Popover, tooltip | – | – | Tooltip yalnızca işaretçili cihazda; telefonda bilgi ikonu |
| Toast | Bilgi, başarı, geri al | – | 4 sn; eylemli olan 6 sn; ekran okuyucuya duyurulur |
| Banner | Bilgi, uyarı, hata, başarı | – | Kapatılabilir; sayfa başında ya da ilgili blokta |
| Boş durum | İllüstrasyon, başlık, açıklama, eylem | – | Ne olacak ve nasıl başlanır |
| Hata durumu | Ağ, sunucu, izin, bulunamadı | – | Ne oldu, ne yapılır, tekrar dene |
| İskelet | Liste, kart, soru | – | Hareket azaltmada durağan |
| Arama | Liste içi (P0), genel (P1) | 44 | Son aramalar, boş sonuç durumu |
| Komut paleti | ⌘K / Ctrl+K | – | Masaüstü, P2 |
| Tanıtım ipuçları | Tek seferlik balonlar | – | En çok 3, atlanabilir |
| Bildirim satırı | Okundu, okunmadı | 72 | – |
| Ayar satırı | Anahtar, değer, ok | 56 | – |
| Grafikler | Çizgi, çubuk, yığılmış çubuk, ısı haritası, kıvılcım, puan bandı | – | Bölüm 18 |

### 8.3 Öğrenmeye özgü bileşenler

Bunlar ürünün karakterini taşır; en çok özeni bunlar ister.

#### Soru kartı

- **Anatomi:** üst bilgi (soru tipi etiketi, "7/10", süre, işaretle düğmesi, menü: hata bildir, kaydet), kök (reading-m), varsa bağlam (cloze paragrafı ya da okuma metni), A–E seçenekleri, alt eylem çubuğu (İpucu, Kontrol et ya da Sonraki).
- **Modlar:** öğrenme (her sorudan sonra kontrol), hızlı (sonda toplu kontrol), deneme (kontrol yok; işaretle ve soru gezgini var), inceleme (çözüm açık).
- **Durumlar:** cevapsız, seçildi, doğru, yanlış, boş geçildi, süre doldu, işaretli.

#### Seçenek satırı (cevap baloncuğu)

- **Anatomi:** 24 pt baloncuk (içinde harf), metin (reading-s), sağ uçta durum etiketi. Satır en az 56 pt; tüm satır dokunma hedefi.
- **Durumlar:** varsayılan; üzerine gelme; basılı; seçili (2 px petrol kenar, bg.selected, dolu baloncuk); doğru (success.bg, ✓, "Doğru"); yanlış (danger.bg, ✕, "Senin cevabın"); elendi (metin üstü çizili, text.tertiary, kesikli baloncuk); pasif (inceleme modunda seçilmeyenler).
- **Etkileşim:** dokun = seç. Eleme: telefonda uzun bas, masaüstünde sağ tık ya da X tuşu. Klavye: A–E seçer, Enter kontrol eder.

#### Okuma görüntüleyici

- **Masaüstü ve tablet:** solda metin (en çok 680 px), sağda sorular; aradaki ayırıcı sürüklenebilir (P1).
- **Telefon:** metin üstte katlanır kart (ilk 3 satır görünür, "Metnin tamamı" tam ekran okur), sorular altta.
- **Özellikler:** kelimeye dokununca sözlük balonu (anlam, "kartlara ekle"); vurgulama (safran.tint zemin); yazı boyutu kısayolu; satır odak modu (P1).

#### Cloze test

Paragraf içinde numaralı boşluklar (1)–(5). Etkin boşluk vurgulu; seçenekler telefonda alt sayfada, masaüstünde sağda. Boşluğa dokunmak ilgili soruya geçer; dolu boşluk seçilen kelimeyi önizler.

#### İpucu merdiveni

- **Basamaklar:** 1 Odak ("Nereye bakmalıyım?"), 2 Kural, 3 Eleme (iki seçeneği eler), 4 Çözüm.
- **Görünüm:** öğretmen kartı içinde, accent.subtle-bg; açılan basamağın noktası dolar.
- **Kural:** ipucu kullanmak puan düşürmez ama kaydedilir; plan bu veriyi kullanır. Çözüm basamağında "Hap nota git" ve "Öğretmene sor" eylemleri.

#### Öğretmen sohbeti

- **Balonlar:** öğretmen solda (bg.surface, kenar, öğretmen sembolü); kullanıcı sağda (bg.selected); sistem notu ortada, küçük. Uzun metin okunurluğu için kullanıcı balonu petrol dolu değildir.
- **Zengin bloklar:** mini soru kartı, cümle röntgeni, 3 soruluk mini test, hap not bağlantı kartı, dil bilgisi tablosu, "hata defterine eklendi" çipi.
- **Mesaj eylemleri:** kopyala, "Daha basit anlat", "Örnek ver", hata bildir, faydalı / faydasız.
- **Giriş alanı:** çok satırlı; gönder; mod çipleri (Açıkla, Röntgen, Çeviri, Düello); ücretsiz planda kalan mesaj ("Bugün 3 mesajın kaldı").
- **Akış:** yazıyor göstergesi; akış sırasında Durdur düğmesi.
- **Güven öğeleri:** kaynak çipi ("Kaynak: Hap not · Zıtlık bağlaçları"); emin olmadığında "Bunu hocamıza sordum, 24 saat içinde döneceğiz" bandı.

#### Cümle röntgeni

Cümle Literata ile; parçalar numaralı baloncuklarla işaretli. Ana cümle parçaları kalın ve petrol alt çizgili, yan cümleler text.secondary ve noktalı alt çizgili. Altında parça ve görev tablosu, iskelet satırı ("overuse → has accelerated → emergence"), katlanır Türkçe çeviri. Parçaya dokunmak görevini vurgular; "önce ben işaretleyeyim" modu P1.

#### Çeviri koçu

Kaynak cümle, kullanıcının çevirisi için metin alanı ve Değerlendir düğmesi. Sonuç: dört ölçüt (Anlam, Zaman, Yapı, Kelime) her biri 0–3 nokta, genel not, düzeltilmiş çeviri. Farklar: silinen üstü çizili ve tuğla, eklenen altı çizili ve yeşil; renk körleri için çizgi biçimleri ve "silindi / eklendi" etiketleri de var.

#### Kelime kartı

- **Ön yüz:** İngilizce kelime (heading-1), türü, telaffuz düğmesi (P1).
- **Arka yüz:** Türkçe anlamlar, iki örnek cümle (biri sınav tarzı), eşdizimler, alan etiketi.
- **Çevirme:** dokunma ya da Boşluk tuşu; yumuşak geçiş, hareket azaltmada solma.
- **Değerlendirme:** Tekrar / Zor / İyi / Kolay; altında bir sonraki tekrar aralığı ("10 dk", "1 gün", "3 gün", "8 gün"). Klavye 1–4. Kaydırma hareketi isteğe bağlı (P1).

#### Hap not kartı

Başlık, okuma süresi ("≈ 90 sn"), Kural, Örnekler (Literata), Tuzak (uyarı ikonuyla), 3 satır içi kontrol sorusu, "Anladım" düğmesi; altta ilgili becerinin ustalığı.

#### Plan görevi

Tamamlama dairesi, tür ikonu, başlık, neden satırı ("Zayıf beceri", "Vadesi gelen tekrar"), süre. Durumlar: bekliyor, devam ediyor (içinde ilerleme), tamamlandı, atıldı. Telefonda kaydırarak "yarına at".

#### Puan bandı

0–100 ölçek, tahmin aralığı bant olarak, hedef çizgisi safran. Güven düşükse bant genişler ve "Tahmin için 30 soru daha çöz" notu çıkar. Altında "Hedef için 56 doğru".

#### Geri sayım ve seri

- **Geri sayım çipi:** "YDS/2 · 22 Kasım · 52 gün". Son 7 günde safran.tint zemin; kırmızı hiçbir zaman.
- **Seri:** alev ikonu, gün sayısı, kalan seri dondurma hakkı, haftanın 7 noktası.

#### Beceri ustalığı

0–100 çubuk, dört kademe (Başlangıç, Gelişiyor, İyi, Usta), son değişim (+6). Isı haritası hücresi olarak da kullanılır.

#### Sınav sayacı ve soru gezgini

- **Sayaç:** numeric-l. 30, 10 ve 5 dakika kala uyarı bandı (warning); son 5 dakikada sayaç warning renginde. "Sayacı gizle" seçeneği var.
- **Gezgin:** 1–80 küçük baloncuklar; cevaplandı (dolu), boş (çerçeve), işaretli (köşede safran nokta), şu anki (petrol halka); soru tiplerine göre bölüm aralıkları. Telefonda alt sayfa, masaüstünde yan panel.
- **Optik form (P1):** ÖSYM cevap kâğıdına benzer 80 satır × 5 baloncuk, siyah beyaz; "kitapçıkta işaretle, sonra kodla" alıştırması.

#### Sonuç kartı ve hata defteri satırı

- **Sonuç kartı:** puan (numeric-xl), doğru / yanlış / boş yığılmış çubuk, hedefe fark, önceki denemeye göre değişim, en büyük kazanç fırsatı.
- **Hata defteri satırı:** soru özeti, soru tipi, hata türü (Bilgi eksiği, Dikkat, Süre, Tuzak, Kelime), senin cevabın ve doğru cevap, sonraki tekrar tarihi.

#### Kilit, limit ve fiyat

- **Premium kilidi:** kart üzerinde kilit ikonu ve "Premium" etiketi; kilitli içerik bulanıklaştırılmaz, başlığı görünür.
- **Limit sayacı:** "Bugün 12/15 soru"; dolduğunda limit kartı ve paywall'a geçiş.
- **Fiyat kartı:** plan adı, fiyat, aylık karşılığı, özellikler, "Önerilen" rozeti, eylem, yenileme ve iptal metni.

#### Sınav ve alan seçici

Sınav kartları (YDS, e-YDS, YÖKDİL ve alanı: Fen, Sağlık, Sosyal). Kart üzerinde bir sonraki oturum tarihi. Yeni sınavlar aynı karta eklenir; liste uzayınca aranabilir olur.

#### Kurum ve hoca bileşenleri (P2)

Öğrenci satırı (avatar, ad, son etkinlik, tahmini puan, kıvılcım grafik, risk etiketi), sınıf kartı, ödev oluşturma adımları, madde istatistik paneli (doğru oranı, ayırt edicilik, çeldirici dağılımı), soru editörü alanları, sürüm farkı görünümü.

## 9. İçerik ve dil

Ürün sakin bir koç gibi konuşur: kısa, somut, dürüst. Öğrenciye "sen" diye hitap eder; kurum panelinde, faturada ve yasal metinlerde "siz" kullanılır. Tasarımlarda yer tutucu metin (lorem ipsum) kullanılmaz; bu bölümdeki ve Bölüm 22'deki gerçek metinler kullanılır.

### 9.1 Ses ve ton

Ses sabittir: sakin, net, sıcak, dürüst. Ton duruma göre ayarlanır.

| Durum | Ton | Örnek |
| --- | --- | --- |
| Doğru cevap | Kısa, abartısız | "Doğru. 'Although' zıtlık kurdu." |
| Yanlış cevap | Yardımsever, suçlamasız | "Bu kez olmadı. Birlikte bakalım." |
| Seri bozuldu | Anlayışlı | "Dün ara verdin, sorun değil. Bugün için 15 dakikalık kısa bir plan hazırladım." |
| Deneme sonucu | Somut, ileriye dönük | "57,5 aldın. 70 için 10 doğru daha lazım; en hızlı kazanç cloze testte." |
| Sistem hatası | Sade, çözüm odaklı | "Bağlantı koptu. Cevapların kaydedildi; bağlantı gelince devam eder." |
| Paywall | Dürüst, baskısız | "Bugünkü 15 soruyu bitirdin. Premium ile sınırsız devam edebilirsin." |
| Bildirim | Kısa, davetkâr | "Bugünkü planın hazır: 25 dakika." |
| Kutlama | Ölçülü | "Bugünkü planı bitirdin. 13 günlük seri." |

### 9.2 Hitap ve kimlik

- **Sen:** öğrenci uygulaması, öğrenciye giden e-posta ve bildirimler.
- **Siz:** kurum paneli, hoca stüdyosu, fatura, sözleşme ve KVKK metinleri.
- **Öğretmen** kendinden "ben" diye söz eder ama insan taklidi yapmaz. İlk sohbette ve Hakkında sayfasında bir yapay zekâ öğretmeni olduğu açıkça yazar.

### 9.3 Terimler

"Öğretmen" her zaman yapay zekâdır; insan eğitmenlere "hoca" denir. Bu ayrım ekranlarda hiç bozulmaz.

| Kullan | Kullanma | Not |
| --- | --- | --- |
| Öğretmen | Bot, asistan, AI, koç | Yapay zekâ |
| Hoca | Eğitmen, öğretmen | İnsan eğitmen |
| Hap not | Konu anlatımı, ders notu | – |
| İpucu / Çözüm | Yardım, cevap anahtarı | – |
| Deneme | Test, simülasyon | Gerçek ÖSYM sınavına "sınav" denir |
| Soru tipi | Bölüm, kategori | 10 tip |
| Beceri | Kazanım, skill | – |
| Hata defteri | Yanlışlarım | – |
| Tekrar | Revizyon | – |
| Seri / Seri dondurma | Streak, freeze | – |
| Kamp | Grup, oda | – |
| Tahmini puan | Seviyen, puanın | Hep aralık olarak verilir |
| Doğru, yanlış, boş | Net | YDS'de yanlış doğruyu götürmez; "net" kelimesi kullanılmaz |
| İşaretle / Ele | Bayrak koy / Çiz | – |
| Plan, görev | Program | "Ödev" yalnızca hoca verdiğinde |
| Premium | Pro, VIP | – |
| Sınav dönemi paketi | Kamp paketi | – |
| Kurum | Organizasyon, şirket | – |

### 9.4 Yazım kuralları

- Cümle en çok 20 kelime; ekran başına tek fikir.
- Düğme fiille başlar ve sonucu söyler: "Kontrol et", "Planı kaydet", "Denemeyi bitir". Onay diyaloglarında bile "Tamam" yerine eylem yazılır: "Hesabı sil".
- Başlıklar cümle düzeninde (yalnızca ilk harf büyük).
- Ünlem ve emoji yok; bildirimler dahil.
- Sayılar rakamla: "3 soru", "45 dakika".
- Korkutan ve suçlayan kelimeler yok: kaybettin, başarısız, son şans, tembel.
- "Garanti", "%100" gibi vaatler yok; öğretmen emin değilse söyler.
- Dil bilgisi terimleri YDS hocalarının kullandığı biçimde: İngilizce adı ve gerekirse kısa Türkçe açıklama.

### 9.5 Hata ve boş durum kalıpları

**Hata = ne oldu + ne yapılabilir + eylem.**

- Ağ: "Bağlantı yok. Cevapların cihazda saklı; bağlantı gelince gönderilecek." \[Tekrar dene\]
- Ödeme: "Kartın onaylanmadı. Bankanın SMS onayını kontrol et ya da başka kart dene."
- Form: "E-posta adresinde @ işareti eksik."
- Limit: "Bugünkü 5 öğretmen mesajını kullandın. Yarın sabah yenilenir; Premium'da günde 40 mesaj var."

**Boş durum = başlık + ne olacağını anlatan tek cümle + tek eylem.**

- Hata defteri: "Hata defterin boş" / "Yanlış yaptığın her soru buraya düşer ve tekrar zamanı gelince karşına çıkar." / \[Soru çöz\]
- Denemeler: "Henüz deneme çözmedin" / "İlk tam denemeden sonra puan tahminin netleşir." / \[Deneme başlat\]

### 9.6 Ana ekranların metinleri

| Ekran | Öğe | Metin |
| --- | --- | --- |
| Karşılama | Başlık | "YDS'ye hazırlığın tek yerde: plan, öğretmen, deneme." |
| Sınav seçimi | Soru | "Hangi sınava hazırlanıyorsun?" |
| Hedef | Soru ve yardım | "Hedef puanın kaç?" / "55 için 80 sorudan 44 doğru yeter." |
| Sınav tarihi | Soru | "Sınavın ne zaman?" |
| Müsaitlik | Soru | "Haftada hangi günler, kaçar dakika ayırabilirsin?" |
| Seviye tespiti | Giriş | "20 dakikalık kısa bir testle başlayalım. Süre baskısı yok; bilmediğin soruyu geçebilirsin." |
| Seviye sonucu | Özet | "Tahmini puanın 48–56. Hedefin 55; sınava 52 gün var ve planın hazır." |
| Bugün, gün bitti | Bilgi | "Bugünlük bu kadar. Yarın 25 dakikalık plan seni bekliyor." |
| Deneme bitirme | Onay | "Denemeyi bitirmek istiyor musun? 3 soru boş. YDS'de yanlış doğruyu götürmez; boşları işaretlemek için süren var." \[Boşlara dön\] \[Denemeyi bitir\] |
| Bildirim izni | Ön açıklama | "Hatırlatmayı seçtiğin saatte gönderelim mi? Günde en çok bir bildirim." \[İzin ver\] \[Şimdi değil\] |
| Hesap silme | Uyarı | "Hesabını silersen ilerlemen, hata defterin ve kartların kalıcı olarak silinir. Mağazadan aldığın abonelik varsa önce orada iptal etmelisin." |

### 9.7 Yerelleştirmeye hazırlık

- Metinler koddan ayrı tutulur; çoğul ve değişkenler ICU MessageFormat ile.
- İngilizce arayüz için %30 uzama payı. Sağdan sola arayüz planlanmadı.
- Tarih, sayı ve para biçimleri cihazın yerel ayarından gelir.

## 10. Bilgi mimarisi ve gezinme

Öğrenci uygulaması beş ana bölümdür: Bugün, Çalış, Deneme, Öğretmen, Ben. Kurum paneli, hoca stüdyosu ve içerik editörü ayrı alanlardır; aynı hesapla rol değiştirilerek açılır.

&#91;embedded content: uygulama haritası · 5 sekme, 37 ekran grubu\]

Her sekme tek bir soruya cevap verir: bugün ne yapmalıyım, neye çalışayım, sınava hazır mıyım, neyi anlamadım, nerede duruyorum.

### 10.1 Ana bölümler

| Sekme | Ne için | İçindekiler | Rozet |
| --- | --- | --- | --- |
| Bugün | Günün planı | Plan, geri sayım, tahmini puan, seri, haftalık rapor, bildirimler | Plan bitmediyse nokta |
| Çalış | Kendi seçtiğin çalışma | Soru tipleri ve konular, hap notlar, alıştırma, kelimeler, hata defteri, kaydedilenler, okuma koçu | Vadesi gelen kart sayısı |
| Deneme | Sınav provası | Tam deneme, mini deneme, soru tipi denemesi, geçmiş, analiz | – |
| Öğretmen | Sohbet | Sohbetler ve hızlı modlar: Açıkla, Röntgen, Çeviri, Düello | – |
| Ben | İlerleme ve hesap | Profil, beceri haritası, hedef ve sınav, kamp ve arkadaşlar, abonelik, ayarlar | – |

### 10.2 Platforma göre gezinme

| Öğe | Telefon | Tablet | Masaüstü web |
| --- | --- | --- | --- |
| Ana gezinme | Alt sekme çubuğu | Sol gezinme rayı | Sol kenar çubuğu |
| Bildirimler | Bugün başlığında zil | Üst çubuk | Üst çubuk |
| Arama (P1) | Çalış ekranında | Üst çubuk | Üst çubuk ve ⌘K |
| Öğretmen | Sekme; soru ekranında alt sayfa | Sekme; yan panel | Kenar çubuğu; sağ panel |
| Sınav değiştirici | Bugün başlığında kısayol | Rayın üstü | Kenar çubuğunun üstü |
| Rol değiştirici | Ben › Hesap | Rayın altı | Profil menüsü |
| Geri | Platform hareketi | Üst çubuk | Tarayıcı geri; derin sayfalarda konum yolu |

### 10.3 Sınav ve rol bağlamı

- **Etkin sınav:** kullanıcının bir etkin sınavı vardır (YDS, e-YDS, YÖKDİL Sağlık gibi). Bugün, Çalış ve Deneme buna göre dolar. Değişince plan da değişir; ilerleme sınav başına tutulur, ortak beceriler paylaşılır.
- **Roller:** Öğrenci, Hoca, Kurum yöneticisi, Editör. Her rolün kendi kabuğu vardır. Birden çok kuruma üye olunabilir.
- **Kurum lisanslı öğrenci:** kurum logosu Ben ekranında ve kenar çubuğunun altında görünür; içerik ve renkler değişmez, yalnız aksan (Bölüm 16).

### 10.4 Derin bağlantılar

Bildirim, e-posta, kitap karekodu ve paylaşım bu bağlantılarla doğrudan ekrana açılır. Uygulama yüklü değilse aynı ekran web'de açılır; giriş gerekiyorsa girişten sonra hedef ekrana dönülür.

| Bağlantı | Açılan ekran | Kaynak |
| --- | --- | --- |
| /bugun | HOME-01 | Bildirim, e-posta |
| /calis/tip/{tip} | STUDY-02 | E-posta, blog |
| /not/{id} | STUDY-04 | Öğretmen, blog, kitap |
| /soru/{id} | STUDY-07 | Paylaşım |
| /kitap/{kitap}/{soru} | BOOK-03, ardından öğretmen | Basılı kitap karekodu |
| /deneme/{id} ve /deneme/{id}/sonuc | EXAM-02, EXAM-10 | Bildirim, e-posta |
| /kelimeler/tekrar | STUDY-14 | Bildirim |
| /ogretmen/{sohbet} | TUTOR-02 | Bildirim |
| /premium | PAY-01 | E-posta, pazarlama |
| /davet/{kod} | ONB-07 | Kurum daveti |
| /kamp/{kod} | ME-06 | Arkadaş daveti |
| /seviye-tespiti | DIAG-01, girişsiz başlar | Pazarlama sitesi |

### 10.5 Pazarlama sitesi haritası

Ana sayfa · Fiyatlar · YDS · e-YDS · YÖKDİL · Ücretsiz araçlar (puan hesaplama, kaç doğru lazım, sınav takvimi ve geri sayım, seviye tespiti) · Blog · Kurumlar için · Hocalar için · Kitaplar (P2) · Yardım merkezi · Hakkımızda · İletişim · Yasal: KVKK aydınlatma metni, gizlilik, kullanım koşulları, çerez politikası, mesafeli satış sözleşmesi, ön bilgilendirme formu, iptal ve iade.

### 10.6 Panel haritaları

- **Kurum paneli:** Genel bakış · Sınıflar · Öğrenciler · Ödevler · Raporlar · Lisanslar · Ayarlar · Fatura.
- **Hoca stüdyosu:** Panel · Sınıflarım · İçeriklerim · Satış sayfam · Gelir · Profil.
- **İçerik editörü:** İçerikler · Yeni içerik · Yapay zekâ taslakları · İnceleme kuyruğu · Hata bildirimleri · Madde istatistikleri · Deneme oluşturucu · Sınav paketleri · Kullanıcı desteği (P1).

## 11. Kullanıcı akışları

On altı akışın her biri ekran kimlikleriyle (Bölüm 12) yazıldı. P0 akışları tıklanabilir prototip olarak teslim edilir. En kritik olanı ilk akıştır: yeni kullanıcı 3 dakikadan kısa sürede ilk sorusuna ulaşmalı.

### 11.1 İlk açılış ve aktivasyon (P0)

1. AUTH-01 Karşılama: üç tanıtım kartı; "Başla" ve "Giriş yap".
2. ONB-01 Sınav → ONB-02 Hedef puan ve nedeni → ONB-03 Sınav tarihi → ONB-04 Haftalık müsaitlik ve hatırlatma saati. Kayıt henüz istenmez.
3. ONB-05 Seviye tespitine giriş: "Başla" ya da "Sonra yap". Sonraya kalırsa plan genel bir seviyeden başlar ve Bugün'de seviye tespiti kartı durur.
4. DIAG-01 Uyarlanabilir test (≈ 20 dk, 25–30 soru). Yarıda bırakılabilir, kaldığı yerden sürer.
5. DIAG-03 Sonuç: tahmini puan aralığı, beceri profili, hedef için gereken doğru.
6. AUTH-02 Kayıt: "Sonucunu ve planını kaydetmek için hesap oluştur" (Apple, Google, e-posta) → AUTH-06 KVKK onayları.
7. DIAG-04 Plan önizleme ve yumuşak paywall: 7 gün ücretsiz Premium teklifi; "Ücretsiz devam et" eşit görünürlükte.
8. ONB-06 (mobil) Bildirim izni ön açıklaması → sistem izni.
9. HOME-01 Bugün: ilk görev vurgulu, "Devam et".

### 11.2 Günlük çalışma (P0)

1. Seçilen saatte bildirim → HOME-01.
2. "Devam et" sıradaki görevi açar: hap not, alıştırma, kelime, çeviri ya da hata defteri.
3. Görev bitince "Sıradaki görev" ile odak modunda zincirlenir ya da Bugün'e dönülür.
4. Son görev → HOME-02 Gün tamamlandı: kısa kutlama, seri, yarının önizlemesi.
5. Gün kaçırılırsa ertesi gün HOME-01'de "Planı yeniden dağıttım" bandı çıkar; seri dondurma hakkı varsa otomatik kullanılır ve bu söylenir.

### 11.3 Soru çözme ve yanlıştan öğrenme (P0)

&#91;embedded content: soru döngüsü · 7 adım, 1 karar, 2 dönüş\]

Doğru cevap kısa bir nedenle sonraki soruya geçer. Yanlış cevap önce ipucu merdivenine ve bir hakka, sonra çözüme gider; her yanlış hata defterine düşer ve planlayıcı tekrarını zamanlar. Ekranlar: STUDY-07–11, STUDY-17–18.

### 11.4 Hap not (P0)

1. STUDY-01 Çalış → STUDY-03 Beceri → STUDY-04 Hap not.
2. STUDY-05 Üç kontrol sorusu, notun içinde.
3. Sonuç ustalığı günceller → "Alıştırmaya geç" ya da geri dön.

### 11.5 Kelime tekrarı (P0)

1. Bugün kartı ya da bildirim: "32 kartın tekrar zamanı geldi" → STUDY-14.
2. Kartı çevir → Tekrar, Zor, İyi ya da Kolay.
3. Oturum özeti: yeni, tekrar edilen, öğrenilen kart sayısı; isteğe bağlı "10 yeni kelime ekle".

### 11.6 Öğretmenle sohbet (P0)

1. TUTOR-01 → yeni sohbet ya da hızlı mod (Açıkla, Röntgen, Çeviri, Düello) → TUTOR-02.
2. Soru ekranından "Öğretmene sor": telefonda alt sayfa, masaüstünde sağ panel (TUTOR-06); soru bağlamı otomatik eklenir.
3. Ücretsiz planda mesaj biterse TUTOR-05: kalan süre ve Premium teklifi.

### 11.7 Deneme sınavı (P0)

1. EXAM-01 → EXAM-02 Kurallar ve mod: Standart, e-YDS modu (masaüstü, P1) ya da Rahat mod.
2. EXAM-03 Sınav: soru gezgini (EXAM-05), süre uyarıları (EXAM-08). Standart modda süre durmaz; uygulamadan çıkılırsa dönüşte "Kaldığın yerden devam". Rahat mod duraklatılabilir (EXAM-07).
3. EXAM-09 Bitir onayı: boş soru varsa uyarır.
4. EXAM-10 Sonuç → EXAM-11 Analiz → EXAM-12 Soru soru inceleme.
5. Plan güncellenir; Bugün'de "Denemene göre plan güncellendi" bandı.

### 11.8 Satın alma (web P0, mobil P1)

1. **Web:** PAY-01 ya da PAY-02 → PAY-03 Plan seçimi → PAY-04 Ödeme (kart, taksit, kupon; ön bilgilendirme formu ve mesafeli satış sözleşmesi onayı) → bankanın 3D Secure sayfası → PAY-06 Başarılı ya da PAY-07 Hata.
2. **Mobil:** PAY-05 Mağaza satın alma sayfası → PAY-06. "Satın alımları geri yükle" PAY-05'te görünür.
3. Cayma hakkı ve dijital içerik metinleri hukukçuyla netleşir; tasarımda yer ayrılır.

### 11.9 Limit doldu (P0)

Limit dolunca PAY-02 bağlamsal paywall açılır. Önce kazanılanı gösterir ("Bugün 15 soru, 11 doğru"), sonra teklifi. "Yarın devam et" seçeneği eşit görünürlüktedir.

### 11.10 Abonelik iptali (P0)

1. ME-07 → "Aboneliği iptal et".
2. PAY-09: neden (tek seçim ve isteğe bağlı not) → alternatif teklif (sınav tarihine kadar dondur, indirimli yıllık) → onay.
3. "Premium dönem sonuna kadar sürer" bilgisi ve tarih.
4. Mağazadan alınan abonelikte mağazanın abonelik sayfasına yönlendirilir.

### 11.11 Sınav sonrası (P1)

1. ÖSYM sonuç günü bildirim → EXAM-14 "Puanını gir".
2. Hedefe ulaştıysa kutlama ve "Sırada ne var?": YÖKDİL, daha yüksek hedef ya da aboneliği dondur.
3. Ulaşmadıysa yeni sınav tarihi ve yeni plan; suçlayıcı dil yok.

### 11.12 Kuruma katılma (davet P1, kurum P2)

1. Davet bağlantısı ya da kodu → giriş veya kayıt.
2. ONB-07: "X Üniversitesi seni lisansına ekliyor; hocan ilerlemeni görebilecek." Paylaşılan veriler listelenir ve onay alınır.
3. Premium, kurum lisansıyla açılır.

### 11.13 Hoca sınıfı (P2)

TCH-01 → sınıf oluştur (ad, sınav, hedef tarih) → davet bağlantısı, kod ya da karekod → öğrenciler katılır → ödev oluştur → sınıf ve öğrenci ekranlarında takip.

### 11.14 Hesap silme ve veri indirme (P0)

1. ME-09 Gizlilik ve veri → "Verilerimi indir" (hazır olunca e-postayla bağlantı) ya da "Hesabımı sil".
2. ME-10: yeniden kimlik doğrulama, ne silineceğinin listesi, onay.
3. "Hesabın 30 gün içinde kalıcı olarak silinir; bu sürede giriş yaparsan işlem iptal olur."

### 11.15 Kitap karekodu (P2)

Karekod → /kitap/{kitap}/{soru}. Uygulama yüklüyse BOOK-03 → soru ve "Öğretmene sor" → TUTOR-02 bağlamlı. Yüklü değilse web'de soru, öğretmenle 3 ücretsiz mesaj ve uygulamayı indir bağlantısı.

### 11.16 Fotoğrafla soru (P1)

STUDY-21 → kamera izni ön açıklaması → çek → soru alanını kırp → metin tanıma önizlemesi, düzeltilebilir → öğretmene gönder → TUTOR-02. Fotoğraf soru havuzuna eklenmez.

## 12. Ekran envanteri

Envanter 151 ekrandır: 92'si P0, 28'i P1, 22'si P2, 9'u P3. Platform sütununda M = telefon (iOS, Android, mobil web), W = masaüstü web, T = tablete özel düzen gerekir. T yazmayan ekranlar tablette M ya da W düzeninin kırılma noktasına uygun hâlini kullanır.

### Pazarlama sitesi

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| MKT-01 | Ana sayfa | W, M | P0 | Değer önerisi; seviye tespiti ve fiyatlara yönlendirme |
| MKT-02 | Fiyatlar | W, M | P0 | Planlar, karşılaştırma, SSS |
| MKT-03 | YDS rehberi | W, M | P0 | Sınav bilgisi, soru tipleri, takvim |
| MKT-04 | e-YDS rehberi | W, M | P1 | e-YDS'ye özel bilgi |
| MKT-05 | YÖKDİL rehberi | W, M | P1 | Alanlar ve hazırlık |
| MKT-06 | Ücretsiz araçlar | W, M | P0 | Puan hesaplama, kaç doğru lazım, takvim ve geri sayım |
| MKT-07 | Seviye tespiti açılışı | W, M | P0 | Girişsiz teste başlatma |
| MKT-08 | Bekleme listesi ve kurucu üyelik | W, M | P0 | Faz 0 ön satış |
| MKT-09 | Blog listesi ve yazı | W, M | P0 | İçerik pazarlaması |
| MKT-10 | Kurumlar için | W, M | P1 | Kurum teklifi ve iletişim formu |
| MKT-11 | Hocalar için | W, M | P2 | Hoca stüdyosu tanıtımı |
| MKT-12 | Kitaplar | W, M | P2 | Kitap tanıtımı, satış bağlantıları |
| MKT-13 | Yardım merkezi | W, M | P0 | SSS, arama, iletişim |
| MKT-14 | Hakkımızda ve iletişim | W, M | P1 | Ekip, yöntem, iletişim |
| MKT-15 | Yasal sayfalar ve çerez bandı | W, M | P0 | KVKK, gizlilik, koşullar, mesafeli satış, iptal ve iade, çerez tercihi |
| MKT-16 | 404 ve 500 | W, M | P0 | Kayıp sayfa, sunucu hatası |

### Kimlik ve karşılama

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| AUTH-01 | Karşılama | M | P0 | Üç tanıtım kartı; web'de MKT-01 bu işi görür |
| AUTH-02 | Kayıt | M, W | P0 | Apple, Google, e-posta |
| AUTH-03 | Giriş | M, W | P0 | – |
| AUTH-04 | Şifre sıfırlama | M, W | P0 | E-postayla bağlantı ya da kod |
| AUTH-05 | E-posta doğrulama | M, W | P0 | Kod girişi, yeniden gönder |
| AUTH-06 | KVKK onayları | M, W | P0 | Aydınlatma, açık rıza seçenekleri |
| ONB-01 | Sınav seçimi | M, W | P0 | YDS, e-YDS, YÖKDİL ve alanı |
| ONB-02 | Hedef puan ve neden | M, W | P0 | Hedef ve gereken doğru |
| ONB-03 | Sınav tarihi | M, W | P0 | ÖSYM oturumu ya da serbest tarih |
| ONB-04 | Müsaitlik ve hatırlatma | M, W | P0 | Günler, dakika, saat |
| ONB-05 | Seviye tespitine giriş | M, W | P0 | Başla ya da sonra |
| ONB-06 | Bildirim izni ön açıklaması | M | P0 | Sistem izninden önce |
| ONB-07 | Kurum daveti | M, W | P1 | Kodla katılım, veri paylaşım onayı |

### Seviye tespiti

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| DIAG-01 | Test | M, W | P0 | Uyarlanabilir sorular |
| DIAG-02 | Ara durak | M, W | P0 | Yarı yol, mola |
| DIAG-03 | Sonuç | M, W | P0 | Tahmini aralık, beceri profili |
| DIAG-04 | Plan önizleme ve yumuşak paywall | M, W | P0 | İlk haftanın planı, 7 gün ücretsiz teklifi |

### Bugün

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| HOME-01 | Bugün | M, W, T | P0 | Plan, geri sayım, tahmini puan, seri |
| HOME-02 | Gün tamamlandı | M, W | P0 | Kutlama ve yarın |
| HOME-03 | Planı düzenle | M, W | P0 | Az vaktim var, günü atla, yeniden dağıt |
| HOME-04 | Haftalık rapor | M, W | P1 | Yapay zekâ özeti ve öneriler |
| HOME-05 | Bildirim merkezi | M, W | P1 | Geçmiş bildirimler |

### Çalış

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| STUDY-01 | Çalış merkezi | M, W, T | P0 | 10 soru tipi, konular, ustalık |
| STUDY-02 | Soru tipi | M, W | P0 | Strateji notu, ustalık, alıştırma |
| STUDY-03 | Beceri ve konu | M, W | P0 | Hap notlar ve alıştırmalar |
| STUDY-04 | Hap not | M, W | P0 | Okuma |
| STUDY-05 | Hap not kontrol soruları | M, W | P0 | Not içinde üç soru |
| STUDY-06 | Alıştırma kurulumu | M, W | P0 | Tip, konu, sayı, zorluk, mod |
| STUDY-07 | Soru: tek cümle tipleri | M, W | P0 | Kelime, dil bilgisi, cümle tamamlama, çeviri, diyalog, yakın anlam |
| STUDY-08 | Soru: okuma | M, W, T | P0 | Metin ve dört soru |
| STUDY-09 | Soru: cloze test | M, W, T | P0 | Paragraf ve beş boşluk |
| STUDY-10 | Soru: paragraf tamamlama ve anlamı bozan cümle | M, W | P0 | Paragraf içinde cümle seçimi |
| STUDY-11 | Geri bildirim ve ipucu merdiveni | M, W | P0 | Doğru, yanlış, ipucu, çözüm |
| STUDY-12 | Alıştırma sonucu | M, W | P0 | Özet, hatalar, tekrar |
| STUDY-13 | Kelime merkezi | M, W | P0 | Desteler, bugünün kartları |
| STUDY-14 | Kelime oturumu | M, W | P0 | Kart ve değerlendirme |
| STUDY-15 | Kelime ayrıntısı | M, W | P0 | Anlam, örnekler, eşdizim |
| STUDY-16 | Kelime oyunları | M, W | P1 | Bağlamda seç, yaz, düello |
| STUDY-17 | Hata defteri | M, W | P0 | Liste ve filtreler |
| STUDY-18 | Hata tekrarı | M, W | P0 | Zamanı gelen hatalar |
| STUDY-19 | Çeviri koçu | M, W | P0 | Serbest çeviri ve puanlama |
| STUDY-20 | Okuma koçu kütüphanesi | M, W, T | P1 | Alan metinleri |
| STUDY-21 | Fotoğrafla soru | M | P1 | Kamera, kırpma, öğretmen |
| STUDY-22 | Kaydedilenler | M, W | P1 | Soru, not, kelime |

### Öğretmen

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| TUTOR-01 | Öğretmen ana ekranı | M, W | P0 | Sohbetler ve hızlı modlar |
| TUTOR-02 | Sohbet | M, W, T | P0 | Mesajlar ve zengin bloklar |
| TUTOR-03 | Cümle röntgeni | M, W | P1 | Cümle gir, çözümle |
| TUTOR-04 | Kelime düellosu | M, W | P1 | İki dakikalık test |
| TUTOR-05 | Mesaj limiti doldu | M, W | P0 | Yenilenme saati, Premium |
| TUTOR-06 | Soru içi öğretmen | M alt sayfa, W sağ panel | P0 | Soruya bağlı sohbet |
| TUTOR-07 | Yanıtı bildir | M, W | P0 | Hata türü ve açıklama |

### Deneme

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| EXAM-01 | Deneme merkezi | M, W | P0 | Denemeler ve geçmiş |
| EXAM-02 | Başlangıç ve kurallar | M, W | P0 | Mod seçimi |
| EXAM-03 | Sınav ekranı | M, W, T | P0 | 80 soru ve sayaç |
| EXAM-04 | e-YDS modu | W | P1 | Bilgisayarlı sınav provası |
| EXAM-05 | Soru gezgini | M, W | P0 | 1–80 durumları |
| EXAM-06 | Optik form | M, W | P1 | Kodlama alıştırması |
| EXAM-07 | Duraklatma (rahat mod) | M, W | P0 | – |
| EXAM-08 | Süre uyarıları | M, W | P0 | 30, 10 ve 5 dakika |
| EXAM-09 | Bitirme onayı | M, W | P0 | Boş soru uyarısı |
| EXAM-10 | Sonuç özeti | M, W | P0 | Puan ve hedefe fark |
| EXAM-11 | Ayrıntılı analiz | M, W, T | P0 | Soru tipi, süre, hata türü |
| EXAM-12 | Soru soru inceleme | M, W | P0 | Çözüm ve öğretmen |
| EXAM-13 | Deneme geçmişi ve eğilim | M, W | P1 | Puan eğilimi |
| EXAM-14 | Gerçek sınav sonucu | M, W | P1 | ÖSYM puanı girişi |

### Ben

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| ME-01 | Profil ve ilerleme | M, W | P0 | Özet, eğilim, seri |
| ME-02 | Beceri haritası | M, W, T | P1 | Isı haritası |
| ME-03 | Hedef ve sınav | M, W | P0 | Hedef, tarih, sınav değiştir |
| ME-04 | Kilometre taşları | M, W | P1 | Gerçek başarılar |
| ME-05 | Kamp ve arkadaşlar | M, W | P1 | Davet, arkadaş serisi |
| ME-06 | Kamp ayrıntısı | M, W | P1 | Üyeler, haftalık ilerleme |
| ME-07 | Abonelik | M, W | P0 | Plan, yenileme, iptal |
| ME-08 | Ödeme yöntemleri ve faturalar | W, M web | P0 | Kartlar, faturalar |
| ME-09 | Ayarlar | M, W | P0 | Hesap, bildirim, görünüm, çalışma, gizlilik, yardım |
| ME-10 | Hesap silme | M, W | P0 | Onay ve 30 günlük süre |
| ME-11 | Arkadaşını davet et | M, W | P2 | Davet ödülü |

### Satın alma

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| PAY-01 | Paywall | M, W | P0 | Genel teklif |
| PAY-02 | Bağlamsal paywall | M, W | P0 | Limit doldu |
| PAY-03 | Plan karşılaştırma | M, W | P0 | Ücretsiz ve Premium |
| PAY-04 | Ödeme (web) | W, M web | P0 | Kart, taksit, kupon, sözleşmeler |
| PAY-05 | Mağaza satın alma | M | P1 | Mağaza ödeme sayfası, geri yükleme |
| PAY-06 | Hoş geldin Premium | M, W | P0 | Başarılı ödeme |
| PAY-07 | Ödeme hatası | M, W | P0 | Neden ve çözüm |
| PAY-08 | Deneme süresi bitiyor | M, W | P0 | Hatırlatma |
| PAY-09 | İptal akışı | M, W | P0 | Neden, teklif, onay |
| PAY-10 | Kurucu üyelik ön satışı | W, M web | P0 | Faz 0 |

### Sistem durumları ve kanallar

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| SYS-01 | Yükleniyor | M, W | P0 | İskeletler |
| SYS-02 | Boş durumlar | M, W | P0 | Her liste için |
| SYS-03 | Hata | M, W | P0 | Ağ, sunucu, izin |
| SYS-04 | Çevrimdışı | M | P1 | İndirilen setler |
| SYS-05 | Bakım | M, W | P0 | – |
| SYS-06 | Zorunlu güncelleme | M | P1 | Eski uygulama sürümü |
| SYS-07 | Oturum süresi doldu | M, W | P0 | Yeniden giriş |
| SYS-08 | Anlık bildirimler | M, W (PWA) | P0 | Bildirim görünümleri |
| SYS-09 | E-posta şablonları | E-posta | P0 | Bölüm 19 |
| SYS-10 | Ana ekran widget'ı | M | P2 | Bugünün planı, geri sayım |
| SYS-11 | iOS Canlı Etkinlik | M | P3 | Deneme süresi kilit ekranında |

### Kurum paneli

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| ORG-01 | Genel bakış | W, T | P2 | Etkin öğrenci, ortalama tahmin, risk |
| ORG-02 | Sınıflar | W | P2 | Liste ve oluşturma |
| ORG-03 | Sınıf ayrıntısı | W, T | P2 | Öğrenci tablosu, beceri ısı haritası |
| ORG-04 | Öğrenci ayrıntısı | W, T, M | P2 | İlerleme, denemeler, notlar |
| ORG-05 | Ödev oluştur | W | P2 | Set, tarih, hedef |
| ORG-06 | Ödev sonuçları | W, T | P2 | Tamamlama ve başarı |
| ORG-07 | Lisanslar ve davetler | W | P2 | Koltuklar, kodlar, toplu yükleme |
| ORG-08 | Raporlar ve dışa aktarma | W | P2 | CSV, PDF |
| ORG-09 | Kurum ayarları ve roller | W | P2 | Logo, aksan, izinler |
| ORG-10 | Kurum faturası | W | P2 | Fatura ve ödemeler |

### Hoca stüdyosu

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| TCH-01 | Hoca paneli | W, M | P2 | Öğrenciler, gelir, içerik performansı |
| TCH-02 | İçerik oluştur | W | P2 | Hap not, soru seti, deneme |
| TCH-03 | Satış sayfası | W, M | P2 | Herkese açık kurs sayfası |
| TCH-04 | Gelir ve ödemeler | W | P2 | Kazanç, hakediş |
| TCH-05 | Hoca profili | W, M | P2 | Vitrin |

### İçerik editörü (iç araç)

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| CMS-01 | İçerik listesi | W | P0 | Filtre: tür, durum, beceri, sınav |
| CMS-02 | Soru editörü | W | P0 | Kök, seçenekler, çeldiriciler, ipuçları, etiketler |
| CMS-03 | Hap not editörü | W | P0 | Kural, örnek, tuzak, kontrol |
| CMS-04 | Okuma metni editörü | W | P0 | Metin, dört soru, terimler |
| CMS-05 | Yapay zekâ taslak üretici | W | P0 | Parametreler ve taslaklar |
| CMS-06 | İnceleme kuyruğu | W | P0 | Onay, yorum, sürüm farkı |
| CMS-07 | Madde istatistikleri | W | P1 | Doğru oranı, ayırt edicilik, çeldiriciler |
| CMS-08 | Hata bildirimleri | W | P0 | Kullanıcı bildirimleri |
| CMS-09 | Deneme oluşturucu | W | P0 | Blueprint'e göre dağılım |
| CMS-10 | Sınav paketi ayarları | W | P1 | Blueprint, puanlama, takvim |
| CMS-11 | Kullanıcı desteği | W | P1 | Hesap ve abonelik görünümü |

### Kitap

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| BOOK-01 | Kitaplık | M, W | P2 | Sahip olunan kitaplar |
| BOOK-02 | Okuyucu | M, W, T | P2 | Okuma, içindekiler, işaret, vurgu |
| BOOK-03 | Karekod karşılama | M, W | P2 | Kitaptaki soruyu açar |
| BOOK-04 | Kitap mağazası | M, W | P3 | Kitap ayrıntısı ve satın alma |

### Gelecek modüller

| Kimlik | Ekran | Platform | Öncelik | Amaç |
| --- | --- | --- | --- | --- |
| FUT-01 | YÖKDİL alan ana ekranı ve alan sözlüğü | M, W | P1 | Alan metinleri ve terimler |
| FUT-02 | Konuşma pratiği | M | P3 | Ses kaydı ve geri bildirim |
| FUT-03 | Dinleme soruları | M, W | P3 | Ses oynatıcılı soru |
| FUT-04 | Yazma değerlendirmesi | M, W | P3 | Kompozisyon puanlama |
| FUT-05 | Sayısal sınav paketleri | M, W | P3 | KPSS, ALES; matematik gösterimi |
| FUT-06 | Canlı ders | M, W | P3 | Hocayla görüntülü oturum |
| FUT-07 | Hoca pazar yeri | M, W | P3 | Kurs keşfi ve satın alma |
| FUT-08 | Topluluk | M, W | P3 | Soru-cevap |

## 13. Ekran ayrıntıları: öğrenci uygulaması

Her ekran için amaç, düzen, içerik, durumlar ve etkileşim yazıldı. Düzen tarifleri yukarıdan aşağı sırayı verir; ölçüler ve renkler token adlarıyla anlatılır (Bölüm 5–8). Tarif edilmeyen her ekran durumu Bölüm 8.1'deki ortak durumları ve 9.5'teki kalıpları kullanır.

### 13.1 Kimlik ve karşılama

**AUTH-01 · Karşılama** (M, P0)

- **Amaç:** ilk izlenim; 10 saniyede "Başla".
- **Telefon:** üstte kelime markası; ortada yatay kaydırılan üç kart (illüstrasyon, display-m başlık, body-l tek cümle), nokta göstergesi; altta birincil "Başla", üçüncül "Hesabım var, giriş yap".
- **Kart metinleri:** "Sınavı bilen öğretmen: yanlışının nedenini bulur, cevabı hemen söylemeden düşündürür." · "Her gün sana özel plan: sınav tarihine ve vaktine göre 15–45 dakika." · "Yanlışlarından öğren: her hata deftere düşer, zamanı gelince karşına çıkar."
- **Notlar:** otomatik kaydırma yok.

**AUTH-02 · Kayıt ve AUTH-03 · Giriş** (M, W, P0)

- **Telefon:** başlık; "Apple ile devam et" (iOS'ta en üstte, Apple'ın düğme yönergesine uygun), "Google ile devam et", "ya da" ayırıcısı, e-posta alanı ve "E-postayla devam et". Altta koşullar ve aydınlatma metni bağlantıları.
- **Yöntem:** e-postaya 6 haneli kod; şifre isteğe bağlı (Ayarlar'dan eklenir).
- **Masaüstü:** iki sütun; solda 480 px form, sağda ürün görseli ve tek cümlelik güvence ("Seviye tespitinden sonra planın hazır").
- **Durumlar:** alan hataları, "Bu e-postayla hesabın var, giriş yap", sosyal giriş iptal edildi, ağ hatası.

**AUTH-04 · Şifre sıfırlama** (M, W, P0): yalnızca şifre ekleyen kullanıcı için. E-posta → kod → yeni şifre (güç göstergesi metinle: "Zayıf", "Yeterli", "Güçlü").

**AUTH-05 · E-posta kodu** (M, W, P0): altı haneli tek alan (yapıştırma ve otomatik doldurma desteklenir), "Kodu yeniden gönder" 60 saniyelik geri sayımla, "E-postayı değiştir".

**AUTH-06 · KVKK onayları** (M, W, P0)

- Aydınlatma metninin üç maddelik özeti ve tam metin bağlantısı.
- İsteğe bağlı onay kutuları varsayılan boş: "İpucu ve kampanya e-postaları almak istiyorum" (ticari ileti onayı, İYS'ye kaydedilir).
- "Devam et" isteğe bağlı onaylar olmadan da çalışır.

**ONB-01 · Sınav seçimi** (M, W, P0)

- Üstte dört adımlı gösterge ve geri oku; başlık "Hangi sınava hazırlanıyorsun?".
- Sınav kartları: YDS (bir sonraki oturum 22 Kasım), e-YDS (bir sonraki 17 Ekim), YÖKDİL (açılır alt seçim: Fen, Sağlık, Sosyal), "Henüz karar vermedim" (YDS ile başlar).
- P0'da YÖKDİL seçilirse YDS içeriğiyle başlar ve "Alan metinleri Mart 2027'de geliyor" notu görünür.

**ONB-02 · Hedef puan** (M, W, P0)

- Hızlı seçim çipleri: 50 (Yüksek lisans), 55 (Doktora, doçentlik), 65, 70 (Dil tazminatı C), 80 (B), 90 (A); serbest giriş.
- Canlı yardım satırı: "55 için 80 sorudan 44 doğru yeter."
- Neden (isteğe bağlı, çoklu çip): Doktora, Doçentlik, Yüksek lisans, Dil tazminatı, Araştırma görevliliği, Yurt dışı görev, Kendim için.

**ONB-03 · Sınav tarihi** (M, W, P0)

- ÖSYM oturum listesi: ad, tarih, kalan gün (örnek: "2026-YDS/2 · 22 Kasım · 52 gün"). Henüz açıklanmamış oturumlar "tahmini" etiketiyle.
- "Henüz bilmiyorum" seçilirse 12 haftalık varsayılan plan; "Başka tarih" takvim açar.

**ONB-04 · Müsaitlik** (M, W, P0)

- Gün çipleri (Pzt–Paz), günlük süre kaydırıcısı (10–120 dk), "Günlere göre farklı" gelişmiş seçeneği, hatırlatma saati.
- Alt özet: "Haftada 5 gün, günde 30 dakika: sınava kadar yaklaşık 18 saat."

**ONB-05 · Seviye tespitine giriş** (M, W, P0): başlık, üç madde (yaklaşık 20 dakika; süre baskısı yok; bilmediğini geçebilirsin), "Başla" ve "Sonra yap".

**ONB-06 · Bildirim izni** (M, P0): kilit ekranı bildirim önizlemesi ("Bugünkü planın hazır: 25 dakika"), açıklama, "İzin ver" ve "Şimdi değil". Sistem penceresi yalnızca "İzin ver"den sonra açılır.

**ONB-07 · Kurum daveti** (M, W, P1): kod alanı ya da bağlantıdan gelen kurum kartı (logo, ad); "Hocan şunları görebilir: çalışma süresi, tahmini puan, deneme sonuçları, ödevler. Sohbetlerin görünmez."; "Katıl" ve "Vazgeç".

### 13.2 Seviye tespiti

**DIAG-01 · Test** (M, W, P0)

- **Amaç:** yaklaşık 20 dakikada tahmini puan ve beceri profili.
- **Telefon:** odak modu üst çubuğu (Kapat, yüzde olarak ilerleme; süre gösterilmez); soru kartı (ipucu yok); altta üçüncül "Bilmiyorum, geç" ve birincil "Cevapla" (seçim yapılınca etkin). Doğru ya da yanlış gösterilmez.
- **Masaüstü:** ortada 760 px soru; okuma sorularında iki sütun.
- **Uyarlanabilirlik:** soru sayısı cevaplara göre değişir; ilerleme bu yüzden sayıyla değil yüzdeyle gösterilir.
- **Durumlar:** çıkış onayı ("İlerlemen kaydedildi; kaldığın yerden devam edersin"), bağlantı kopması (cevap cihazda tutulur).

**DIAG-02 · Ara durak** (M, W, P0): yarıda bir kez: "Yarıyı geçtin. Kısa bir mola ister misin?" \[Devam et\] \[Sonra devam ederim\].

**DIAG-03 · Sonuç** (M, W, P0)

- **Üst:** "Tahmini puanın", puan bandı (örnek 48–56), hedef çizgisi (55), "Hedef için 44 doğru; şu an tahminen 38–45".
- **Beceri profili:** 10 soru tipi için yatay çubuklar; en güçlü iki ve en zayıf iki tip vurgulu, diğerleri sessiz.
- **Plan kartı:** sınava kalan gün, haftalık süre, ilk haftanın üç odak noktası.
- **Eylem:** "Planımı kaydet"; hesap yoksa AUTH-02'ye gider.
- **Güven notu:** "Tahmin 28 soruya dayanıyor; denemelerle netleşir."

**DIAG-04 · Plan önizleme ve yumuşak paywall** (M, W, P0)

- İlk 7 günün kartları: tarih, süre, 2–3 görev ikonu.
- Teklif kartı: "7 gün ücretsiz Premium", sonrası 349 TL/ay ya da sınav dönemi paketi, "İstediğin zaman iptal".
- İki eşit boyutlu düğme: "7 günü ücretsiz başlat" ve "Ücretsiz devam et". Ücretsiz kullanıcının da plan alacağı açıkça yazılır; karanlık desen kullanılmaz.

### 13.3 Bugün

**HOME-01 · Bugün** (M, W, T, P0)

- **Amaç:** "Bugün ne yapmalıyım?" sorusuna tek ekranda cevap; tek dokunuşla devam.
- **Telefon, yukarıdan aşağı:**
  1. Tarih (caption), "Bugünün planı" (heading-1); sağda seri rozeti ve bildirim zili; başlık altında sınav çipi ("YDS · 22 Kasım").
  2. Geri sayım ve puan kartı: "2026-YDS/2 · 22 Kasım · 52 gün", puan bandı ve hedef, "Hedef için 56 doğru".
  3. Koşullu bant: "Planı yeniden dağıttım", "Denemene göre plan güncellendi" ya da "Seviye tespitini tamamla".
  4. Görev kartı: toplam süre ("45 dk") ve 3–6 plan görevi; bitenler üstü çizili ama okunur.
  5. Sabit birincil düğme, sekme çubuğunun üstünde: "Devam et · Cloze test" (sıradaki görevin adıyla).
  6. Kaydırınca: "Bu hafta" (7 günlük nokta takvimi ve dakika), haftalık rapor kartı (P1), kamp kartı (P1).
- **Masaüstü:** iki sütun. Solda (2/3) plan ve görevler, birincil düğme listenin altında; sağda (1/3) geri sayım ve puan, bu hafta, seri, kamp.
- **Tablet:** iki sütun, sağ sütun 320 pt.
- **Durumlar:** seviye tespiti bitmemiş (plan yerine "Seviye tespitini bitir" kartı ve genel ilk görev); gün tamamlandı ("Bugünlük bu kadar" kartı, üçüncül "Ekstra çalış"); sınav günü (plan yok; "Bugün sınav günü. Başarılar." ve sınav giriş belgesi, kimlik gibi kısa kontrol listesi); sınav geçti (EXAM-14 çağrısı); çevrimdışı (bant); Premium bitti (bant ve sınırlı plan).
- **Etkileşim:** göreve dokun = aç; uzun bas ya da sağ tık = "Yarına at", "Atla"; telefonda aşağı çekince yenilenir.
- **Not:** görev altındaki neden satırı ("Zayıf beceri: cloze test %42") güven verir; her görevde olmalı.

**HOME-02 · Gün tamamlandı** (M tam ekran, W modal, P0): illüstrasyon 13, "Bugünkü planı bitirdin." (display-m), 7 günlük seri şeridi, özet (süre, çözülen soru, doğru oranı, yeni kelime), "Yarın: 25 dk · 3 görev". Birincil "Bugün'e dön", ikincil "Ekstra çalış". Seri kilometre taşlarında (7, 30, 100) özel başlık.

**HOME-03 · Planı düzenle** (M alt sayfa, W modal, P0): "Bugün az vaktim var" (10, 15, 20 dk; öncelikler korunur), "Bugünü atla" (seri dondurma kullanılacağı söylenir), "Haftalık müsaitliği değiştir", "Sınav tarihini değiştir", "Planı sıfırla". Her seçeneğin altında etkisi tek cümleyle.

**HOME-04 · Haftalık rapor** (M, W, P1): üstte haftanın özet cümlesi ("Bu hafta 3 sa 10 dk çalıştın; cloze test ustalığın %42'den %55'e çıktı"); çalışma günleri; tahmini puan değişimi; en çok gelişen ve en zayıf iki beceri; gelecek haftanın odakları; "Planı uygula". Sayılar veriden gelir, yapay zekâ yalnızca cümleyi kurar.

**HOME-05 · Bildirim merkezi** (M, W, P1): bugün, bu hafta, daha eski grupları; okunmamış noktası; her satır derin bağlantı; boş durum illüstrasyon 8.

### 13.4 Çalış merkezi ve hap notlar

**STUDY-01 · Çalış merkezi** (M, W, T, P0)

- **Telefon:** başlık "Çalış"; "Bugün vadesi gelen" çipleri (32 kelime, 5 hata); "Soru tipleri" listesi: sınavdaki sırayla 10 satır (ikon, ad, "10 soru", ustalık çubuğu, ok); "Araçlar": Kelimeler, Hata defteri, Çeviri koçu; P1'de Okuma koçu, Kaydedilenler, Fotoğrafla soru.
- **Masaüstü:** solda 2 × 5 soru tipi kartları, sağda araçlar ve vadesi gelenler. **Tablet:** iki sütunlu kart ızgarası.
- **Sıralama:** "Sınav sırası" (varsayılan) ya da "En zayıf önce".

**STUDY-02 · Soru tipi** (M, W, P0): başlık ("Cloze test · 10 soru"), ustalık kartı (yüzde, kademe, 7 günlük değişim), strateji hap notu kartı, beceriler listesi (bağlaçlar, zamanlar, edatlar; her biri ustalıkla), "Alıştırma başlat", son üç hata.

**STUDY-03 · Beceri ve konu** (M, W, P0): beceri adı ve ustalık, hap notlar (okunanlar işaretli), alıştırmalar (soru sayısı, zorluk dağılımı), ilgili kelimeler.

**STUDY-04 · Hap not** (M, W, P0)

- **Telefon:** odak modu üst çubuğu (geri, kaydet, menü); başlık ve okuma süresi; Kural (body-l), Örnekler (Literata, İngilizce), Tuzak (uyarı ikonlu, kenarlı kutu; dolgu rengi yok), kontrol soruları (STUDY-05), altta "Anladım" ve "Öğretmene sor".
- **Masaüstü:** 680 px okuma sütunu; sağda ilgili notlar ve beceri ustalığı.
- **Etkileşim:** kelimeye dokununca sözlük; seçili metin için "Öğretmene sor".

**STUDY-05 · Kontrol soruları** (M, W, P0): notun içinde kart; her soru tek cümle, iki ya da beş seçenek, anında geri bildirim. Üçte üç ustalığı artırır; üçte sıfır ya da bir, "Notu bir kez daha oku" ve öğretmen önerir.

**STUDY-06 · Alıştırma kurulumu** (M alt sayfa, W modal, P0): soru tipi (çoklu çip), konu (isteğe bağlı), soru sayısı (5, 10, 20, özel), zorluk (Bana göre, Karışık, Kolay, Orta, Zor), mod (Öğrenme: her soruda kontrol; Hızlı: sonda kontrol; Süreli: soru başına ortalama 2 dk 15 sn), "Başlat". Ücretsiz planda kalan soru hakkı satırı.

### 13.5 Soru ekranları

Soru ekranları ürünün kalbidir: telefonda tek elle, masaüstünde klavyeyle akıcı çalışmalı. Tüm soru tipleri aynı iskeleti paylaşır; fark yalnızca orta alandadır.

&#91;embedded content: soru ekranı iskeleti · telefon ve masaüstü\]

İki düzende de aynı parçalar aynı sıradadır: üst çubuk, soru tipi, kök, A–E seçenekleri, İpucu ve Kontrol et. Fark ipucu merdiveninin yeridir: telefonda alt sayfa, masaüstünde sağda kalıcı öğretmen paneli.

**STUDY-07 · Tek cümle soruları** (M, W, P0): kelime, dil bilgisi, cümle tamamlama, çeviri, diyalog, yakın anlam.

- **Telefon:** odak modu üst çubuğu (kapat, bölümlü ilerleme "4 / 10", yalnızca süreli modda süre, işaretle, menü: kaydet, hata bildir, yazı boyutu); soru tipi etiketi (overline); kök (reading-m); A–E seçenekleri; sabit alt eylem çubuğu: solda "İpucu", sağda "Kontrol et" (seçim yokken pasif, sonra "Sonraki").
- **Masaüstü:** ortada 760 px soru; sağ kenarda kapalı öğretmen paneli tutamaçı. Klavye: A–E seç, Enter kontrol, H ipucu, F işaretle, X ele, → sonraki, ? kısayollar.
- **Tip farkları:** diyalogda ÖSYM gibi "A: … / B: \_\_\_\_" satırları, konuşmacı harfleri kalın (sohbet balonu yok). Çeviride seçenekler 3–4 satır; satır uzar, baloncuk ilk satıra hizalı kalır. Yakın anlamda kök çerçeveli bir kutuda. Cümle tamamlamada kök "…" ile yarım kalır.

**STUDY-08 · Okuma** (M, W, T, P0)

- **Masaüstü ve yatay tablet:** iki bölme; solda metin, sağda soru ve seçenekler; soru numaraları üstte sekme gibi (1 2 3 4).
- **Dikey tablet:** üstte kaydırılabilir metin (yarı yükseklik), altta soru.
- **Telefon:** metin kartı üstte katlanır (ilk 3 satır ve "Metnin tamamı"); tam ekran okuma görünümü okuma ayarlarıyla; soru altta; her soruda metne dönüş düğmesi.
- **Soru kökü türü** (öğrenme modunda etiket): Ana fikir, Çıkarım, Ayrıntı, Kelime anlamı, Yazarın tutumu; strateji ipucuna bağlanır.

**STUDY-09 · Cloze test** (M, W, T, P0)

- Paragraf içinde numaralı boşluklar (1)–(5); etkin boşluk petrol çerçeveli, dolu boşluk seçilen kelimeyi bg.selected zeminde gösterir.
- **Telefon:** paragraf üstte, seçenekler sürüklenebilir yarım alt sayfada; boşluklar arasında "‹ 2/5 ›".
- **Masaüstü:** solda paragraf, sağda etkin boşluğun seçenekleri.
- Kontrol tüm boşluklar dolunca ya da öğrenme modunda her boşlukta.

**STUDY-10 · Paragraf tamamlama ve anlamı bozan cümle** (M, W, P0)

- **Paragraf tamamlama:** paragraf içinde boşluk yeri vurgulu; seçenekler uzun cümleler.
- **Anlamı bozan cümle:** paragrafın cümleleri (I)–(V) numaralı ve dokunulabilir; cümleye dokunmak ilgili seçeneği (A = I … E = V) seçer. ÖSYM biçimine uygun A–E seçenekleri altta da durur.

**STUDY-11 · Geri bildirim ve ipucu merdiveni** (M, W, P0)

- **Doğru:** seçenek doğru durumunda; alt çubukta "Doğru." ve tek cümlelik neden; üçüncül "Çözümü gör", birincil "Sonraki". İpucuyla bulunduysa "İpucuyla doğru" etiketi.
- **Yanlış:** doğru cevap hemen gösterilmez. "Bu kez olmadı" ve üç seçenek: "Tekrar dene" (bir hak; yanlış seçenek elenir), "İpucu", "Çözümü göster". İkinci denemeden sonra çözüm açılır.
- **İpucu merdiveni:** öğretmen kartında basamaklar sırayla "Bir ipucu daha" ile açılır. Dördüncü basamak çözümdür: doğru cevap, nedeni, her çeldiricinin neden yanlış olduğu (katlanır), hap not bağlantısı, "Öğretmene sor".
- **Hata defteri çipi:** "Hata defterine eklendi · tekrar 3 gün sonra".
- **Hata türü** (isteğe bağlı, tek dokunuş): "Neden yanlış oldu?" Bilgi eksiği, Dikkat, Süre, Tuzak, Kelime. Öğretmen bir öneri işaretli getirir; kullanıcı değiştirebilir.
- **Telefon:** kart genişletilebilir yarım alt sayfa; soru üstte görünür kalır. **Masaüstü:** sağ panelde.

**STUDY-12 · Alıştırma sonucu** (M, W, P0): doğru, yanlış ve boş yığılmış çubuğu; süre; ipucu kullanımı; beceri ustalığı değişimleri; hatalar listesi (her biri incelemeye açılır); "Yanlışları tekrar çöz", "Benzer 10 soru", "Bugün'e dön".

**STUDY-19 · Çeviri koçu** (M, W, P0)

- **Kurulum:** yön (İngilizceden Türkçeye ya da tersi), zorluk, alan (sosyal, sağlık, fen).
- **Çalışma:** kaynak cümle (Literata), çok satırlı metin alanı (yazı boyutu 17), "Değerlendir".
- **Sonuç:** dört ölçüt (Anlam, Zaman, Yapı, Kelime) 0–3 nokta, genel not ("9/12"), önerilen çeviri, farklar ve açıklamalar; "ÖSYM tarzı soruya dönüştür" ve "Sonraki cümle".
- Ücretsiz planda günde 3 değerlendirme; öğretmen mesajından sayılır.

### 13.6 Kelimeler, hata defteri ve diğer araçlar

**STUDY-13 · Kelime merkezi** (M, W, P0): üstte "Bugün 32 kart" kartı ve "Başla"; desteler: YDS'de sık çıkanlar (2.000), Phrasal verb'ler (300), Bağlaçlar ve geçiş ifadeleri, Akademik kelimeler, Benim kelimelerim (sözlükten eklenenler), P1'de YÖKDİL alan desteleri. Her destede öğrenilen / toplam ve günlük yeni kart ayarı. İstatistik: öğrenilen kelime, ortalama doğru oranı; P1'de 30 günlük tekrar takvimi.

**STUDY-14 · Kelime oturumu** (M, W, P0): odak modu, ilerleme (12/32), kart, aralık etiketli dört değerlendirme düğmesi, "Geri al" (son değerlendirme), oturum sonu özeti. Klavye: Boşluk çevirir, 1–4 değerlendirir, Z geri alır. Telefonda kart ekranın üst 2/3'ü, düğmeler başparmak bölgesinde.

**STUDY-15 · Kelime ayrıntısı** (M, W, P0): kelime, türü, telaffuz (P1), sıralı anlamlar, örnek cümleler (biri YDS tarzı), eşdizimler, eş ve zıt anlamlılar, karıştırılanlar (affect / effect), alan etiketi, "Kartlarıma ekle"; P1'de geçtiği sorular.

**STUDY-16 · Kelime oyunları** (M, W, P1): Bağlamda seç (YDS kelime sorusu gibi cümle ve beş seçenek), Yaz (Türkçeden İngilizceye, harf ipucuyla), Düello (TUTOR-04 ile aynı).

**STUDY-17 · Hata defteri** (M, W, P0): üst özet (toplam, bu hafta eklenen, tekrarı gelen); filtre çipleri (soru tipi, hata türü, tarih, çözüldü mu); hata defteri satırları; "Zamanı gelenleri tekrar et" (STUDY-18); boş durum illüstrasyon 4.

**STUDY-18 · Hata tekrarı** (M, W, P0): soru iskeleti; soru yeniden çözülür, seçenek sırası karışır. Doğruysa tekrar aralığı uzar; yanlışsa ipucu merdiveni açılır ve aralık kısalır. Sonda "3 hata defterden çıktı".

**STUDY-20 · Okuma koçu kütüphanesi** (M, W, T, P1): alan sekmeleri (Sosyal, Sağlık, Fen); metin kartları (başlık, kelime sayısı, zorluk, süre, terim sayısı); okuma ekranı STUDY-08 ve terim listesi.

**STUDY-21 · Fotoğrafla soru** (M, P1): kamera görünümü ve çerçeve kılavuzu ("Soruyu çerçeveye al"), çek, köşe tutamaçlarıyla kırp, metin tanıma sonucu (düzenlenebilir metin ve ayrıştırılmış seçenekler), "Öğretmene sor"; galeriden seçme; izin reddedildiyse açıklama ve ayarlar bağlantısı. "Fotoğraf saklanmaz" notu görünür.

**STUDY-22 · Kaydedilenler** (M, W, P1): Sorular, Notlar, Kelimeler, Sohbet parçaları sekmeleri; arama; boş durum illüstrasyon 7.

### 13.7 Öğretmen

**TUTOR-01 · Öğretmen ana ekranı** (M, W, P0)

- **Telefon:** başlık; 2 × 2 hızlı mod kartları (Açıkla, Cümle röntgeni, Çeviri koçu, Kelime düellosu); son sohbetler (başlık, son mesaj, zaman; sola kaydır: sabitle, sil); altta sabit giriş alanı; ücretsiz planda kalan mesaj.
- **Masaüstü:** solda 320 px sohbet listesi, sağda seçili sohbet; boşken hızlı modlar ve örnek başlangıçlar.
- **Örnek başlangıçlar:** "Despite ile although farkı ne?", "Cloze testte nereden başlamalıyım?", "Bu cümleyi parçalarına ayır", "Bana 10 phrasal verb sor".

**TUTOR-02 · Sohbet** (M, W, T, P0)

- **Üst çubuk:** otomatik ve düzenlenebilir başlık; menü (yeniden adlandır, sil, kaydet, yanıtı bildir).
- **Mesaj alanı:** masaüstünde en çok 680 px; balonlar ve zengin bloklar (8.3); tarih ayıraçları.
- **Giriş:** en çok 6 satır büyüyen alan, mod çipleri, gönder; akış sırasında "Durdur"; ücretsiz planda 3 ve daha az mesaj kalınca sayaç.
- **Bağlam çipi:** sohbet bir sorudan açıldıysa üstte "Soru: Dil bilgisi · Bağlaçlar 7/10"; dokununca soruya döner.
- **Durumlar:** ilk mesaj (bir yapay zekâ öğretmeni olduğunu ve neler yapabileceğini söyler); akış; yarım kalan yanıt ("Yanıt yarım kaldı. Tekrar dene"); limit (TUTOR-05); emin değil (hocaya sorma bandı); konu dışı istekte kibar sınır ("Bu konuda yardımcı olamam; YDS ve İngilizce için buradayım").
- **Erişilebilirlik:** yanıt bitince ekran okuyucuya bir kez duyurulur; "En alta git" düğmesi.

**TUTOR-03 · Cümle röntgeni** (M, W, P1): cümle yapıştırma ya da fotoğraf, "Çözümle", sonuç bloğu; "Kendim işaretleyeyim" modunda kullanıcı parçaları seçer, sonra karşılaştırılır.

**TUTOR-04 · Kelime düellosu** (M, W, P1): 2 dakikalık sayaç, kelime ve dört seçenekli hızlı sorular, seri sayacı, sonuç (doğru sayısı, en iyi skor), kamptaki arkadaşa meydan okuma.

**TUTOR-05 · Mesaj limiti doldu** (M, W, P0): "Bugünkü 5 mesajını kullandın. Gece yarısı yenilenir."; hazır açıklamaların açık olduğu bilgisi; "Premium'a geç" ve "Yarın devam et".

**TUTOR-06 · Soru içi öğretmen** (M alt sayfa, W sağ panel 380 px, P0): soru bağlamı otomatik; hazır öneri çipleri: "Neden B?", "C neden yanlış?", "Benzer soru ver", "Kuralı özetle". Panel P1'de genişliği ayarlanabilir.

**TUTOR-07 · Yanıtı bildir** (M alt sayfa, W modal, P0): tür (Yanlış bilgi, Anlaşılmıyor, Konu dışı, Uygunsuz, Diğer), isteğe bağlı açıklama, "Gönder"; teşekkür toast'ı ve "İnceleyip haber vereceğiz". Bildirim CMS-08 kuyruğuna düşer.

### 13.8 Deneme

Deneme ekranları ürünün en sessiz yeridir: renk az, rozet ve bildirim yok, sınav ciddiyeti.

**EXAM-01 · Deneme merkezi** (M, W, P0): üstte önerilen deneme kartı ("Tam deneme · 80 soru · 180 dk", "Pazar 10:00 için planla"); türler: Tam deneme (80 soru, 180 dk), Mini deneme (40 soru, 90 dk), Soru tipi denemesi (örneğin 20 okuma sorusu), P1'de e-YDS provası (yalnızca masaüstü); geçmiş denemeler (tarih, puan, değişim) ve puan kıvılcım grafiği; ücretsiz planda "Ayda 1 mini deneme" bilgisi.

**EXAM-02 · Başlangıç ve kurallar** (M, W, P0): deneme adı, soru ve süre; mod kartları: Standart (süre durmaz), Rahat (duraklatılabilir), P1'de e-YDS modu. Kurallar: "Yanlış doğruyu götürmez", "İşaretleyip sonra dönebilirsin", "Öğretmen ve ipucu kapalı". Ortam önerisi: "Sessiz bir yer ve 3 saat". "Başlat" ve "Sonra planla" (takvime ekler).

**EXAM-03 · Sınav ekranı** (M, W, T, P0)

- **Telefon:** odak modu üst çubuğu: "Çık" (onaylı), gizlenebilir sayaç, gezgin düğmesi ("12/80"), işaretle. Gövdede soru tipine göre iskelet (STUDY-07–10), kontrol yok; seçim anında kaydedilir. Alt çubuk: "‹ Önceki", gezgin, "Sonraki ›". Okuma ve cloze gruplarında metin bir kez yüklenir.
- **Masaüstü:** üst bant (deneme adı, ortada sayaç, sağda "Bitir"); solda soru alanı (okumada iki bölme); sağda 280 px kalıcı soru gezgini. Klavye: A–E, ← →, F işaretle, G gezgin.
- **Tablet:** masaüstü düzeni; gezgin alt sayfada.
- **Durumlar:** süre bitti (otomatik teslim, sonuç); bağlantı koptu ("Çevrimdışı devam ediyorsun; cevapların cihazda" bandı); uygulama kapandı (dönüşte kaldığı yerden); son 5 dakika (sayaç warning renginde).

**EXAM-04 · e-YDS modu** (W, P1): ÖSYM e-sınav ortamına alıştıran, markasız ve nötr bir düzen: kalan süre, soru, Önceki / Sonraki / İşaretle, soru listesi. Marka renkleri kapalı, tam ekran önerilir. Tasarımcı ÖSYM'nin kamuya açık e-sınav tanıtım materyallerini inceler; amaç birebir kopya değil, alışkanlık kazandıran benzerliktir.

**EXAM-05 · Soru gezgini** (M alt sayfa, W yan panel, P0): 10 bölüm başlığıyla 1–80 baloncuk ızgarası; açıklama (Cevaplandı, Boş, İşaretli, Şu anki); filtre ("Yalnızca boşlar", "Yalnızca işaretliler"); sayacı ("62 cevaplandı · 3 işaretli · 15 boş"); baloncuğa dokunmak soruya gider.

**EXAM-06 · Optik form** (M, W, P1): önce kitapçık ekranında işaretle, sonra optik formda kodla; 80 satır × A–E, siyah beyaz; kodlanmamış soru uyarısı; kodlama süresi analize girer.

**EXAM-07 · Duraklatma** (M, W, P0): rahat modda "Deneme duraklatıldı · 47:12 geçti", "Devam et" ve "Bitir ve sonucu gör".

**EXAM-08 · Süre uyarıları** (M, W, P0): 30 ve 10 dakika kala üstte 4 saniyelik bant; 5 dakika kala kalıcı bant ve sayaç warning renginde; telefonda tek dokunsal uyarı. Sesli uyarı yok.

**EXAM-09 · Bitirme onayı** (M alt sayfa, W modal, P0): cevaplanan, boş ve işaretli sayıları; boş varsa Bölüm 9.6'daki uyarı; birincil "Boşlara dön", ikincil "Denemeyi bitir". Süre bitince bu ekran atlanır.

**EXAM-10 · Sonuç özeti** (M, W, P0)

- **Üst:** puan (numeric-xl) ve "47 doğru · 58,75 puan"; hedef çizgili puan bandı; "Hedefe 9 doğru kaldı" ya da "Hedefi geçtin".
- Doğru, yanlış ve boş yığılmış çubuğu; süre kullanımı ("172 / 180 dk"); önceki denemeye göre değişim.
- "En hızlı kazanç" kartı: en çok puan getirecek iki soru tipi ("Cloze testte 4 yanlış; 2'si bağlaç").
- Eylemler: "Ayrıntılı analiz", "Yanlışları incele"; planın güncellendiği bilgisi.
- Kutlama yok; kişisel rekorsa küçük "En iyi puanın" etiketi.

**EXAM-11 · Ayrıntılı analiz** (M, W, T, P0)

- Soru tipine göre doğru / toplam, soru başına ortalama süre ve hedef süre, hata türleri.
- Soru sırasına göre harcanan süre (1–80 çubuk grafik) ve 4 dakikayı aşan "takıldığın sorular".
- Hata türü dağılımı; işaretlenen soruların ne kadarının doğru çıktığı.
- Veriye dayalı üç öneri ve "Plana ekle".
- Masaüstünde iki sütunlu pano; tablette tek sütun büyük kartlar.

**EXAM-12 · Soru soru inceleme** (M, W, P0): inceleme modunda soru iskeleti; senin cevabın ve doğru cevap; harcanan süre; çözüm ve çeldirici açıklamaları; "Öğretmene sor"; filtre: yalnız yanlışlar, boşlar ya da işaretliler.

**EXAM-13 · Geçmiş ve eğilim** (M, W, P1): hedef çizgili puan eğilimi, deneme listesi, soru tipi başına küçük çoklu grafikler.

**EXAM-14 · Gerçek sınav sonucu** (M, W, P1): sınav oturumu seçili gelir; puan girişi (1,25'in katlarıyla doğrulanır); isteğe bağlı sonuç belgesi yükleme (yorum olarak yayınlanma izni ayrı onay); hedefe ulaştıysa kutlama (illüstrasyon 14), ulaşmadıysa yeni plan.

### 13.9 Ben ve ayarlar

**ME-01 · Profil ve ilerleme** (M, W, P0): avatar, ad, etkin sınav ve hedef; özet kartları (tahmini puan bandı, toplam çalışma süresi, seri, çözülen soru); puan eğilimi; beceri haritasının kısa görünümü; menü: Hedef ve sınav, Kilometre taşları, Kamp ve arkadaşlar, Abonelik, Ayarlar, Yardım, Hakkında. Kurum lisanslıysa kurum kartı.

**ME-02 · Beceri haritası** (M, W, T, P1): satırlar soru tipleri, hücreler o tipin becerileri; renk chart.sequential, hücrede kısa ad ve yüzde; dokununca beceri ekranı; 0–100 ölçek açıklaması. Telefonda tipe göre gruplı liste ve mini hücreler.

**ME-03 · Hedef ve sınav** (M, W, P0): etkin sınav, hedef puan ve gereken doğru, sınav tarihi, haftalık müsaitlik, hatırlatma saati; değişiklikte "Planın yeniden kurulacak" uyarısı; P1'de birden çok sınav takibi.

**ME-04 · Kilometre taşları** (M, W, P1): ilk tam deneme, hedefin yarısı, 55 eşiğine ulaşan tahmin, 100 hap not, 500 kelime, 7 / 30 / 100 gün seri; kazanılan ve kilitli görünümler.

**ME-05 · Kamp ve arkadaşlar** (M, W, P1): kamplar (ad, üye sayısı, bu haftaki toplam dakika), "Kamp kur" (ad, sınav, en çok 20 kişi), davet bağlantısı; arkadaş serisi. Varsayılan olarak yalnızca dakika ve seri paylaşılır; puan isteğe bağlı.

**ME-06 · Kamp ayrıntısı** (M, W, P1): üyeler (avatar, bu haftaki dakika, seri), ortak haftalık hedef, sıralama isteğe bağlı ve varsayılan kapalı, "Kamptan ayrıl". Kamp içi sohbet yok.

**ME-07 · Abonelik** (M, W, P0): plan, durum (etkin, deneme, iptal edildi), yenileme tarihi ve tutarı, ödeme yöntemi özeti, "Planı değiştir", "Aboneliği iptal et", faturalar (web). Mağaza aboneliğinde "App Store / Google Play'den yönetilir" ve bağlantı; kurum lisansında kurum adı ve bitiş tarihi.

**ME-08 · Ödeme yöntemleri ve faturalar** (W, M web, P0): kayıtlı kartlar (son 4 hane), varsayılan kart, silme; e-Arşiv faturalar (tarih, tutar, PDF); fatura bilgileri (bireysel: ad, adres; kurumsal: unvan, vergi dairesi ve numarası).

**ME-09 · Ayarlar** (M, W, P0)

- **Hesap:** ad, e-posta, isteğe bağlı şifre, bağlı hesaplar (Apple, Google), oturumu kapat.
- **Bildirimler:** günlük hatırlatma ve saati, tekrar hatırlatmaları, deneme önerileri, haftalık rapor e-postası, kampanya e-postaları (İYS onayı), sessiz saatler (varsayılan 22:00–08:00).
- **Görünüm:** tema (Sistem, Açık, Koyu), uygulama içi yazı boyutu, okuma yazı tipi, satır aralığı, hareketi azalt.
- **Çalışma:** günlük hedef süresi, günlük yeni kelime sayısı, varsayılan deneme modu, ses, titreşim, sayaç görünürlüğü, P1'de kart kaydırma hareketi.
- **Gizlilik ve veri:** verilerimi indir, kurumla paylaşılan veriler, sohbet geçmişini sil, hesabı sil.
- **Yardım:** yardım merkezi, bize yaz, hata bildir (ekran görüntüsü ekleyerek), sürüm notları.
- **Hakkında:** sürüm, açık kaynak lisansları, koşullar, aydınlatma metni.

**ME-10 · Hesap silme** (M, W, P0): uyarı metni (9.6), silinecekler listesi, mağaza aboneliği uyarısı, kodla yeniden doğrulama, yıkıcı "Hesabımı sil", sonuç ekranı ("30 gün içinde kalıcı olarak silinecek").

**ME-11 · Arkadaşını davet et** (M, W, P2): davet bağlantısı ve kodu, ödül kuralı, davet geçmişi.

### 13.10 Satın alma

**PAY-01 · Paywall** (M tam ekran, W sayfa ya da modal, P0)

- **Üst:** illüstrasyon 15, başlık (display-m) "Sınavına kadar sınırsız çalış", tek cümle alt metin.
- **Faydalar** (dört ikonlu madde): sınırsız soru ve hap not; günde 40 öğretmen mesajı; tüm denemeler ve ayrıntılı analiz; puan tahmini ve haftalık rapor.
- **Plan kartları:** Sınav dönemi (önerilen, "≈ 298 TL/ay"), Yıllık ("≈ 208 TL/ay"), Aylık (349 TL); seçili kart petrol kenarlı.
- **Birincil düğme:** deneme hakkı varsa "7 günü ücretsiz başlat", yoksa "Devam et · 1.490 TL".
- **Güvence:** "İstediğin zaman iptal", "Deneme bitmeden 2 gün önce hatırlatırız".
- **Yasal:** yenileme koşulları, ön bilgilendirme ve mesafeli satış bağlantıları; mobilde mağaza koşulları ve "Satın alımları geri yükle".
- **Kapat** düğmesi her zaman ve gecikmesiz görünür. Fiyatlar ve kampanya etiketi (örnek "Kurucu üye") değişken alan.

**PAY-02 · Bağlamsal paywall** (M, W, P0): limit başlığı ("Bugünkü 15 soruyu bitirdin"), kazanılanın özeti ("11 doğru · cloze test ustalığı +8"), tek önerilen plan ve "Tüm planlar", ikincil "Yarın devam et".

**PAY-03 · Plan karşılaştırma** (M, W, P0): özellik satırları ve Ücretsiz / Premium sütunları (telefonda yatay kaydırma olmadan iki sütun); SSS (iptal, iade, kurum lisansı).

**PAY-04 · Ödeme, web** (W, M web, P0)

- **Masaüstü:** solda sipariş özeti (plan, KDV dahil tutar, yenileme bilgisi, kupon alanı); sağda kart formu (kart üzerindeki ad, numara, son kullanma, CVC), karta göre taksit seçenekleri, fatura bilgileri, zorunlu onaylar (ön bilgilendirme formu, mesafeli satış sözleşmesi), "Ödemeyi yap · 1.490 TL".
- **Güven öğeleri:** ödeme sağlayıcısı logosu, 3D Secure bilgisi, isteğe bağlı kart saklama izni.
- **Mobil web:** tek sütun; özet üstte katlanır.
- **Durumlar:** alan altında kart hataları; "Bankanın onay sayfasına yönlendiriliyorsun" bekleme ekranı; zaman aşımı.

**PAY-05 · Mağaza satın alma** (M, P1): mağazanın kendi sayfası tasarlanmaz. Öncesi PAY-01 (mobil), sonrası PAY-06. Durumlar: iptal edildi (sessiz dönüş), onay bekliyor (aile onayı), başarısız.

**PAY-06 · Hoş geldin Premium** (M, W, P0): kısa kutlama, açılan özellikler, fatura e-postası bilgisi, "Bugün'e dön".

**PAY-07 · Ödeme hatası** (M, W, P0): bankanın hata kodu insan diline çevrilir ("Yetersiz bakiye", "3D doğrulama başarısız", "Kart internet alışverişine kapalı"); çözüm önerisi; "Tekrar dene", "Başka kart".

**PAY-08 · Deneme süresi bitiyor** (M, W, P0): Bugün bandı, e-posta ve bildirim: "Ücretsiz deneme 3 Ekim'de bitiyor; sonra 349 TL/ay. Devam etmek istemiyorsan şimdi iptal edebilirsin." ve "Planımı yönet".

**PAY-09 · İptal akışı** (M, W, P0)

1. Neden: Sınavım bitti, Pahalı, Yeterince kullanamadım, İçerik yetersiz, Teknik sorun, Diğer.
2. Nedene göre teklif: sınav bitti → bir sonraki sınava kadar dondur; pahalı → indirimli yıllık plan; az kullandım → daha kısa günlük plan.
3. Onay: "Premium 1 Kasım'a kadar sürer."

Her adımda "İptale devam et" eşit görünürlüktedir; karanlık desen yok.

**PAY-10 · Kurucu üyelik ön satışı** (W, M web, P0): gerçek veriye dayalı kontenjan sayacı ("1.000 kişilik kontenjanın 312'si doldu"), fiyat kilidi açıklaması, açılış tarihi (Şubat 2027), iade koşulu (açılmazsa tam iade), ödeme PAY-04 ile.

### 13.11 Sistem durumları

| Kimlik | Tanım |
| --- | --- |
| SYS-01 Yükleniyor | Her liste ve kart için iskelet; 400 ms'den kısa yüklemelerde gösterilmez; 10 sn'yi aşarsa "Beklenenden uzun sürdü" ve Tekrar dene |
| SYS-02 Boş durumlar | İllüstrasyon eşleşmesi: 4 hata defteri, 5 deneme, 6 kartlar, 7 kaydedilenler, 8 bildirim, 9 hocanın sınıfı |
| SYS-03 Hata | Tam ekran (ağ: illüstrasyon 10, sunucu: 11) ve kart içi olmak üzere iki biçim; destek için küçük hata kodu |
| SYS-04 Çevrimdışı (P1) | Üst bant "Çevrimdışısın · indirilen setler kullanılabilir"; indirilenler; eşitleme bekleyen cevap sayısı |
| SYS-05 Bakım | İllüstrasyon 12, tahmini bitiş saati, durum sayfası bağlantısı |
| SYS-06 Güncelleme (P1) | Zorunlu: tam ekran ve mağaza bağlantısı; isteğe bağlı: kapatılabilir bant |
| SYS-07 Oturum süresi doldu | Alt sayfa "Güvenliğin için yeniden giriş yap"; yarım kalan çalışma kaybolmaz |
| SYS-08 Anlık bildirimler | Başlık ve gövde (Bölüm 19), uygulama ikonu, eylem düğmeleri ("Başla", "Yarın hatırlat") |
| SYS-10 Widget (P2) | Küçük: geri sayım ve seri; orta: bugünün planı; kilit ekranı: geri sayım. Açık, koyu ve sistem tonlu varyantlar |
| SYS-11 Canlı Etkinlik (P3) | Deneme sayacı kilit ekranında |

### 13.12 Pazarlama sitesi

**MKT-01 · Ana sayfa** (W, M, P0), yukarıdan aşağı:

1. **Kahraman:** başlık (display-l) "Sınavı bilen bir öğretmen, kursun onda biri fiyatına."; alt metin; birincil "Ücretsiz seviye tespitine başla", ikincil "Fiyatları gör"; sağda gerçek ürün ekranları (telefon ve masaüstü).
2. **Kanıt şeridi:** yalnızca gerçek veriyle (kullanıcı sayısı, çözülen soru); veri yokken bu şerit gösterilmez.
3. **Nasıl çalışır:** üç adım: seviye tespiti, kişisel plan, öğretmenle çalış.
4. **Öğretmen demosu:** tek soruluk etkileşimli örnek; yanlış seçilince ipucu merdiveni açılır.
5. **YDS'nin 80 sorusu:** optik form görseliyle 10 soru tipi.
6. **Fiyat karşılaştırması:** kurs, koçluk ve uygulama aralıkları.
7. **Kime göre:** doktora ve doçentlik, sağlık (YÖKDİL), kamu personeli (dil tazminatı).
8. **SSS**, son çağrı ve alt bilgi.

**Diğer sayfalar:**

- **MKT-02 Fiyatlar:** PAY-01 ile aynı plan kartları, karşılaştırma tablosu, kurumlar için iletişim, SSS, yasal bağlantılar.
- **MKT-03 YDS rehberi** (MKT-04 ve 05 aynı şablon): uzun içerik; içindekiler, soru dağılımı tablosu, puan hesabı, takvim, strateji; masaüstünde sağda yapışkan "Seviye tespitine başla" kartı.
- **MKT-06 Ücretsiz araçlar:** puan hesaplama (doğru sayısı → puan; hedef → gereken doğru), sınav takvimi ve geri sayım (oturum seç, kalan gün, takvime ekle); her araç ürüne bir çağrıyla biter.
- **MKT-07 Seviye tespiti açılışı:** kısa açıklama ve "Başla" (girişsiz DIAG-01).
- **MKT-08 Bekleme listesi ve kurucu üyelik:** e-posta formu ve PAY-10 kartı.
- **MKT-09 Blog:** kategori çipleri (YDS, YÖKDİL, Strateji, Kelime); yazı sayfası 680 px, içindekiler, okuma süresi, yazar kutusu, ilgili ürün kartı.
- **MKT-10, 11, 12, 14:** blog ve rehber şablonlarının varyantları; MKT-10'da kurum iletişim formu.
- **MKT-13 Yardım merkezi:** arama, kategoriler (Hesap, Ödeme, Plan, Öğretmen, Sınav bilgisi), makale, "Bize yaz" formu.
- **MKT-15 Yasal ve çerez:** yasal sayfa şablonu (içindekiler, son güncelleme tarihi). Çerez bandında "Yalnızca gerekli", "Tercihleri yönet", "Tümünü kabul et" eşit görünürlükte; tercih panelinde gerekli, analitik, pazarlama.
- **MKT-16 404 ve 500:** illüstrasyon, arama, ana sayfa bağlantısı.

## 14. Kurum paneli, hoca stüdyosu ve içerik editörü

Bu üç alan masaüstü web için tasarlanır ve yoğun veri taşır. Öğrenci uygulamasıyla aynı token ve bileşenleri kullanır; fark, daha yüksek bilgi yoğunluğu ve "siz" hitabıdır.

### 14.1 Ortak kabuk

- Sol kenar çubuğu (rol menüsü); üst çubuk (kurum adı ve logosu, arama, bildirim, profil, rol değiştirici).
- Yoğunluk seçeneği: Rahat ya da Yoğun (tablo satırı 48 ya da 40 px).
- Telefonda salt okunur özetler ve temel eylemler (davet gönder, öğrenciye not); karmaşık düzenleme masaüstünde.
- Roller: Kurum yöneticisi (her şey), Hoca (kendi sınıfları), Gözlemci (salt okunur rapor), Editör (yalnızca içerik editörü).

### 14.2 Kurum paneli (P2)

- **ORG-01 Genel bakış:** gösterge satırı (etkin öğrenci / lisans, haftalık ortalama çalışma, ortalama tahmini puan ve değişimi, gerçek sonuç girenlerde hedefe ulaşma oranı); puan dağılımı histogramı; risk altındaki öğrenciler (7 gündür etkin değil, tahmin hedefin çok altında); yaklaşan sınavlar; son ödevler.
- **ORG-02 Sınıflar:** tablo ya da kart (ad, hoca, öğrenci sayısı, sınav, ortalama tahmin, etkinlik) ve "Sınıf oluştur".
- **ORG-03 Sınıf ayrıntısı:** sekmeler: Öğrenciler (son etkinlik, haftalık dakika, tahmini puan, eğilim kıvılcımı, risk etiketi), Beceriler (öğrenciler × 10 soru tipi ısı haritası), Ödevler, Ayarlar (davet kodu, karekod, hedef tarih).
- **ORG-04 Öğrenci ayrıntısı:** profil özeti, puan eğilimi, denemeler, beceri haritası, ödevler, öğrencinin görmediği hoca notları. Sohbet içerikleri görünmez.
- **ORG-05 Ödev oluştur:** içerik seç (hap not, soru seti, deneme; tip, beceri, zorluk filtresi) → hedef (sınıf ya da öğrenci) → tarih ve saat → ayarlar (süreli mi, ipucu açık mı) → önizleme → yayınla.
- **ORG-06 Ödev sonuçları:** tamamlama oranı, ortalama doğru, en çok yanlış yapılan sorular ve çeldirici dağılımı, öğrenci listesi.
- **ORG-07 Lisanslar ve davetler:** koltuk sayacı, davet kodu ve bağlantısı, CSV ile toplu davet, bekleyen davetler, koltuğu geri alma.
- **ORG-08 Raporlar:** dönem seçici; Etkinlik, İlerleme, Deneme sonuçları, Ödevler raporları; CSV ve PDF dışa aktarma.
- **ORG-09 Kurum ayarları:** ad, açık ve koyu zemin için logo, kontrast kontrollü aksan rengi ve önizleme, roller ve izinler, veri saklama süresi.
- **ORG-10 Fatura:** plan, koltuk sayısı, fatura geçmişi, fatura bilgileri, ödeme yöntemi (havale ve kart).

### 14.3 Hoca stüdyosu (P2)

- **TCH-01 Hoca paneli:** sınıfların özeti, öğrenci sayısı, bu ayki gelir, en çok kullanılan içerikler, yaklaşan ödevler.
- **TCH-02 İçerik oluştur:** içerik editörünün sadeleştirilmiş hâli; yapay zekâ taslak yardımı; yayın öncesi otomatik kontroller (tek doğru cevap, seçenek sayısı, yazım). Satışa açılan içerikte platform editörünün onayı zorunlu.
- **TCH-03 Satış sayfası:** hoca profili, set ya da kurs tanıtımı, içerik listesi, fiyat, örnek not, "Kaydol"; P3'te yorumlar.
- **TCH-04 Gelir ve ödemeler:** dönemlik gelir grafiği, öğrenci başına gelir, hakediş tarihleri, IBAN ve fatura bilgileri.
- **TCH-05 Hoca profili:** fotoğraf, unvan, uzmanlık (YDS, YÖKDİL Sağlık), deneyim, bağlantılar; platform doğruladıysa doğrulama rozeti.

### 14.4 İçerik editörü (P0, iç araç)

İçerik editörü gösteriliş değil hız için tasarlanır: klavyeyle kullanılır, her ekranda canlı önizleme vardır ve yazan kişi kendi içeriğini onaylayamaz.

&#91;embedded content: içerik üretim hattı · 6 aşama, 3 geri dönüş\]

Editör ekranları bu hattın her adımına karşılık gelir: taslak CMS-05, düzeltme CMS-02 ile 04, inceleme CMS-06, kalibrasyon CMS-07, bildirimler CMS-08.

- **CMS-01 İçerik listesi:** tablo (kimlik, tür, sınav, beceri, zorluk, durum, sürüm, son düzenleyen, istatistik özeti); filtreler; toplu işlemler (etiketle, incelemeye gönder); kayıtlı görünümler.
- **CMS-02 Soru editörü:** solda form (sınav, soru tipi, beceriler, zorluk tahmini, bağlam paragrafı, kök, A–E seçenekleri ve doğru işareti, her seçenek için "neden yanlış", dört basamaklı ipucu, çözüm, etiketler, kaynak ve lisans alanı); sağda canlı önizleme (telefon / masaüstü, açık / koyu sekmeleri). Doğrulamalar: tek doğru cevap, seçenek uzunlukları dengesizse uyarı, benzer soru uyarısı. Klavye: ⌘/Ctrl+S kaydet, ⌘/Ctrl+Enter incelemeye gönder.
- **CMS-03 Hap not editörü:** Kural, Örnek, Tuzak ve Kontrol sorusu bloklarından oluşan blok editör; okuma süresi hesabı; önizleme.
- **CMS-04 Okuma metni editörü:** metin, alan, kelime sayısı, okunabilirlik göstergesi, kaynak ve lisans (CC BY atıf alanı), gömülü dört soru, terim listesi.
- **CMS-05 Yapay zekâ taslak üretici:** parametreler (sınav, soru tipi, beceri, zorluk, adet, alan, örnek sorular), "Taslak üret" (toplu iş ve ilerleme), sonuçlar (kabul et ve editöre gönder, düzenle, reddet), maliyet ve süre göstergesi.
- **CMS-06 İnceleme kuyruğu:** atanan, öncelik ve bekleme süresiyle liste; inceleme görünümünde içerik, satır içi yorumlar, sürüm farkı (eski ve yeni yan yana); karar: Onayla (pilota), Değişiklik iste, Reddet.
- **CMS-07 Madde istatistikleri (P1):** doğru oranı, ayırt edicilik, seçeneklerin seçilme oranları, ortalama süre, ipucu kullanımı, hata bildirimleri; eşik uyarıları (doğru oranı 0,20'nin altı ya da 0,95'in üstü, ayırt edicilik 0,20'nin altı) ve "Gözden geçir" etiketi.
- **CMS-08 Hata bildirimleri:** kuyruk (kaynak, tür, kullanıcı notu, bildirim sayısı), içerik bağlamı, karar (düzelt, reddet, yanıt şablonu); çözülünce bildiren kullanıcıya haber gider.
- **CMS-09 Deneme oluşturucu:** YDS blueprint şablonu (10 tip ve adetleri), hedef zorluk dağılımına göre otomatik doldurma, el ile değiştirme, denge göstergeleri (konu, zorluk, metin alanı), önizleme ve yayın.
- **CMS-10 Sınav paketi ayarları (P1):** sınav tanımı (ad, kod, soru tipleri ve adetleri, süre, puanlama formülü, oturum takvimi, e-sınav olup olmadığı) ve beceri ağacı düzenleyici.
- **CMS-11 Kullanıcı desteği (P1):** kullanıcı arama, hesap ve abonelik görünümü, işlem geçmişi, yetkiye bağlı iade ve uzatma, KVKK talepleri.

## 15. Gelecek modüller

Gelecek modüller şimdi çizilmez, ama bugünkü kararlar onları kırmamalı. Her modül için tasarım etkisi ve bugünden ayrılacak yer aşağıda; en önemli ilke şu: terimler, puan ölçeği ve soru biçimi sınav paketinden gelir, ekrana sabit yazılmaz.

| Modül | Ne gelir | Tasarım etkisi | Bugünden ayrılacak yer |
| --- | --- | --- | --- |
| YÖKDİL (P1) | Fen, Sağlık, Sosyal alan metinleri, alan sözlüğü, alan desteleri | Alan seçici, alan etiketleri, terim balonu | Sınav seçicide alan alt seçimi; içerik kartlarında alan etiketi alanı |
| e-YDS provası (P1) | Bilgisayarlı sınav modu | Markasız, nötr, tam ekran mod | Deneme modu seçicisi; tema sisteminde "nötr mod" |
| IELTS ve TOEFL (P3) | Dinleme, konuşma, yazma bölümleri; IELTS 0–9 bantları ve TOEFL'in güncel ölçeği | Ses oynatıcı (dalga biçimi, hız, dinleme hakkı), kayıt arayüzü (mikrofon izni, kaydet, duraklat, dinle), kelime düzeyinde telaffuz geri bildirimi, süreli yazma editörü (kelime sayacı, rubrik puanı) | Puan bandı farklı ölçekleri destekler; soru kartında medya alanı; mikrofon izni ön açıklama şablonu |
| KPSS, ALES, DGS (P3) | Sayısal sorular, şekil, grafik ve tablo yorumu; uzun Türkçe paragraflar | Matematik gösterimi (KaTeX), yakınlaştırılabilir şekiller, karalama alanı | Soru kartında görsel ve formül alanı. KPSS'de 4 yanlış 1 doğruyu götürdüğü için "net" terimi o pakette kullanılır |
| YDT, YKS, LGS (P3) | Lise ve ortaokul öğrencileri | Veli onayı akışı, veli paneli, yaşa uygun ton (yine maskotsuz) | Hesap modelinde veli bağlantısı; KVKK veli onayı ekran şablonu |
| Kitap okuyucu ve yayın (P2) | Dijital kitap, karekod | Okuyucu ayarları (yazı tipi, boyut, tema), içindekiler, işaret, vurgu, not, sayfa ya da kaydırma; okuyucuya özel sıcak kâğıt teması | Okuma ayarları bileşenleri bugünden ortak |
| Hoca pazar yeri (P3) | Kurs keşfi, satın alma, yorumlar | Arama, filtreler, kurs kartları, puanlama, hoca doğrulaması | Hoca profili ve satış sayfası bileşenleri |
| Canlı ders (P3) | Görüntülü oturum, ortak soru ekranı | Video arayüzü, randevu takvimi | – |
| Topluluk (P3) | Soru-cevap | Moderasyon ve raporlama araçları | – |
| YDS'nin diğer dilleri (P3) | Almanca, Fransızca, Rusça, Arapça çoktan seçmeli | İçerik dili değişir, arayüz Türkçe kalır; Arapça içerik sağdan sola metin ister | Okuma bileşeninde sağdan sola metin desteği |

## 16. Platform ve tema kuralları

Tek bir marka dili, her platformda o platformun alışkanlıklarıyla: görünüm ortak, davranış yerli. Sistem çubukları ve seçiciler platformun kendi bileşenleriyle; içerik alanı bizim dilimizle.

### 16.1 iOS

- Alt sekme çubuğu; ana ekranlarda büyük başlık, kaydırınca küçülür; soldan kaydırarak geri.
- Sekme ve gezinme çubuğu için sistem bileşenleri önerilir; iOS 26 ile gelen Liquid Glass görünümünü böylece kendiliğinden alır. Tasarımcı güncel Human Interface Guidelines ile doğrular.
- Yerel sheet, tarih ve saat seçiciler.
- Dynamic Type, VoiceOver, Hareketi Azalt, Kalın Metin ve Kontrastı Artır desteklenir.
- Apple ile giriş; uygulama içi satın alma ve "Satın alımları geri yükle".

### 16.2 Android

- Material 3 gezinme çubuğu davranışı, marka token'larıyla; sistem geri hareketi ve tahmini geri (predictive back) animasyonu.
- Uçtan uca düzen: içerik durum ve gezinme çubuklarının arkasına uzanır, güvenli alan boşlukları korunur.
- Material You dinamik renk kapalı; marka renkleri sabit.
- Yazı ölçeği %200'e kadar; uyarlanabilir ve tek renkli ikon.
- Google Play faturalandırma ve abonelik yönetimi bağlantısı.

### 16.3 Web

- **Masaüstü:** kenar çubuğu, üzerine gelme durumları, klavye kısayolları, seçenekte sağ tık menüsü (ele). Her ekranın anlamlı bir adresi olur; tarayıcının geri ve ileri düğmeleri her yerde çalışır.
- **Mobil web ve PWA:** telefon düzeni; ikinci oturumdan sonra kendi bandımızla "Ana ekrana ekle" önerisi; ana ekrana eklenmiş PWA'da web bildirimleri.
- Odak halkası klavyeyle her zaman görünür; tarayıcı %200 yakınlaştırıldığında düzen bozulmaz; tablolar dışında yatay kaydırma yok.
- Desteklenen tarayıcılar: Chrome, Safari, Edge ve Firefox'un son iki sürümü.

### 16.4 Tablet

Gezinme rayı, iki bölmeli okuma, dikeyde alt sayfa ve yatayda yan panel olarak soru gezgini. Klavye bağlıysa masaüstü kısayolları çalışır.

### 16.5 Koyu tema

- Kaynak: Sistem (varsayılan), Açık, Koyu; değişiklik anında uygulanır.
- Yüzeyler Gece nötrleri; yükselti daha açık yüzeyle; doygun renkler 600 yerine 400; okuma metni text.reading.
- İllüstrasyonların ve logonun koyu zemin varyantı; pazarlama ekran görüntüleri iki temada.
- Grafikler chart.series koyu değerleriyle.
- Kâğıt deneme modunda "Gerçekçi" ayarı açıksa soru kâğıdı koyu temada da beyaz kalır (varsayılan kararı Bölüm 22'de).
- Paylaşım kartları (kilometre taşı) açık temada üretilir.

### 16.6 Kurum teması

- **Kurum değiştirebilir:** logo (kenar çubuğu altı, Ben ekranı, e-posta başlığı), aksan rengi, kurum adı.
- **Değiştiremez:** yazı tipleri, nötrler, durum ve ödül renkleri, düzen, bileşenler, ürün adı. Tam beyaz etiket P3 sonrası.
- **Aksan seçici:** renk girilir → açık ve koyu tema tonları türetilir → kontrast sonuçları gösterilir → geçmezse en yakın geçen ton önerilir.

### 16.7 Klavye kısayolları (masaüstü)

| Bağlam | Tuş | Eylem |
| --- | --- | --- |
| Soru | A–E | Seçeneği seç |
| Soru | Enter | Kontrol et, sonraki |
| Soru | H | Sonraki ipucu |
| Soru | X | Seçili seçeneği ele ya da geri al |
| Soru | F | İşaretle |
| Soru | ← → | Önceki ve sonraki soru |
| Soru | T | Öğretmen panelini aç, kapat |
| Deneme | G | Soru gezgini |
| Kelime | Boşluk | Kartı çevir |
| Kelime | 1–4 | Tekrar, Zor, İyi, Kolay |
| Kelime | Z | Son değerlendirmeyi geri al |
| Genel | / | Arama (P1) |
| Genel | ⌘K / Ctrl+K | Komut paleti (P2) |
| Genel | ? | Kısayol listesi |
| Genel | Esc | Paneli ya da diyaloğu kapat |

Tek tuşlu kısayollar metin alanı odaktayken çalışmaz ve Ayarlar'dan kapatılabilir (WCAG 2.1.4).

## 17. Erişilebilirlik

Hedef WCAG 2.2 AA. Aşağıdaki liste her P0 ekranın kabul listesidir; tasarım teslim edilmeden önce işaretlenir.

### Görsel

- [ ] Metin kontrastı 4,5:1; büyük metin ve arayüz bileşenleri 3:1 (Bölüm 5.4)
- [ ] Durumlar renk, ikon ve metinle; protanopi, döteranopi ve tritanopi simülasyonunda kontrol edildi
- [ ] Yazı boyutu %200'de kesilme ve üst üste binme yok; tablolar dışında yatay kaydırma yok
- [ ] Odak halkası her etkileşimli öğede görünür; odak sırası okuma sırasıyla aynı
- [ ] Odaklanan öğe sabit üst ve alt çubukların altında kalmaz (WCAG 2.4.11)
- [ ] Hareketi azaltma tercihine uyulur; saniyede 3'ten fazla yanıp sönen içerik yok

### Dokunma ve klavye

- [ ] Dokunma hedefleri en az 44 × 44 pt ya da 48 dp, aralarında en az 8 pt
- [ ] Tüm işlevler klavyeyle kullanılabilir; tek tuşlu kısayollar kapatılabilir
- [ ] Sürükleme gerektiren her işlemin tek dokunuşlu alternatifi var (WCAG 2.5.7)
- [ ] Uzun basmayla yapılan elemenin menü alternatifi var

### Ekran okuyucu

- [ ] Seçenekler "Seçenek B, Although, seçili" biçiminde okunur; doğru ve yanlış sonucu duyurulur
- [ ] Görseller ve ikon düğmeler için erişilebilir ad; süs görseller gizli
- [ ] İngilizce içerik dil etiketiyle işaretli
- [ ] Canlı bölgeler: süre uyarıları, tamamlanan öğretmen yanıtı, toast mesajları
- [ ] Her grafiğin tablo görünümü ya da metin özeti var
- [ ] Başlık hiyerarşisi ve sayfa bölgeleri (landmark) doğru

### Zaman ve bilişsel yük

- [ ] Süreli alıştırmalarda süre kapatılabilir; denemede Rahat mod ve %25 ya da %50 ek süre ayarı
- [ ] Oturum zaman aşımından önce uyarı; yarım kalan çalışma kaybolmaz
- [ ] Hata mesajı ne olduğunu ve nasıl düzeltileceğini söyler; form girilenleri korur
- [ ] Kimlik doğrulamada bilişsel test yok; kod yapıştırma ve şifre yöneticisi desteklenir (WCAG 3.3.8)
- [ ] Yardım bağlantısı her ekranda aynı yerde (WCAG 3.2.6)
- [ ] Aynı bilgi iki kez istenmez (WCAG 3.3.7)

### Okuma

- [ ] Okuma ayarları: yazı boyutu, satır aralığı, yazı tipi, yüksek okunurluk seçeneği
- [ ] Harf ve kelime aralığı artırılabilir

### Test

- [ ] Her P0 ekran VoiceOver, TalkBack ve yalnızca klavyeyle en az bir kez denendi
- [ ] Otomatik erişilebilirlik taraması her derlemede, el ile kontrol her sürümde

## 18. Veri görselleştirme

Grafikler bir karara yardım eder: bugün neye çalışmalı, hedefe ne kadar kaldı. Süs değildir. Her grafiğin başlığı bulguyu söyler ("Cloze test en hızlı kazanç"), konusunu değil ("Soru tipi analizi").

### 18.1 Grafik envanteri

| Grafik | Nerede | Biçim | Not |
| --- | --- | --- | --- |
| Puan bandı | Bugün, seviye sonucu, deneme sonucu | 0–100 yatay ölçek, tahmin aralığı bant, hedef çizgisi | Bant genişliği güveni anlatır |
| Puan eğilimi | Ben, deneme geçmişi | Çizgi, kesikli safran hedef çizgisi, hafif aralık bandı | Tek eksen; her nokta bir deneme |
| Soru tipine göre başarı | Seviye sonucu, analiz | Tek renk yatay çubuk; en zayıf iki tip vurgulu, diğerleri sessiz | Sıra: sınav sırası ya da başarı |
| Doğru, yanlış, boş | Sonuç ekranları | Yığılmış yatay çubuk, durum renkleri ve etiketler | Sayılar doğrudan etiketli |
| Soru başına süre | Deneme analizi | 1–80 dikey çubuk, hedef süre çizgisi; 4 dakikayı aşanlar vurgulu | Dokununca soruya gider |
| Beceri ısı haritası | Ben, kurum paneli | Sıralı petrol tonları, hücrede yüzde | 0–100 ölçek açıklaması |
| Çalışma takvimi | Bugün, Ben | Haftalık nokta ya da kare takvim, dakika yoğunluğu | Boş gün nötr; ceza rengi yok |
| Kıvılcım | Kurum tabloları, deneme listesi | 2 px çizgi, son nokta vurgulu | Eksen yok |
| Puan dağılımı | Kurum genel bakış | Histogram ve hedef çizgisi | – |
| Çeldirici dağılımı | Madde istatistikleri, ödev sonuçları | A–E yatay çubuk; doğru seçenek yeşil ve ✓ | – |

### 18.2 Kurallar

- Tek eksen; çift eksenli grafik yok. Pasta ve halka grafik yok.
- Renk sırası sabit (chart.series-1–4); en çok dört kategori rengi, fazlası "Diğer".
- Doğru, yanlış ve boş renkleri yalnızca bu anlamda kullanılır.
- Etiket seçicidir: her noktaya sayı yazılmaz; değerler ipucu balonunda ve tablo görünümünde.
- Izgara ince, düz ve sessiz (chart.grid); kesikli çizgi yalnızca hedef için.
- Çubuk en çok 24 px kalın, veri ucu 4 px yuvarlak, tabanı düz; çizgi 2 px; nokta en az 8 px.
- Yazılar text token'larında; seri renginde yazı yok.
- Telefonda dokunup tutunca ipucu; masaüstünde üzerine gelme ve klavye odak; her grafikte "Tablo olarak göster".
- Yetersiz veri: boş eksen yerine açıklama ("Eğilim için en az 2 deneme gerekir").
- İlk çizim animasyonu en çok 400 ms; hareket azaltmada yok.

### 18.3 Sayı gösterimi

- Puan iki ondalığa kadar ve yuvarlanmadan (58,75), çünkü YDS puanı 1,25'in katıdır.
- Tahmini puan her zaman aralık olarak ("61–67"), tek sayı olarak asla.
- Yüzde tam sayı (%42); süre "02:15" ya da "2 dk 15 sn".

## 19. Bildirim ve e-posta şablonları

Bildirim günde en çok bir tanedir, kullanıcının seçtiği saatte ve sessiz saatler dışında gelir. Amacı hatırlatmaktır; suçlamak, korkutmak ya da kovalamak değil.

### 19.1 Kurallar

- Günde en çok bir bildirim (deneme sırasındaki süre uyarıları hariç), haftada en çok bir tanıtım.
- Sessiz saatler varsayılan 22:00–08:00; kullanıcının saat dilimi esas.
- Başlık en çok 40, gövde en çok 110 karakter; kilit ekranında kesilmeden okunur.
- Emoji, ünlem, büyük harf ve suçlama yok; her bildirim derin bağlantıyla bir ekrana açılır.
- Üç bildirim üst üste açılmazsa sıklık kendiliğinden haftada ikiye iner.
- Arkadaş adı içeren bildirim yalnızca kamp ayarı izin veriyorsa gönderilir.

### 19.2 Anlık bildirimler

| Tür | Tetik | Başlık | Gövde | Açılan ekran |
| --- | --- | --- | --- | --- |
| Günlük plan | Seçilen saat, plan bitmediyse | Bugünkü planın hazır | 25 dakika: cloze test, 32 kart, 1 çeviri. | HOME-01 |
| Kelime tekrarı | Akşam; vadesi gelen kart 20 ve üzeri | 32 kartın tekrar zamanı geldi | 8 dakikada bitirebilirsin. | STUDY-14 |
| Seri koruma | Seri 3 gün ve üzeri, saat 20:00, bugün çalışılmadı | Serin 12. günde | Bugün 5 dakikalık kısa bir tekrar yeter. | HOME-01, kısa plan |
| Deneme önerisi | Hafta sonu sabahı; son deneme 14 günden eski | Bu hafta sonu bir deneme? | Tam deneme planına göre seni bekliyor. | EXAM-02 |
| Haftalık rapor (P1) | Pazartesi 09:00 | Haftalık raporun hazır | Cloze test ustalığın %42'den %55'e çıktı. | HOME-04 |
| Sınava 7 gün | Sınavdan 7 gün önce | YDS/2'ye 7 gün kaldı | Son hafta planın hazır: tekrar ve iki mini deneme. | HOME-01 |
| Sınav günü | Sınav sabahı 07:30 | Bugün sınav günü | Kimliğin ve sınava giriş belgen yanında olsun. Başarılar. | HOME-01, sınav günü durumu |
| Sonuç günü (P1) | ÖSYM sonuç tarihi | YDS/2 sonuçları açıklandı | Puanını girersen planını buna göre güncelleriz. | EXAM-14 |
| Deneme süresi | Ücretsiz denemenin bitmesine 2 gün | Ücretsiz deneme 3 Ekim'de bitiyor | Sonra 349 TL/ay. İstersen şimdi iptal edebilirsin. | ME-07 |
| Bildirim çözüldü | CMS'te çözülünce | Bildirdiğin soru düzeltildi | Teşekkürler; düzeltilmiş soru hata defterinde. | Soru |
| Arkadaş serisi (P1) | Arkadaş çalıştı, sen çalışmadın; 19:00 | Zeynep bugünkü planını bitirdi | Ortak seriniz 9. günde. | HOME-01 |
| Hoca ödevi (P2) | Ödev atandığında | Selin Hoca yeni ödev verdi | 20 okuma sorusu · teslim 10 Ekim. | Ödev |

### 19.3 E-posta şablonları

**Tasarım:** 600 px tek sütun; logolu başlık; tek birincil düğme (petrol); altta tercih ve abonelikten çık bağlantıları; düz metin sürümü. E-posta istemcileri web yazı tipini yüklemeyebilir, bu yüzden sistem yazı tipi yığını kullanılır. Koyu modda okunur (logo koyu zemin varyantıyla).

| Şablon | Tetik | Konu | İçerik |
| --- | --- | --- | --- |
| Hoş geldin | Kayıt | Planın hazır, ilk adımın burada | Seviye sonucu, ilk görev, uygulama bağlantıları |
| Giriş kodu | Giriş ya da kayıt | Giriş kodun: 482 913 | Büyük ve kopyalanabilir kod, 10 dakika geçerlilik, "Sen değilsen" notu |
| Haftalık rapor (P1) | Pazartesi | Bu hafta 3 sa 10 dk çalıştın | Özet, ustalık değişimleri, gelecek hafta |
| Ödeme makbuzu | Ödeme | Ödemen alındı · Sınav dönemi paketi | Tutar, KDV, dönem, e-Arşiv fatura bağlantısı |
| Deneme süresi bitiyor | 2 gün önce | Ücretsiz deneme 3 Ekim'de bitiyor | Fiyat ve iptal bağlantısı |
| Yenileme hatırlatması | Yıllık planda 7 gün önce | Yıllık planın 1 Kasım'da yenilenecek | Tutar ve yönetim bağlantısı |
| Ödeme alınamadı | Yenileme başarısız | Ödemen alınamadı | Neden, kartı güncelle, 3 günlük ek süre |
| İptal onayı | İptal | Aboneliğin iptal edildi | Bitiş tarihi, geri dönme bağlantısı |
| Sınava 7 gün | Sınavdan 7 gün önce | Son hafta planın | Plan özeti, sınav günü kontrol listesi |
| Verilerin hazır | Veri talebi | Verilerin hazır | 48 saat geçerli indirme bağlantısı |
| Hesap silme talebi | Talep | Hesabın 30 gün içinde silinecek | Talebi iptal bağlantısı |
| Kurum daveti (P1) | Davet | X Üniversitesi seni davet etti | Kurum, hoca, "Katıl" |
| Ödev (P2) | Ödev | Yeni ödev: 20 okuma sorusu | Teslim tarihi, "Başla" |
| Hoca hakedişi (P2) | Ay sonu | Ekim hakedişin | Tutar ve ödeme tarihi |

### 19.4 Uygulama içi duyurular

Yeni özellik duyurusu Bugün ekranında kapatılabilir tek bir bant olarak görünür; aynı anda en çok bir tane. Sürüm notları Ayarlar › Yardım'da.

## 20. Pazarlama sitesi, mağaza görselleri, sosyal medya ve basılı kitap

Ürünün dışındaki her yüzey aynı paleti, yazı tiplerini ve sesi taşır. Pazarlamada iki fark vardır: Bricolage Grotesque başlıklar daha çok sahne alır ve her görselde gerçek ürün ekranı kullanılır.

### 20.1 Pazarlama sitesi

- Ürünün kendisini göster: gerçek ekranlar ve etkileşimli öğretmen demosu; stok görsel yok.
- Her sayfada tek ana çağrı: "Ücretsiz seviye tespitine başla". Kurumsal sayfalarda "siz".
- Rehber ve blog sayfaları okuma tipografisiyle (Literata gövde, 680 px sütun).
- Açık ve koyu tema sistem tercihine göre; bileşenler (fiyat kartı, düğme) uygulamayla ortak.
- Telefonda hızlı açılış: görseller WebP ya da AVIF, yazı tipleri alt kümeli.

### 20.2 Mağaza görselleri

| Varlık | Ölçü | Adet | Not |
| --- | --- | --- | --- |
| App Store iPhone ekran görüntüsü | 1320 × 2868 px (6,9 inç, dikey) | 6–10 | 6,9 inç verilmezse 6,5 inç (1284 × 2778) zorunlu; en çok 10 |
| App Store iPad ekran görüntüsü | 2064 × 2752 px (13 inç, dikey) | 6–10 | Uygulama iPad'de çalışıyorsa zorunlu |
| App Store önizleme videosu | Apple'ın önizleme ölçüleri | 1–3 | İsteğe bağlı |
| Google Play simgesi | 512 × 512 px, 32 bit PNG, en çok 1 MB | 1 | – |
| Google Play öne çıkan görsel | 1024 × 500 px, JPEG ya da 24 bit PNG | 1 | Az yazı: logo ve tek mesaj |
| Google Play telefon ekran görüntüsü | 9:16, en az 1080 × 1920 px | 4–8 | Uzun kenar kısa kenarın iki katını geçemez; en çok 8 |
| Google Play tablet ekran görüntüsü | 16:9 ya da 9:16, uzun kenar en çok 3840 px | 4–8 | Tablet desteği varsa |
| Google Play tanıtım videosu | YouTube bağlantısı | 1 | İsteğe bağlı |

Kaynak: [Apple ekran görüntüsü ölçüleri](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), [Google Play görsel varlıkları](https://support.google.com/googleplay/android-developer/answer/9866151). Teslimden hemen önce yeniden kontrol edilir.

**Ekran görüntüsü sırası:**

1. "Sınavı bilen öğretmen": soru ve ipucu merdiveni.
2. "Her gün sana özel plan": Bugün ekranı.
3. "Hedefin 55 mi? 44 doğru yeter": seviye sonucu ve puan bandı.
4. "ÖSYM biçiminde denemeler": deneme sonucu ve analiz.
5. "Kelimeler tam zamanında": kelime kartı.
6. "Uzun cümleyi çöz": cümle röntgeni.

Kurallar: üstte tek satır başlık (Bricolage), cihaz çerçevesinde gerçek ekran, ilk ikisi açık tema, sonrasında koyu tema da var.

### 20.3 Sosyal medya şablonları

| Şablon | Ölçü | Kullanım |
| --- | --- | --- |
| Instagram gönderisi | 1080 × 1350 | Günün YDS sorusu, hap not kartı (kaydırmalı: soru, sonra cevap) |
| Hikâye, Reels, TikTok, Shorts | 1080 × 1920 | 30–60 sn "1 dakikada YDS sorusu"; üst ve alt %15 yazısız |
| YouTube küçük resmi | 1280 × 720 | Ders videoları |
| LinkedIn gönderisi | 1200 × 1200 | Akademisyen ve kamu kitlesi |
| Bağlantı önizlemesi (OG) | 1200 × 630 | Blog ve araç sayfaları |

Şablon dili: optik form baloncukları, petrol ya da kâğıt zemin, İngilizce soru Literata ile, küçük logo. Videolarda altyazı her zaman açık ve soru ilk 2 saniyede ekranda.

### 20.4 Basılı kitap sistemi (P2)

- **Ebat:** 19,5 × 27,5 cm (sınav kitaplarında yaygın; matbaayla kesinleşir).
- **Renk:** iç sayfalar iki renk (siyah ve petrol spot rengi, Pantone eşleşmesi matbaayla); kapak dört renk.
- **Yazı:** gövde Literata 10–10,5 pt, başlıklar Bricolage; soru numaraları optik form baloncuğu içinde.
- **Düzen:** ÖSYM kitapçığına benzer iki sütunlu soru sayfası; iç kenar 20 mm, dış kenar 15 mm; sayfa başlığında bölüm adı.
- **Karekod:** her soru yanında ve her test sonunda en az 15 × 15 mm, sessiz bölgesi korunmuş; altında kısa adres.
- **Kapak sistemi:** seri renk kodu (Hap Notlar petrol, Okuma Kampı safran tonu), sırt yazısı, arka kapakta uygulama tanıtımı ve kitap içinde 14 günlük Premium kodu alanı.
- **Zorunlu öğeler:** ISBN, bandrol alanı, yayıncı sertifika numarası, künye sayfası, baskı yılı.
- **Dijital eşi:** EPUB 3; uygulama okuyucusunda sayfa birebir değil, akışkan düzen.

### 20.5 Diğer varlıklar

E-posta imzası, kurum satış sunumu şablonu, kartvizit, üniversite tanıtımları için afiş, fuar için roll-up.

## 21. Teslim gereksinimleri

Teslim, geliştiricinin tahmin etmeden kod yazabileceği bir Figma dosyası ve token dışa aktarımıdır. Başarı ekran sayısıyla değil, bileşen ve token tutarlılığıyla ölçülür.

### 21.1 Figma dosya yapısı

| Sayfa | İçerik |
| --- | --- |
| 00 Kapak | Sürüm, değişiklik notları, açık kararlar |
| 01 Temeller | Renk, tipografi, boşluk, ızgara, köşe, yükselti, hareket, ikonlar |
| 02 Temel bileşenler | Bölüm 8.2 |
| 03 Öğrenme bileşenleri | Bölüm 8.3 |
| 04 Desenler | Boş durum, hata, paywall, form, liste |
| 10 Akışlar | Prototipler |
| 11 Telefon / 12 Masaüstü / 13 Tablet | Ekranlar, açık ve koyu |
| 20 Kurum / 21 Hoca / 22 İçerik editörü | Paneller |
| 30 Pazarlama sitesi | Sayfalar |
| 31 E-posta ve bildirim | Şablonlar |
| 32 Mağaza ve sosyal medya | Görseller |
| 33 Marka | Logo, uygulama ikonu, illüstrasyonlar |
| 90 Arşiv | Keşifler ve eski sürümler |

### 21.2 Değişkenler ve stiller

- Figma değişken koleksiyonları: İlkel (renk ölçekleri), Anlamsal (Açık ve Koyu modları), Boşluk, Köşe, Tipografi; yükselti efekt stili olarak.
- Bileşenler yalnızca anlamsal değişkenleri kullanır; ekranda serbest onaltılık kod yoktur.
- Metin stilleri token adlarıyla (display-l … numeric-m); telefon ve masaüstü ayrı stil.
- Kurum aksanı için P2'de ayrı bir "Kurum" modu.

### 21.3 Bileşen kuralları

- Her yerde Auto Layout; sabit genişlikli metin kutusu yok.
- Varyant özellikleri: state, size, type. Tema varyant değil, değişken modudur. İkon ve rozet için boolean, ikon için instance swap.
- Adlandırma "Kategori/Bileşen" (örnek "Soru/Seçenek satırı").
- Her bileşen sayfasında anatomi, durum tablosu, yap / yapma örnekleri ve erişilebilirlik notu.
- İkonlar 24 px çerçeveli bileşen; SVG dışa aktarımında çizgiler şekle dönüştürülmüş sürüm de verilir.

### 21.4 Ekran teslim kuralları

- Ad: kimlik, ad, cihaz ve tema ("HOME-01 Bugün · Telefon · Koyu").
- Çerçeveler: telefon 390 × 844, masaüstü 1440 × 900 (uzun sayfalar aşağı akar), tablet 834 × 1194.
- Her ekranın durum çerçeveleri yan yana: varsayılan, boş, yükleniyor, hata ve varsa kilitli ya da limit.
- Gerçek içerik (Bölüm 22); en uzun metin varyantı ayrı çerçevede.
- Dev Mode notları: etkileşim, hareket token'ı, erişilebilir ad, derin bağlantı.

### 21.5 Token dışa aktarımı

- Figma değişkenleri JSON olarak dışa aktarılır; Style Dictionary ile web için CSS değişkenleri ve Tailwind teması, mobil için React Native tema nesnesi üretilir.
- Adlar her yerde aynı: color.bg.canvas, color.text.primary, space.5, radius.md, type.reading-l.
- Anlamsal adlar değişmez, değerler değişir; her token değişikliği değişiklik günlüğüne yazılır.

```css
:root {
  --color-bg-canvas: #F4F6F5;
  --color-bg-surface: #FFFFFF;
  --color-text-primary: #13232A;
  --color-accent-default: #0E6A6E;
  --space-5: 16px;
  --radius-md: 12px;
}
[data-theme="dark"] {
  --color-bg-canvas: #0E171B;
  --color-bg-surface: #142127;
  --color-text-primary: #E4ECEC;
  --color-accent-default: #4DB6B0;
}
```

### 21.6 Teslim listesi

- [ ] Marka: logo seti, uygulama ikonları (iOS, Android, web), favicon, 17 illüstrasyon (açık ve koyu), 16 özel ikon
- [ ] Temeller sayfası ve değişkenler (açık ve koyu)
- [ ] Temel bileşenler tüm durumlarıyla (Bölüm 8.2)
- [ ] Öğrenme bileşenleri tüm durumlarıyla (Bölüm 8.3)
- [ ] 92 P0 ekranı: telefon ve masaüstü, açık ve koyu, durumlarıyla
- [ ] P0 akış prototipleri (11.1–11.10 ve 11.14)
- [ ] P0 e-posta şablonları ve bildirim görünümleri
- [ ] Pazarlama sitesinin P0 sayfaları
- [ ] Hareket dosyaları: kutlama (Lottie), yükleme baloncukları
- [ ] Token JSON'u ve değişiklik günlüğü
- [ ] Her P0 ekranı için işaretlenmiş erişilebilirlik listesi (Bölüm 17)
- [ ] P1 öncesi mağaza ekran görüntüleri

### 21.7 Kabul ölçütleri

- Ekranlarda serbest onaltılık kod ve bağımsız metin stili yok.
- Her ekranın açık ve koyu sürümü var ve aynı bileşenlerden oluşuyor.
- HOME-01, STUDY-07, EXAM-03 ve PAY-01 için %200 yazı boyutu çerçevesi çizilmiş.
- Prototipte P0 akışları kesintisiz tamamlanıyor.
- Geliştirici "bu nasıl davranır?" sorusunu Dev Mode notundan cevaplayabiliyor.

### 21.8 Tasarım takvimi

Tasarım Ekim başında başlar, geliştirme Kasım ortasında bileşenlerle ona katılır; hedef, 2027-YDS/1 başvurularından önce Şubat 2027 başında yayın.

&#91;embedded content: tasarım takvimi · Ekim 2026 – Nisan 2027\]

Tasarım ve geliştirme Kasım ortasından itibaren paralel yürür; P0 tasarım teslimi yayından yaklaşık 7 hafta önce biter. 2027 ÖSYM takvimi açıklanınca yayın tarihi kesinleşir.

## 22. Açık kararlar, sözlük ve örnek içerik

On iki karar henüz açık; tasarımcı ilgili ekrana gelmeden önce kapatılmalı. Altındaki sözlük ve örnek içerik, mockup'larda yer tutucu metin yerine kullanılır.

### 22.1 Açık kararlar

| Karar | Seçenekler | Önerimiz | Kim, ne zaman |
| --- | --- | --- | --- |
| Marka adı | Etüt, Hapnot, Pusula ya da yeni öneri | Tescil kontrolüne göre | Ürün sahibi, Ekim 2026 sonu |
| Öğretmenin adı | Yalnızca "Öğretmen" ya da özel bir ad | "Öğretmen" | Ürün sahibi ve tasarımcı |
| Hitap | Her yerde "sen" ya da kurumda "siz" | Öğrenciye "sen", kurum ve yasal metinde "siz" | Ürün sahibi |
| Kâğıt deneme modu ve koyu tema | Tema izlenir ya da kâğıt hep beyaz | Tema izlenir; "Gerçekçi mod" ayarıyla beyaz | Tasarımcı |
| Sıralama tabloları | Varsayılan açık ya da kapalı | Kapalı; kampta isteğe bağlı | Ürün sahibi |
| Kelime kartında kaydırma | Varsayılan açık ya da kapalı | Kapalı; düğmeler daha erişilebilir | Tasarımcı |
| Ücretsiz plan limitleri | 15 soru, 5 mesaj, ayda 1 mini deneme | Pilot verisiyle ayarlanır | Ürün sahibi, Faz 1 |
| Yanlışta ikinci deneme | Var ya da yok | Var (öğrenme modunda) | Tasarımcı ve içerik ekibi |
| Kurum beyaz etiket kapsamı | Logo ve aksan ya da tam | Logo ve aksan (P2) | Ürün sahibi |
| Android dinamik renk | Açık ya da kapalı | Kapalı | Tasarımcı |
| Seslendirme | Kelime telaffuzu ve sohbet seslendirme | Telaffuz P1, sohbet seslendirme P3 | Ürün sahibi |
| İllüstrasyon | İçeride ya da serbest illüstratör | Bu dokümandaki stil rehberiyle serbest illüstratör | Ürün sahibi |

### 22.2 Sözlük

| Terim | Anlamı |
| --- | --- |
| YDS | Yabancı Dil Bilgisi Seviye Tespit Sınavı; ÖSYM yapar, kâğıt üzerinde, yılda iki kez |
| e-YDS | YDS'nin ÖSYM elektronik sınav merkezlerinde bilgisayarla yapılan sürümü |
| YÖKDİL | Yükseköğretim Kurumları Yabancı Dil Sınavı; Fen, Sağlık ve Sosyal alanları |
| ÖSYM | Ölçme, Seçme ve Yerleştirme Merkezi |
| Kök | Sorunun soru cümlesi ya da boşluklu cümlesi |
| Çeldirici | Yanlış ama inandırıcı seçenek |
| Cloze test | Paragraf içindeki numaralı boşluklara kelime ya da yapı seçme |
| Optik form ve kitapçık | Cevapların baloncuk doldurularak işaretlendiği kâğıt ve soruların basılı olduğu kitapçık |
| Hap not | Tek ekranlık kısa konu notu |
| İpucu merdiveni | Öğretmenin dört basamaklı ipucu dizisi |
| Ustalık | Bir becerideki tahmini başarı yüzdesi (0–100) |
| Tahmini puan | Öğrencinin şu an sınava girse alacağı puan aralığı |
| FSRS | Tekrar zamanını belirleyen açık kaynak algoritma |
| Blueprint | Bir sınavın soru tipi, adet, süre ve puanlama tanımı |
| Pilot soru | Yayına alınmadan önce ilk 100–200 cevapla ölçülen soru |
| Dil tazminatı | 70 ve üzeri puana kamu personeline ödenen aylık ek ödeme |

### 22.3 YDS'nin soru dağılımı

| Soru tipi | Adet | Soru tipi | Adet |
| --- | --- | --- | --- |
| Kelime ve phrasal verb | 6 | Okuma | 20 |
| Dil bilgisi | 10 | Diyalog tamamlama | 5 |
| Cloze test | 10 | Yakın anlamlı cümle | 4 |
| Cümle tamamlama | 10 | Paragraf tamamlama | 4 |
| Çeviri | 6 | Anlamı bozan cümle | 5 |

Toplam 80 soru, 180 dakika; her doğru 1,25 puan.

### 22.4 Mockup'larda kullanılacak örnek içerik

Tüm örnekler özgündür; yayına girmeden önce uzman onayı gerekir.

**Örnek kullanıcılar**

- **Elif** (mevcut kullanıcı): hedef 70 (56 doğru), sınav 2026-YDS/2 · 22 Kasım, 52 gün kaldı; tahmini puan 61–67; seri 12 gün; bugünkü plan 45 dk; son deneme 47 doğru · 58,75 puan, hedefe 9 doğru.
- **Zeynep** (yeni kullanıcı): hedef 55 (44 doğru); seviye tespiti sonucu 48–56.
- **Kurum ve hoca:** "Örnek Üniversitesi Sosyal Bilimler Enstitüsü", Selin Hoca.
- **Fiyatlar:** 349 TL/ay, 1.490 TL sınav dönemi, 2.490 TL yıllık, 1.790 TL kurucu üye.

**Dil bilgisi sorusu**

"\_\_\_\_\_\_ the new vaccine proved effective in early trials, regulators delayed its approval until long-term safety data became available." A) Unless B) Although C) Because D) As long as E) Once. Doğru: B. İpucu 1: "İki kısım arasında neden–sonuç mu var, zıtlık mı?" İpucu 2: "'proved effective' olumlu; 'delayed its approval' beklenmedik." Çözüm: "Beklentiye ters sonuç zıtlık ister: Although."

**Kelime sorusu**

"The researchers were unable to \_\_\_\_\_\_ the results of the earlier study, which raised doubts about its methodology." A) replicate B) undermine C) disclose D) anticipate E) restrain. Doğru: A.

**Cümle tamamlama**

"Although social media allows people to stay in touch with distant friends, \_\_\_\_\_\_." A) it has also been linked to feelings of loneliness among heavy users B) many people therefore use it every day C) because it is free for most users D) which explains its global popularity E) so that friendships can last longer. Doğru: A.

**Çeviri**

"Despite decades of research, scientists still disagree on how the human brain stores long-term memories." Doğru seçenek: "Onlarca yıllık araştırmaya rağmen bilim insanları, insan beyninin uzun süreli anıları nasıl depoladığı konusunda hâlâ fikir ayrılığı içinde."

**Okuma parçası (sağlık)**

"Sleep plays a central role in the consolidation of memory. During deep sleep, the brain replays patterns of activity that occurred during the day, strengthening the connections that support new learning. Studies in which participants were deprived of sleep after learning a task have consistently shown weaker recall the following day, even when they were allowed to sleep normally afterwards. These findings suggest that the hours immediately after learning are particularly sensitive, a point that has practical implications for students who sacrifice sleep to study late into the night."

Soru: "According to the passage, students who stay up late to study \_\_\_\_\_\_." A) may undermine the very learning they are trying to achieve B) remember more because they review longer C) recover fully if they sleep normally the next night D) strengthen connections during deep sleep E) should study only in the morning. Doğru: A.

**Cümle röntgeni**

"Although antibiotics have saved millions of lives since their discovery, their overuse in agriculture, which accounts for a large share of global consumption, has accelerated the emergence of resistant bacteria that now threaten routine medical procedures." İskelet: overuse → has accelerated → emergence.

### 22.5 Kaynaklar

- [YDS Platform Stratejisi](https://claude.ai/artifact/9kv3qcmZsSTS1RsHr1tbxT): pazar, rakipler, fiyatlar, sınav verileri
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Apple ekran görüntüsü ölçüleri](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) ve [Google Play görsel varlıkları](https://support.google.com/googleplay/android-developer/answer/9866151)
- Yazı tipleri: [Figtree](https://fonts.google.com/specimen/Figtree), [Literata](https://fonts.google.com/specimen/Literata), [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque); ikonlar: [Lucide](https://lucide.dev)
