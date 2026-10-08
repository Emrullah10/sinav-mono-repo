#!/bin/bash
# Web önce: kalan web ekranlar -> web düzeltme turları -> mobil -> P1/P2
cd /Users/emrullah/developer/fullStack/sinav
log() { echo "$(date +%H:%M:%S) $*" >> design/run.log; }
pending() { python3 design/run_stitch.py --device $1 --pri $2 --count-pending 2>/dev/null || echo 99; }
stage() { local dev=$1 pri=$2
  while [ "$(pending $dev $pri)" != "0" ]; do
    log "SURUCU $dev $pri: $(pending $dev $pri) kaldı"
    python3 design/run_stitch.py --device $dev --pri $pri --workers 2 >> design/nohup.out 2>&1
    [ "$(pending $dev $pri)" = "0" ] && break
    log "SURUCU $dev $pri: kota/hata, 10 dk bekleniyor"; sleep 1800
  done
  log "ASAMA-BITTI $dev $pri"; }
cleanup() { python3 - <<'PY'
import json,pathlib
p=pathlib.Path("design/qa/qa.json"); q=json.loads(p.read_text())
for k in json.load(open("design/qa/redo.json")): q.pop(k,None); pathlib.Path(f"design/html/{k}.html").unlink(missing_ok=True)
p.write_text(json.dumps(q))
PY
}
polish() { local dev=$1   # web|mobil
  for round in 1 2 3; do
    python3 design/qa.py > design/qa/last.txt 2>&1
    python3 design/fix.py -$dev- >> design/qa/last.txt 2>&1
    n=$(python3 -c "import json;print(len(json.load(open('design/qa/redo.json'))))")
    log "DENETIM $dev tur $round: $(head -1 design/qa/last.txt) | yeniden üretilecek: $n"
    [ "$n" = "0" ] && break
    while true; do
      python3 design/run_stitch.py --redo --device $dev --workers 2 >> design/nohup.out 2>&1
      left=$(python3 - <<'PY'
import json
r=json.load(open("design/qa/redo.json")); s=json.load(open("design/state.json"))
print(sum(1 for k in r if s.get(k,{}).get("redo_round") is None and False))
PY
)
      break
    done
    cleanup
  done
  python3 design/qa.py > design/qa/last.txt 2>&1
  log "WEB-TEMIZ-DEGIL/ DENETIM-SON $dev: $(head -1 design/qa/last.txt)"; }
stage web P0
polish web
log "WEB-P0-BITTI"
stage mobil P0
polish mobil
log "MOBIL-P0-BITTI"
stage web P1; stage web P2
polish web
stage mobil P1; stage mobil P2
polish mobil
python3 design/qa.py > design/qa/last.txt 2>&1; log "TUM-ISLER-BITTI $(head -1 design/qa/last.txt)"
