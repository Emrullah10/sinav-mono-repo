#!/usr/bin/env python3
"""docs/tasarim-dokumani.md -> design/manifest.json
Her kayıt: modül, kimlik, ad, öncelik, cihazlar, doküman metni."""
import re, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
md = (ROOT / "docs/tasarim-dokumani.md").read_text(encoding="utf-8")

# --- Envanter (Bölüm 12) -------------------------------------------------
sec12 = md.split("\n## 12. Ekran envanteri")[1].split("\n## 13. ")[0]
inv = {}
for line in sec12.splitlines():
    m = re.match(r"\|\s*([A-Z]+-\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(P\d)\s*\|\s*(.+?)\s*\|", line)
    if m:
        i, name, plat, pri, purpose = m.groups()
        inv[i] = dict(id=i, name=name, plat=plat, pri=pri, purpose=purpose)
# Sistem durumları tablosu iki sütunlu: | SYS-01 Yükleniyor | Tanım |
sec13 = md.split("\n## 13. Ekran ayrıntıları")[1].split("\n## 14. ")[0]
for line in sec13.splitlines():
    m = re.match(r"\|\s*(SYS-\d+)\s+(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
    if m:
        i, name, d = m.groups()
        globals().setdefault("sysdetail", {})[i] = d
    if m and m.group(1) not in inv:
        inv[i] = dict(id=i, name=name, plat="M, W", pri="P0", purpose=d)
        sysdetail = globals().setdefault("sysdetail", {}); sysdetail[i] = d

# --- Ayrıntı metinleri (Bölüm 13/14) ------------------------------------
def clean(t):
    t = re.sub(r"&#91;|\\\[|&#93;|\\\]", "", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()

detail = {}
blocks = re.split(r"\n(?=\*\*[A-Z]+-\d+|\- \*\*[A-Z]+-\d+|\#\#\# )", sec13 + "\n" + md.split("\n## 14. ")[1].split("\n## 15. ")[0])
for b in blocks:
    ids = re.findall(r"[A-Z]+-\d+", b.split("\n")[0])
    for i in ids:
        detail[i] = detail.get(i, "") + clean(b)[:2200]

sec14 = md.split("\n## 14. ")[1].split("\n## 15. ")[0]
for line in (sec13 + "\n" + sec14).splitlines():
    m = re.match(r"\s*- \*\*([A-Z]+-\d+)[^*]*\*\*\s*(.+)", line)
    if m and not detail.get(m.group(1)):
        detail[m.group(1)] = clean(line.lstrip("- "))
for k,v in globals().get("sysdetail",{}).items(): detail.setdefault(k,v)
# MKT blokları listede "- **MKT-02 Fiyatlar:**" biçiminde olabilir
for m in re.finditer(r"\*\*(MKT-\d+)[^*]*\*\*(.{0,700})", sec13):
    detail.setdefault(m.group(1), clean(m.group(0)))

# --- Platform -> cihaz ---------------------------------------------------
ADMIN = ("CMS", "ORG")
def devices(i):
    p = inv[i]["plat"]
    pre = i.split("-")[0]
    if pre in ADMIN:
        return ["web"]
    d = set()
    if "W" in p or "web" in p or pre == "MKT":
        d.add("web")
    if "M" in p or "T" in p:
        d.add("mobil")
    if pre in ("AUTH", "ONB", "DIAG", "HOME", "STUDY", "TUTOR", "EXAM", "ME", "PAY", "SYS", "BOOK", "FUT", "MKT"):
        d |= {"web", "mobil"}
    if i in ("EXAM-04", "STUDY-21", "SYS-06", "SYS-08", "SYS-10", "SYS-11", "SYS-09"):
        d = {"web"} if i == "EXAM-04" else {"mobil"} if i != "SYS-09" else {"web"}
    if pre == "TCH":
        d = {"web"} | ({"mobil"} if "M" in p else set())
    return sorted(d)

MODULES = [
    ("M01-AUTH-ONB", ["AUTH", "ONB"]), ("M02-DIAG", ["DIAG"]), ("M03-HOME", ["HOME"]),
    ("M04-STUDY", ["STUDY"]), ("M05-TUTOR", ["TUTOR"]), ("M06-EXAM", ["EXAM"]),
    ("M07-ME", ["ME"]), ("M08-PAY", ["PAY"]), ("M09-SYS", ["SYS"]),
    ("M10-MKT", ["MKT"]), ("M11-CMS", ["CMS"]), ("M12-ORG", ["ORG"]),
    ("M13-TCH", ["TCH"]), ("M14-BOOK-FUT", ["BOOK", "FUT"]),
]
PRI = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}

out = []
for mod, pres in MODULES:
    for i, r in inv.items():
        if i.split("-")[0] in pres:
            out.append(dict(module=mod, pri=r["pri"], id=i, name=r["name"], purpose=r["purpose"],
                            devices=devices(i), text=detail.get(i, r["purpose"])))
out.sort(key=lambda r: (PRI[r["pri"]], [m for m, _ in MODULES].index(r["module"]), r["id"]))
json.dump(out, (ROOT / "design/manifest.json").open("w"), ensure_ascii=False, indent=1)
from collections import Counter
print(len(inv), "ekran;", Counter(r["pri"] for r in out), "varyasyon:", sum(len(r["devices"]) * 2 for r in out if r["pri"] != "P3"))
print("metinsiz:", [r["id"] for r in out if r["text"] == r["purpose"]][:40])
