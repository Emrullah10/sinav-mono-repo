#!/usr/bin/env python3
"""Tasarım tutarlılık denetimi. Biten her ekranın HTML'ini indirir ve kurallara göre puanlar.
Kullanım: python3 design/qa.py [--module M04-STUDY]  ->  design/qa/report.md, design/qa/qa.json"""
import json, re, subprocess, pathlib, argparse, urllib.request, collections, colorsys

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "design"
(D / "html").mkdir(exist_ok=True); (D / "qa").mkdir(exist_ok=True)
PROJ = (ROOT / ".env.stitch").read_text().split("STITCH_PROJECT_ID=")[1].split()[0]
PROJS = [PROJ, "6998430549694410931", "1306830902736940837"]

PALETTE = {h.upper() for h in """
#F2F8F8 #DCEDEC #B4DEDB #87CDC8 #4DB6B0 #2D8D8D #0E6A6E #0A5458 #0B4043 #0A2F31 #041F21
#FBF7ED #FBEFD2 #F8DEA7 #F4CB78 #F0B43A #E9A514 #B68116 #91650B #714E04 #523700 #382501
#F3F9F5 #DFF1E6 #B5E5C7 #83D2A1 #4CC27D #359D60 #1F7A45 #026333 #014D26 #04381B #00240F
#FCF5F2 #F8E3DC #F8C8B8 #F3A992 #EE8A6E #C9654B #A33D27 #8C2711 #6C1F0F #51190D #370C05
#FFFFFF #F4F6F5 #E9EDEC #DAE1E0 #C3CDCC #9AA7A8 #77868A #5E6B70 #46565C #2A3A40 #13232A
#0E171B #142127 #1B2B32 #22343B #24343A #33474E #4A5F66 #E4ECEC #A9B8BA #8D9DA1 #D3DCDC
#16363A #163524 #3D211A #3A2E12 #1F2F35 #71838A #5C6D72 #0F9485 #505AC8 #BA7F14 #9E427B
#04A19B #7483E0 #C0851F #C06099 #A3B1B0 #4F646A #000000
""".split()}

def hex_to_hsl(h):
    h = h.lstrip("#");
    if len(h) == 3: h = "".join(c * 2 for c in h)
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    return hh * 360, s, l

def near_palette(h):
    """Palette'e yakın mı (renk uzayında kaba mesafe)?"""
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    for p in PALETTE:
        q = [int(p[i:i + 2], 16) for i in (1, 3, 5)]
        if sum((a - b) ** 2 for a, b in zip(c, q)) ** .5 <= 22:
            return True
    return False

def lum(h):
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]

def get_html(key, sid):
    f = D / "html" / f"{key}.html"
    if f.exists(): return f.read_text(encoding="utf-8", errors="ignore")
    t = ""
    for pr in PROJS:
        r = subprocess.run(["stitch", "get", "screen", sid, "-p", pr, "--format", "json"], capture_output=True, text=True)
        try:
            u = json.loads(r.stdout)["data"]["htmlCode"]["downloadUrl"]
            t = urllib.request.urlopen(u, timeout=60).read().decode("utf-8", "ignore")
            break
        except Exception:
            continue
    if not t:
        return ""
    f.write_text(t, encoding="utf-8")
    return t

EMOJI = re.compile("[\U0001F300-\U0001FAFF]")
RULES = [
    ("'Net' terimi", lambda h, k: bool(re.search(r">[^<]*\b\d+[.,]?\d*\s*Net\b|>\s*Net\s*<|Net Puan|Net Say", h)), "'net' kelimesi yok"),
    ("2025 tarihi", lambda h, k: bool(re.search(r"(?:Ekim|Kasım|Eylül|Nisan|Mayıs)\s+2025|2025-YDS|2025/\d", h)), "bağlam 2026"),
    ("Teknik jargon", lambda h, k: bool(re.search(r"IndexedDB|256-bit|şifreli oturum|Oturum Protokol", h, re.I)), "teknik jargon yok"),
    ("Logoda sınav adı", lambda h, k: bool(re.search(r"ODAK\s*YDS|>\s*YDS\s*Platform", h)), "logo sınavdan bağımsız"),
    ("Gradyan kullanımı", lambda h, k: bool(re.search(r"gradient", h, re.I)), "gradyan yok (pazarlamada hafif zemin geçişi hariç)"),
    ("Emoji", lambda h, k: bool(EMOJI.search(re.sub(r"<(script|style)[\s\S]*?</\1>", "", h))), "emoji yok"),
    ("Lorem ipsum", lambda h, k: bool(re.search(r"lorem ipsum", h, re.I)), "yer tutucu metin yok"),
    ("Cam/blur efekti", lambda h, k: bool(re.search(r"backdrop-blur-(?!none)|backdrop-filter:\s*(?!none)", h)), "glassmorphism yok"),
    ("Okuma serif (Literata)", lambda h, k: any(x in k for x in ("STUDY-0", "STUDY-1", "EXAM-03", "CMP-06", "CMP-08")) and "Literata" not in h, "soru/okuma ekranlarında Literata"),
    ("Arayüz yazı tipi", lambda h, k: not re.search(r"Figtree|DM Sans|DM_Sans|Plus Jakarta|Inter", h), "sans yazı tipi tanımlı değil"),
    ("İngilizce başlık parantezi", lambda h, k: not k.startswith(("STUDY-0", "STUDY-1", "EXAM-03", "CMP-06", "CMP-08", "FND-02")) and bool(re.search(r"<h[1-4][^>]*>[^<]*\((?:[A-Z][A-Za-z]+[ /&,]*){1,5}\)", h)), "başlıkta İngilizce parantez"),
]

def check(key, html, theme):
    res = {}
    hexes = [x.upper() for x in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", html)]
    hexes = [("#" + "".join(c * 2 for c in x[1:])) if len(x) == 4 else x for x in hexes]
    cnt = collections.Counter(hexes)
    tot = sum(cnt.values()) or 1
    off = {h: n for h, n in cnt.items() if not near_palette(h)}
    res["palet_disi_oran"] = round(sum(off.values()) / tot, 3)
    res["palet_disi_ornek"] = [h for h, _ in sorted(off.items(), key=lambda x: -x[1])[:6]]
    # alarm kırmızısı / saf mavi vb.
    bad = [h for h in cnt if (lambda hsl: (hsl[1] > .75 and (hsl[0] < 12 or hsl[0] > 348) and .35 < hsl[2] < .6) or (hsl[1] > .85 and 205 < hsl[0] < 235))(hex_to_hsl(h))]
    res["alarm_kirmizi_veya_saf_mavi"] = bad[:4]
    # tema: gövde arka planı
    bg = re.search(r"body[^{]*\{[^}]*background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})", html)
    cls = re.search(r"<(?:html|body)[^>]*class=\"([^\"]*)\"", html)
    dark_flag = bool(cls and "dark" in cls.group(1).split())
    res["tema_html_sinifi_dark"] = dark_flag
    res["tema_uyumsuz"] = (theme == "koyu" and not dark_flag and not (bg and lum(bg.group(1)) < .15)) or (theme == "acik" and dark_flag)
    res["kurallar"] = [name for name, fn, _ in RULES if name and fn(html, key)]
    res["turkce_karakter"] = bool(re.search(r"[ığşçöüİĞŞÇÖÜ]", html))
    # küçük dokunma hedefi: h-6/h-7/h-8 butonlar
    small = len(re.findall(r"<button[^>]*class=\"[^\"]*\bh-(?:4|5|6|7|8)\b", html))
    res["kucuk_dokunma_hedefi_dugme"] = small
    res["bytes"] = len(html)
    return res

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--module")
    a = ap.parse_args()
    state = json.load((D / "state.json").open())
    qa = json.load((D / "qa/qa.json").open()) if (D / "qa/qa.json").exists() else {}
    for key, v in state.items():
        if not v.get("done") or (a.module and a.module not in str(v.get("title", "")) and False):
            continue
        if key in qa: continue
        theme = key.rsplit("-", 1)[1]
        html = get_html(key, v["screen"])
        html = re.sub(r"--tw-[\w-]+:\s*[^;}]*[;}]|transition-property:[^;}]*|\.bg-gradient-to-[\w-]+\{[^}]*\}|\.backdrop-(?:[\w-]|\\.)+\{[^}]*\}|<!--[\s\S]*?-->|\balt=\"[^\"]*\"|/\*[\s\S]*?\*/", "", html)  # Tailwind'in boş değişkenleri (yanlış alarm)
        qa[key] = dict(check(key, html, theme), screen=v["screen"], url=v.get("url"), ds=v.get("ds"), shot=v.get("shot"))
        qa[key]["sorun"] = bool(not html or qa[key]["tema_uyumsuz"] or qa[key]["kurallar"] or qa[key]["palet_disi_oran"] > .35 or not v.get("shot"))
    json.dump(qa, (D / "qa/qa.json").open("w"), ensure_ascii=False, indent=1)
    bad = {k: v for k, v in qa.items() if v["sorun"]}
    lines = [f"# Tasarım denetimi\n\n{len(qa)} varyasyon denetlendi, {len(bad)} tanesi işaretli.\n",
             "| Varyasyon | Sorun | Palet dışı | Palet dışı örnek |", "|---|---|---|---|"]
    for k, v in sorted(bad.items()):
        why = ", ".join(filter(None, ["tema uyumsuz" if v["tema_uyumsuz"] else "", *v["kurallar"], "tasarım sistemi yok" if not v.get("ds") else "", "görsel yok" if not v.get("shot") else ""]))
        lines.append(f"| {k} | {why or 'palet dışı renk fazla'} | %{int(v['palet_disi_oran'] * 100)} | {' '.join(v['palet_disi_ornek'])} |")
    (D / "qa/report.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(qa)} denetlendi, {len(bad)} işaretli")
    for k, v in list(bad.items())[:15]: print(k, v["kurallar"], v["tema_uyumsuz"], v["palet_disi_oran"])
