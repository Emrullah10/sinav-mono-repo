#!/usr/bin/env python3
"""Denetimde işaretli web ekranlarını Stitch kredisi harcamadan düzeltir.
HTML'e local_fix.js enjekte edilir, Brave headless ile düzeltilmiş DOM ve yeni ekran görüntüsü alınır.
Kullanım: python3 design/local_fix.py [--all] [anahtar ...]"""
import json, re, subprocess, sys, pathlib, shutil, tempfile
from PIL import Image
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import qa
D = qa.D
BRAVE = str(pathlib.Path.home() / "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell")
JS = (D / "local_fix.js").read_text()
FIXABLE = {"'Net' terimi", "2025 tarihi", "Teknik jargon", "Logoda sınav adı", "Gradyan kullanımı", "Cam/blur efekti", "İngilizce başlık parantezi"}
TMP = pathlib.Path(tempfile.mkdtemp())
JOBS = []
PW = str(pathlib.Path.home() / ".npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")
(D / "html_orig").mkdir(exist_ok=True)

def brave(*a, timeout=120):
    return subprocess.run([BRAVE, "--disable-gpu", "--hide-scrollbars", *a], capture_output=True, text=True, timeout=timeout)

def trim(png):
    im = Image.open(png).convert("RGB"); w, h = im.size
    px = im.load(); bg = px[w // 2, h - 1]
    y = h - 1
    while y > 200 and all(px[x, y] == bg for x in range(0, w, 7)): y -= 1
    im.crop((0, 0, w, min(h, y + 40))).save(png)

def fix(key, state):
    v = state[key]
    html = qa.get_html(key, v["screen"])
    if not html: return "html yok"
    orig = D / "html_orig" / f"{key}.html"
    if not orig.exists(): orig.write_text(html, encoding="utf-8")
    html = orig.read_text(encoding="utf-8")
    # başlık anahtarları her zaman Bricolage (Literata yalnızca okuma metni)
    html = re.sub(r'fontFamily"?\s*:\s*\{[^}]*\}', lambda m: re.sub(r'(["\']?)([\w-]*(?:headline|display|title|heading|h1|h2|h3)[\w-]*)\1\s*:\s*\[[^\]]*\]', r'"\2": ["Bricolage Grotesque"]', m.group(0)), html, count=1)
    if "Bricolage+Grotesque" not in html:
        html = html.replace("</head>", '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&display=swap" rel="stylesheet"></head>', 1)
    fb = re.search(r'fontFamily"?\s*:\s*\{[^}]*\}', html)
    if fb and not re.search(r"Figtree|DM Sans|DM_Sans", fb.group(0)):  # tasarım sistemi dışı yazı tipi -> Figtree/Bricolage
        def fam(m):
            blk = re.sub(r'(["\']?)([\w-]*(?:headline|display|title|heading)[\w-]*)\1\s*:\s*\[[^\]]*\]', r'"\2": ["Bricolage Grotesque"]', m.group(0))
            return re.sub(r'(:\s*)\[\s*["\'](?!Bricolage|Literata)[^"\'\]]+["\'][^\]]*\]', r'\1["Figtree"]', blk)
        html = re.sub(r'fontFamily"?\s*:\s*\{[^}]*\}', fam, html, count=1)
        html = html.replace("</head>", '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Bricolage+Grotesque:wght@600;700;800&family=Literata:wght@400;500;600&display=swap" rel="stylesheet"></head>', 1)
    inj = html.replace("</body>", f'<script id="odak-fix">{JS}</script></body>') if "</body>" in html else html + f'<script id="odak-fix">{JS}</script>'
    src = TMP / f"{key}.html"; src.write_text(inj, encoding="utf-8")
    shot = next((D / "shots").glob(f"*/{key}.png"))
    mob = "-mobil-" in key
    pw = Image.open(shot).size[0]
    JOBS.append(dict(src=str(src), html_out=str(D / "html" / f"{key}.html"), png_out=str(shot),
                     width=390 if mob else 1280, scale=round(pw / 390, 3) if mob else 1.25))
    return "ok"

if __name__ == "__main__":
    state = json.load((D / "state.json").open())
    q = json.load((D / "qa/qa.json").open()) if (D / "qa/qa.json").exists() else {}
    keys = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not keys:
        keys = [k for k, v in q.items() if "-web-" in k and (set(v["kurallar"]) & FIXABLE) and state.get(k, {}).get("done")]
    res = {}
    for k in keys:
        try: res[k] = fix(k, state)
        except Exception as e: res[k] = f"hata: {e}"
        if res[k] != "ok": print(k, res[k], flush=True)
        q.pop(k, None)
    jf = TMP / "jobs.json"; jf.write_text(json.dumps(JOBS))
    out = subprocess.run(["node", str(D / "render.cjs"), str(jf)], capture_output=True, text=True, env={**__import__("os").environ, "PW": PW}).stdout
    for line in out.splitlines():
        st, name = line.split()[:2]; k = name[:-4]
        res[k] = "ok" if st == "ok" else line
        print(k, res[k], flush=True)
    json.dump(q, (D / "qa/qa.json").open("w"), ensure_ascii=False, indent=1)
    print(sum(v == "ok" for v in res.values()), "/", len(res), "düzeltildi")
