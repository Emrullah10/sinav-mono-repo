---
name: YDS Platformu Koyu
colors:
  background: '#0E171B'
  surface: '#142127'
  surface-container: '#1B2B32'
  surface-container-high: '#16363A'
  on-surface: '#E4ECEC'
  on-surface-variant: '#A9B8BA'
  outline: '#71838A'
  outline-variant: '#24343A'
  primary: '#4DB6B0'
  on-primary: '#0E171B'
  primary-container: '#16363A'
  on-primary-container: '#87CDC8'
  secondary: '#F0B43A'
  on-secondary: '#0E171B'
  secondary-container: '#3A2E12'
  tertiary: '#4CC27D'
  tertiary-container: '#163524'
  error: '#EE8A6E'
  error-container: '#3D211A'
  inverse-surface: '#E4ECEC'
  chart-1: '#04A19B'
  chart-2: '#7483E0'
  chart-3: '#C0851F'
  chart-4: '#C06099'
typography:
  display-l: {fontFamily: Bricolage Grotesque, fontSize: 56px, fontWeight: '700', lineHeight: 60px, letterSpacing: -0.02em}
  display-m: {fontFamily: Bricolage Grotesque, fontSize: 40px, fontWeight: '700', lineHeight: 44px, letterSpacing: -0.015em}
  headline-lg: {fontFamily: Figtree, fontSize: 32px, fontWeight: '700', lineHeight: 40px, letterSpacing: -0.01em}
  headline-md: {fontFamily: Figtree, fontSize: 24px, fontWeight: '700', lineHeight: 32px}
  headline-sm: {fontFamily: Figtree, fontSize: 20px, fontWeight: '600', lineHeight: 28px}
  title: {fontFamily: Figtree, fontSize: 16px, fontWeight: '600', lineHeight: 22px}
  body-lg: {fontFamily: Figtree, fontSize: 18px, fontWeight: '400', lineHeight: 28px}
  body-md: {fontFamily: Figtree, fontSize: 16px, fontWeight: '400', lineHeight: 24px}
  body-sm: {fontFamily: Figtree, fontSize: 14px, fontWeight: '400', lineHeight: 20px}
  label-lg: {fontFamily: Figtree, fontSize: 16px, fontWeight: '600', lineHeight: 20px}
  label-md: {fontFamily: Figtree, fontSize: 14px, fontWeight: '600', lineHeight: 18px}
  caption: {fontFamily: Figtree, fontSize: 12px, fontWeight: '400', lineHeight: 16px}
  overline: {fontFamily: Figtree, fontSize: 11px, fontWeight: '700', lineHeight: 14px, letterSpacing: 0.08em}
  reading-l: {fontFamily: Literata, fontSize: 18px, fontWeight: '400', lineHeight: 29px}
  reading-m: {fontFamily: Literata, fontSize: 17px, fontWeight: '400', lineHeight: 27px}
  reading-s: {fontFamily: Literata, fontSize: 16px, fontWeight: '400', lineHeight: 25px}
  numeric-xl: {fontFamily: Figtree, fontSize: 48px, fontWeight: '700', lineHeight: 52px}
rounded: {xs: 4px, sm: 8px, DEFAULT: 12px, md: 12px, lg: 16px, xl: 24px, full: 9999px}
spacing: {space-1: 2px, space-2: 4px, space-3: 8px, space-4: 12px, space-5: 16px, space-6: 20px, space-7: 24px, space-8: 32px, space-9: 40px, space-10: 48px, space-11: 64px}
---

## Brand & Style
YDS sinavina hazirlanan yetiskinler (22-45 yas) icin sakin, okunakli, guvenilir ve sicak bir egitim urunu. Turkce arayuz. Mascot, emoji yuzu, konfeti, gradyan ve cam efekti YOK. Ana motif: OSYM optik formundaki cevap baloncugu (tam daire; dolu = secildi/tamamlandi, bos = bekliyor).

## Colors (DARK theme)
- Zemin #0E171B, kart #142127, metin #E4ECEC, ikincil metin #A9B8BA.
- Petrol #4DB6B0 ana renk (birincil dugme, secili sekme, ogretmen). Dugme uzerindeki yazi #0E171B.
- Safran #F0B43A yalnizca dolgu/ikon (seri, hedef cizgisi, kutlama); uzerindeki yazi koyu. ASLA metin rengi degil.
- Dogru = yesil #4CC27D on #163524 + onay ikonu + "Dogru" yazisi. Yanlis = tugla #EE8A6E on #3D211A + carpi ikonu + yazi. Durum asla yalnizca renkle anlatilmaz. Alarm kirmizisi yok.
- Bos birakilan soru: #9AA7A8 on #22343B.
- Cizgiler: #24343A (varsayilan), #33474E (vurgulu), giris alani kenari #71838A.
- Grafik serileri sirayla: #04A19B, #7483E0, #C0851F, #C06099.
- Oran: ekranin %80 notr, %15 petrol, en fazla %5 safran ve durum renkleri.

## Typography
Arayuz Figtree, okuma metinleri (soru koku, secenekler, okuma parcasi, ornek cumleler) Literata serif, buyuk marka basliklari Bricolage Grotesque (ekran basina en cok bir tane). Sayilar tablo rakamlari. Turkce karakterler eksiksiz. Okuma metni 17-18px, satir 1.6, en fazla 680px sutun, sola yasli.

## Layout & Spacing
4px tabanli olcek. Telefon 390pt: kenar 16, alt sekme cubugu 5 sekme (Bugun, Calis, Deneme, Ogretmen, Ben) etiketli. Masaustu 1440px: sol kenar cubugu 248px, ust cubuk 64px, icerik en cok 760px (okuma 680px), soru/deneme ekraninda sagda 380px ogretmen paneli. Dokunma hedefi en az 44pt, secenek satiri en az 56pt.

## Elevation
Kart: 1px kenar, golge yok. Menu/popover hafif golge. Modal ve alt sayfa scrim ile. Koyu temada golge gorunmez; yukselti daha acik yuzeyle anlatilir.

## Shapes
4px etiket/onay kutusu, 8px kucuk dugme, 12px dugme/giris/secenek satiri, 16px kart/soru kutusu, 24px alt sayfa/modal, tam yuvarlak cip/rozet/avatar/cevap baloncugu.

## Components
- **Dugme boyutlari:** Buyuk 52px (tam genislik birincil, telefonda alt sabit), Orta 44px (varsayilan), Kucuk 36px (tablo ici, cip yaninda). Turler: Birincil (petrol dolu), Ikincil (cerceveli), Ucuncul (metin), Yikici (tugla cerceveli). Ekran basina tek birincil. Etiket fiille baslar: "Kontrol et", "Devam et".
- **Onay kutusu (centik):** 20px kutu, 4px kose, secili petrol dolu + beyaz/koyu centik, dokunma hedefi 44px; durumlar: bos, secili, kararsiz (cizgi), pasif, hata, odak. Buyuk (24px) ve kucuk (16px) boyut. Radyo ve anahtar ayni dilde.
- **Secenek satiri:** 24px cevap baloncugu icinde harf A-E, Literata metin, durumlar: varsayilan, secili (2px petrol kenar, dolu baloncuk), dogru, yanlis, elendi (ustu cizili).
- **Ipucu merdiveni:** Odak, Kural, Eleme, Cozum; ogretmen kartinda petrol acik zeminde.
- **Cip, rozet, etiket, ilerleme cubugu/halkasi, puan bandi (tahmin araligi + hedef cizgisi), soru gezgini (1-80 baloncuk), kelime karti, hap not karti, plan gorevi, seri rozeti.**
- Odak halkasi: 2px petrol + 2px bosluk.
