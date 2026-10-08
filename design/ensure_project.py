#!/usr/bin/env python3
"""Giriş yapılı Stitch hesabında 'YDS Platformu' projesini bulur (yoksa oluşturur) ve .env.stitch'e yazar."""
import json, subprocess, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
def run(*a):
    return json.loads(subprocess.run(["stitch", *a, "--format", "json"], capture_output=True, text=True).stdout)
j = run("find", "projects")
pid = next((i["name"].split("/")[1] for i in j.get("data", {}).get("items", []) if i.get("title") == "YDS Platformu 2"), None)
if not pid:
    pid = run("create", "project", "--json", '{"title":"YDS Platformu"}')["data"]["id"]
user = run("status").get("user") if False else ""
(ROOT / ".env.stitch").write_text(f"STITCH_PROJECT_ID={pid}\nDS_LIGHT=\nDS_DARK=\n")
print(pid)
