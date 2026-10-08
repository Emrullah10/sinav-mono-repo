#!/bin/bash
# Gözetimsiz sürücü: web (açık+koyu) önce, sonra mobil; P0 -> P1 -> P2. Kota/çökme durumunda bekler ve devam eder.
cd /Users/emrullah/developer/fullStack/sinav
log() { echo "$(date +%H:%M:%S) $*" >> design/run.log; }
stage() { # cihaz öncelik
  local dev=$1 pri=$2 tries=0
  while true; do
    n=$(python3 design/run_stitch.py --device $dev --pri $pri --count-pending 2>/dev/null || echo 99)
    [ "$n" = "0" ] && break
    log "SURUCU $dev $pri: $n kaldı"
    python3 design/run_stitch.py --device $dev --pri $pri --workers 2 >> design/nohup.out 2>&1
    n2=$(python3 design/run_stitch.py --device $dev --pri $pri --count-pending 2>/dev/null || echo 99)
    [ "$n2" = "0" ] && break
    tries=$((tries+1)); log "SURUCU $dev $pri: tur sonu $n2 kaldı, 10 dk bekleniyor (tur $tries)"
    sleep 600
  done
  log "ASAMA-BITTI $dev $pri"
  python3 design/qa.py > design/qa/last.txt 2>&1
  log "DENETIM $dev $pri: $(head -1 design/qa/last.txt)"
}
stage web P0; stage mobil P0
python3 design/fix.py >> design/qa/last.txt 2>&1
python3 design/run_stitch.py --redo --workers 2 >> design/nohup.out 2>&1
python3 - <<'PY'
import json,pathlib
p=pathlib.Path("design/qa/qa.json"); q=json.loads(p.read_text())
for k in json.load(open("design/qa/redo.json")): q.pop(k,None); pathlib.Path(f"design/html/{k}.html").unlink(missing_ok=True)
p.write_text(json.dumps(q))
PY
python3 design/qa.py > design/qa/last.txt 2>&1; log "DENETIM-SON P0: $(head -1 design/qa/last.txt)"
stage web P1; stage mobil P1; stage web P2; stage mobil P2
python3 design/qa.py > design/qa/last.txt 2>&1; log "TUM-ISLER-BITTI $(head -1 design/qa/last.txt)"
