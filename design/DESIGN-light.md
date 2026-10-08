---
name: YDS Platformu Acik
colors:
  background: '#F4F6F5'
  surface: '#FFFFFF'
  surface-container: '#FFFFFF'
  surface-container-high: '#DCEDEC'
  on-surface: '#13232A'
  on-surface-variant: '#46565C'
  outline: '#77868A'
  outline-variant: '#DAE1E0'
  primary: '#0E6A6E'
  on-primary: '#FFFFFF'
  primary-container: '#DCEDEC'
  on-primary-container: '#0A5458'
  secondary: '#E9A514'
  on-secondary: '#13232A'
  secondary-container: '#FBEFD2'
  tertiary: '#1F7A45'
  tertiary-container: '#DFF1E6'
  error: '#A33D27'
  error-container: '#F8E3DC'
  inverse-surface: '#13232A'
  chart-1: '#0F9485'
  chart-2: '#505AC8'
  chart-3: '#BA7F14'
  chart-4: '#9E427B'
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

## Colors (LIGHT theme)
- Zemin #F4F6F5, kart #FFFFFF, metin #13232A, ikincil metin #46565C.
- Petrol #0E6A6E ana renk (birincil dugme, secili sekme, ogretmen). Dugme uzerindeki yazi #FFFFFF.
- Safran #E9A514 yalnizca dolgu/ikon (seri, hedef cizgisi, kutlama); uzerindeki yazi koyu. ASLA metin rengi degil.
- Dogru = yesil #1F7A45 on #DFF1E6 + onay ikonu + "Dogru" yazisi. Yanlis = tugla #A33D27 on #F8E3DC + carpi ikonu + yazi. Durum asla yalnizca renkle anlatilmaz. Alarm kirmizisi yok.
- Bos birakilan soru: #5E6B70 on #E9EDEC.
- Cizgiler: #DAE1E0 (varsayilan), #C3CDCC (vurgulu), giris alani kenari #77868A.
- Grafik serileri sirayla: #0F9485, #505AC8, #BA7F14, #9E427B.
- Oran: ekranin %80 notr, %15 petrol, en fazla %5 safran ve durum renkleri.

## Typography
Arayuz Figtree, okuma metinleri (soru koku, secenekler, okuma parcasi, ornek cumleler) Literata serif, buyuk marka basliklari Bricolage Grotesque (ekran basina en cok bir tane). Sayilar tablo rakamlari. Turkce karakterler eksiksiz. Okuma metni 17-18px, satir 1.6, en fazla 680px sutun, sola yasli.

## Layout & Spacing
4px tabanli olcek. Telefon 390pt: kenar 16, alt sekme cubugu 5 sekme (Bugun, Calis, Deneme, Ogretmen, Ben) etiketli. Masaustu 1440px: sol kenar cubugu 248px, ust cubuk 64px, icerik en cok 760px (okuma 680px), soru/deneme ekraninda sagda 380px ogretmen paneli. Dokunma hedefi en az 44pt, secenek satiri en az 56pt.

## Elevation
Kart: 1px kenar, golge yok. Menu/popover hafif golge. Modal ve alt sayfa scrim ile. Acik temada golge cok hafif.

## Shapes
4px etiket/onay kutusu, 8px kucuk dugme, 12px dugme/giris/secenek satiri, 16px kart/soru kutusu, 24px alt sayfa/modal, tam yuvarlak cip/rozet/avatar/cevap baloncugu.

## Components
- **Dugme boyutlari:** Buyuk 52px (tam genislik birincil, telefonda alt sabit), Orta 44px (varsayilan), Kucuk 36px (tablo ici, cip yaninda). Turler: Birincil (petrol dolu), Ikincil (cerceveli), Ucuncul (metin), Yikici (tugla cerceveli). Ekran basina tek birincil. Etiket fiille baslar: "Kontrol et", "Devam et".
- **Onay kutusu (centik):** 20px kutu, 4px kose, secili petrol dolu + beyaz/koyu centik, dokunma hedefi 44px; durumlar: bos, secili, kararsiz (cizgi), pasif, hata, odak. Buyuk (24px) ve kucuk (16px) boyut. Radyo ve anahtar ayni dilde.
- **Secenek satiri:** 24px cevap baloncugu icinde harf A-E, Literata metin, durumlar: varsayilan, secili (2px petrol kenar, dolu baloncuk), dogru, yanlis, elendi (ustu cizili).
- **Ipucu merdiveni:** Odak, Kural, Eleme, Cozum; ogretmen kartinda petrol acik zeminde.
- **Cip, rozet, etiket, ilerleme cubugu/halkasi, puan bandi (tahmin araligi + hedef cizgisi), soru gezgini (1-80 baloncuk), kelime karti, hap not karti, plan gorevi, seri rozeti.**
- Odak halkasi: 2px petrol + 2px bosluk.
