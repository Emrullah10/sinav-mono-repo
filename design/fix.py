#!/usr/bin/env python3
"""Denetimde işaretlenen ekranlar için qa/redo.json yazar; ardından:
python3 design/run_stitch.py --redo --workers 4  (ve  python3 design/qa.py)"""
import json, pathlib
D = pathlib.Path(__file__).resolve().parent
FIX = {
 "Gradyan kullanımı": "Hiçbir yerde gradyan kullanma; yalnızca düz renk.",
 "Cam/blur efekti": "backdrop-blur, cam efekti ve yarı saydam bulanık yüzey kullanma; opak düz yüzey ve 1px kenarlık kullan.",
 "Emoji": "Emoji kullanma; yalnızca çizgi ikon.",
 "Lorem ipsum": "Yer tutucu metin kullanma; gerçekçi Türkçe içerik yaz.",
 "İngilizce başlık parantezi": "Başlık ve etiketlerde İngilizce parantez veya çeviri YAZMA (örneğin '(Color System)' yok); tüm arayüz metni yalnızca Türkçe.",
 "'Net' terimi": "'Net' kelimesini kullanma; yalnızca 'doğru' ve 'puan' (YDS'de yanlış doğruyu götürmez).",
 "2025 tarihi": "Tarihler 2026 olsun: bugün 2 Ekim 2026, sınav 2026-YDS/2 · 22 Kasım 2026, 52 gün kaldı.",
 "Teknik jargon": "IndexedDB, 256-bit, protokol, şifreleme gibi teknik ifadeleri kaldır; ekran sade olsun.",
 "Logoda sınav adı": "Logo/marka adı yalnızca 'ODAK' olsun, 'YDS' içermesin; etkin sınav ayrı küçük çip olarak gösterilsin.",
 "Okuma serif (Literata)": "Soru kökü, seçenekler ve okuma metinleri Literata serif yazı tipiyle olsun.",
 "Arayüz yazı tipi": "Arayüz yazı tipi olarak DM Sans/Figtree benzeri sans tanımla.",
}
qa = json.load((D / "qa/qa.json").open())
import sys
sel = sys.argv[1] if len(sys.argv) > 1 else ""
out = {}
for k, v in qa.items():
    if not v["sorun"] or (sel and sel not in k): continue
    parts = [FIX[r] for r in v["kurallar"] if r in FIX]
    if v["palet_disi_oran"] > .35 or v.get("alarm_kirmizi_veya_saf_mavi"):
        parts.append("Renkleri yalnızca verilen paletle sınırla; standart parlak yeşil/kırmızı/mavi/mor kullanma.")
    if v["tema_uyumsuz"]: parts.append("Tema tamamen bu varyasyonun temasıyla uyumlu olsun.")
    if not v.get("ds") or not v.get("shot"): parts.append("Ekranı eksiksiz üret.")
    if parts: out[k] = " ".join(parts)
(D / "qa/redo.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(out), "ekran yeniden üretilecek")
