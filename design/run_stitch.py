#!/usr/bin/env python3
"""Stitch üretim çalıştırıcısı. Kaldığı yerden devam eder.
Kullanım: python3 design/run_stitch.py [--only M04-STUDY] [--pri P0] [--workers 4]
Durum: design/state.json   Günlük: design/run.log   Görseller: design/shots/"""
import json, subprocess, pathlib, threading, time, argparse, sys, os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "design"
ENV = dict(l.strip().split("=", 1) for l in (ROOT / ".env.stitch").read_text().splitlines() if "=" in l)
PROJ, DS = ENV["STITCH_PROJECT_ID"], {}
STATE_F = D / "state.json"
lock = threading.Lock()
state = json.loads(STATE_F.read_text()) if STATE_F.exists() else {}

BASE = (
    "YDS (yabancı dil sınavı) hazırlık uygulaması, Türkçe arayüz. Yetişkin, sakin, okunaklı ton; maskot, emoji, konfeti, gradyan yok. "
    "Petrol rengi ana renk, safran yalnızca dolgu/ikon (metin değil). Doğru = yeşil + ✓ ikon + yazı, yanlış = tuğla + ✕ ikon + yazı. "
    "Arayüz Figtree benzeri sans, okuma metinleri (soru kökü, seçenekler, İngilizce örnekler) Literata serif. Cevap baloncuğu motifi: tam daire, A-E harfli. "
    "Her etkileşimli öğenin dokunma hedefi en az 44px. Gerçekçi Türkçe içerik kullan, lorem ipsum yok. Ekranın tüm durumlarını gösteren ayrıntı içersin. "
    "Başlık ve etiketlerde İngilizce parantez/çeviri EKLEME; arayüz metni yalnızca Türkçe (İngilizce yalnızca sınav sorusu ve örnek cümle içeriğinde). Yazım hatası yapma. "
    "Renkler yalnızca şu paletten: Petrol #0E6A6E/#4DB6B0, Safran #E9A514/#F0B43A, doğru yeşil #1F7A45/#4CC27D, yanlış tuğla #A33D27/#EE8A6E, nötr #F4F6F5 #FFFFFF #13232A #46565C #DAE1E0 (açık) ve #0E171B #142127 #E4ECEC #A9B8BA #24343A (koyu); parlak standart yeşil, kırmızı, mavi, mor kullanma. Gradyan, cam/blur, gölgeli abartı, emoji yok. "
    "BAĞLAM: bugün 2 Ekim 2026; sınav 2026-YDS/2 · 22 Kasım 2026, başvuru 30 Eylül–8 Ekim; geri sayım 52 gün. 2025 tarihi kullanma. "
    "YDS'de yanlış doğruyu götürmez: 'net' kelimesini ASLA kullanma, yalnızca 'doğru' ve 'puan' (her doğru 1,25 puan, 80 soru, 180 dk). "
    "Marka adı yalnızca 'ODAK' (üst çubuk/logo; sınav adı İÇERMEZ). Etkin sınav ayrı küçük çip olarak gösterilir (örn. 'YDS · 22 Kasım'). Platform birden çok sınavı destekler: 'yalnızca YDS' izlenimi verme, sınav seçici ve sınav çipi olsun. Teknik jargon (IndexedDB, 256-bit, protokol, şifreleme) gösterme; sınav ekranı sade kalsın: yalnızca soru, seçenekler, süre, gezgin."
)

def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    with lock:
        print(line, flush=True)
        with (D / "run.log").open("a") as f:
            f.write(line + "\n")

def save(key, val):
    """Diğer süreçlerin kayıtlarını ezmemek için dosyayı kilitleyip birleştirerek yazar."""
    import fcntl
    with lock, open(D / "state.lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        disk = json.loads(STATE_F.read_text()) if STATE_F.exists() else {}
        disk[key] = val
        state.clear(); state.update(disk)
        tmp = STATE_F.with_suffix(".tmp"); tmp.write_text(json.dumps(disk, ensure_ascii=False, indent=1)); tmp.replace(STATE_F)

def stitch(args, timeout=900):
    r = subprocess.run(["stitch", *args, "--format", "json", "-p", PROJ], capture_output=True, text=True, timeout=timeout)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"success": False, "error": (r.stdout + r.stderr)[:400]}

def download(screen_id, dest):
    j = stitch(["get", "screen", screen_id])
    d = j.get("data", {})
    url = (d.get("screenshot") or {}).get("downloadUrl") or d.get("imageUrl")
    if url:
        dest.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url + "=w1600", dest)
        return True
    return False

def screen_theme(i):
    t = i.get("title") or ""
    if "Koyu" in t or "Dark" in t: return "koyu"
    if "Açık" in t or "Light" in t: return "acik"
    j = stitch(["get", "screen", i["id"]])
    u = ((j.get("data") or {}).get("htmlCode") or {}).get("downloadUrl")
    try:
        h = urllib.request.urlopen(u, timeout=60).read().decode("utf-8", "ignore")
        return "koyu" if re.search(r'<html[^>]*class="[^"]*dark', h) else "acik"
    except Exception:
        return None

def all_ids():
    j = stitch(["find", "screens", "--limit", "3000", "--page-size", "200", "--no-cache"])
    return {i["id"] for i in j.get("data", {}).get("items", [])}

def adopt(job, dev, theme, exclude=frozenset()):
    """Stitch'te oluşmuş ama bize dönmemiş ekranı bul (çifte kredi harcamamak için)."""
    j = stitch(["find", "screens", "--limit", "3000", "--page-size", "200", "--no-cache"])
    with lock:
        used = {v.get("screen") for v in state.values()}
    pref = job["title"].split(" · ")[0] + " "
    for i in j.get("data", {}).get("items", []):
        if i.get("id") in used or i.get("id") in exclude or i.get("deviceType") != dev:
            continue
        if (i.get("title") or "").startswith(pref) and screen_theme(i) == theme:
            return i["id"]
    return None

def make(job):
    key = job["key"]
    if state.get(key, {}).get("done") and not job.get("force"):
        return
    dev = "DESKTOP" if job["device"] == "web" else "MOBILE"
    theme = job["theme"]
    prompt = (
        f"{BASE}\n\nTEMA: {'AÇIK' if theme == 'acik' else 'KOYU'} tema. CİHAZ: {'masaüstü web 1440px' if dev == 'DESKTOP' else 'telefon 390pt, alt sekme çubuğu: Bugün, Çalış, Deneme, Öğretmen, Ben'}.\n\n"
        f"EKRAN: {job['title']}\n{job['text']}"
    )[:6000] + (f"\n\nÖNEMLİ DÜZELTME: {job['extra']}" if job.get("extra") else "")
    sid = None if job.get("force") else adopt(job, dev, theme)
    before = all_ids() if job.get("force") else frozenset()
    if sid:
        ok = download(sid, D / "shots" / job["module"] / f"{key}.png")
        save(key, dict(done=True, screen=sid, ds=False, shot=ok, url=None, title=None, adopted=True))
        log(f"OK   {key}  (projede zaten vardı, kredi harcanmadı)")
        return
    for attempt in range(10):
        j = stitch(["generate", "screen", "-d", dev, "--title", f"{job['title']} · {'Web' if dev == 'DESKTOP' else 'Mobil'} · {'Açık' if theme == 'acik' else 'Koyu'}", "--prompt", prompt])
        if j.get("success"):
            sid = j["data"]["id"]
            e = {"success": False}  # tasarım sistemi düzenlemesi kota harcıyor ve kalıcı değil; palet komutta
            ok = download(sid, D / "shots" / job["module"] / f"{key}.png")
            save(key, dict(done=True, screen=sid, ds=bool(e.get("success")), shot=ok, url=j["data"].get("canvasUrl"), title=j["data"].get("title")))
            log(f"OK   {key}  ds={bool(e.get('success'))}")
            return
        log(f"FAIL {key} (deneme {attempt + 1}): {str(j.get('error'))[:160]}")
        if "did not return a valid" in str(j.get("error")) and attempt >= 1:
            log(f"DUR  {key}: Stitch iki kez ekranı kaydetmedi (proje dolu olabilir), kredi yakmamak için bırakıldı")
            break
        if "exhausted" not in str(j.get("error")):
            time.sleep(60)
            sid = adopt(job, dev, theme, before)
            if sid:
                ok = download(sid, D / "shots" / job["module"] / f"{key}.png")
                save(key, dict(done=True, screen=sid, ds=False, shot=ok, url=None, title=None, adopted=True))
                log(f"OK   {key}  (hata dönse de oluşmuş, yeniden istenmedi)")
                return
        time.sleep(1800 if "exhausted" in str(j.get("error")) else 20 * (attempt + 1))
    save(key, dict(done=False, error=True))

ARGS_DEVICE = None

def jobs_from(args):
    man = json.loads((D / "manifest.json").read_text())
    comp = json.loads((D / "components.json").read_text())
    items = [dict(module=c["module"], pri="P0", id=c["id"], name=c["name"], devices=c["devices"], text=c["text"]) for c in comp] + man
    out = []
    for r in items:
        if args.only and r["module"] != args.only:
            continue
        if args.pri and r["pri"] != args.pri:
            continue
        if r["pri"] == "P3":
            continue
        for dv in r["devices"]:
            if ARGS_DEVICE and dv != ARGS_DEVICE:
                continue
            for th in ("acik", "koyu"):
                out.append(dict(module=r["module"], key=f"{r['id']}-{dv}-{th}", device=dv, theme=th,
                                title=f"{r['id']} · {r['name']}", text=r["text"]))
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only"); ap.add_argument("--device", choices=["web","mobil"]); ap.add_argument("--count-pending", action="store_true"); ap.add_argument("--pri"); ap.add_argument("--redo", help="qa/redo.json listesindeki anahtarları yeniden üret", action="store_true"); ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    ARGS_DEVICE = a.device
    jobs = jobs_from(a)
    if a.count_pending:
        print(len([j for j in jobs if not state.get(j["key"], {}).get("done")])); sys.exit(0)
    if a.redo:
        redo = json.loads((D / "qa/redo.json").read_text())
        jobs = [dict(j, force=True, extra=redo[j["key"]]) for j in jobs if j["key"] in redo]
    todo = jobs if a.redo else [j for j in jobs if not state.get(j["key"], {}).get("done")]
    log(f"{len(jobs)} varyasyon, {len(todo)} kaldı, {a.workers} paralel")
    with ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(make, todo))
    log("BİTTİ " + (a.only or "tümü") + " " + (a.pri or ""))
