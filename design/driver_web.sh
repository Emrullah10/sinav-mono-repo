#!/bin/bash
# SADECE WEB: kalan P0 web -> denetim -> işaretli web ekranlarını yeniden üret (en fazla 2 tur). Mobil yok.
cd /Users/emrullah/developer/fullStack/sinav
log() { echo "$(date +%H:%M:%S) $*" >> design/run.log; }
pending() { python3 design/run_stitch.py --device web --pri P0 --count-pending 2>/dev/null || echo 99; }
cleanup() { python3 - <<'PY'
import json,pathlib
p=pathlib.Path("design/qa/qa.json"); q=json.loads(p.read_text()) if p.exists() else {}
for k in json.load(open("design/qa/redo.json")): q.pop(k,None); pathlib.Path(f"design/html/{k}.html").unlink(missing_ok=True)
p.write_text(json.dumps(q))
PY
}
while [ "$(pending)" != "0" ]; do
  python3 design/ensure_project.py >/dev/null 2>&1
  log "WEB: $(pending) varyasyon kaldı"
  python3 design/run_stitch.py --device web --pri P0 --workers 3 >> design/nohup.out 2>&1
  [ "$(pending)" = "0" ] && break
  sleep 900
done
log "WEB-URETIM-BITTI"
for round in 1 2; do
  python3 design/qa.py > design/qa/last.txt 2>&1
  python3 design/fix.py -web- >> design/qa/last.txt 2>&1
  n=$(python3 -c "import json;print(len(json.load(open('design/qa/redo.json'))))")
  log "WEB-DENETIM tur $round: $(head -1 design/qa/last.txt) | yeniden: $n"
  [ "$n" = "0" ] && break
  python3 design/run_stitch.py --redo --device web --workers 3 >> design/nohup.out 2>&1
  cleanup
done
python3 design/qa.py > design/qa/last.txt 2>&1
log "WEB-TAMAM $(head -1 design/qa/last.txt)"
