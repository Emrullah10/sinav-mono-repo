#!/bin/bash
# P1 ve P2: web -> mobil. Kota bitince bekler (başarısız istek kredi harcamaz), sonra yerel düzeltme + denetim.
cd /Users/emrullah/developer/fullStack/sinav
log() { echo "$(date +%H:%M:%S) $*" >> design/run.log; }
pend() { python3 design/run_stitch.py --device $1 --pri $2 --count-pending 2>/dev/null || echo 99; }
for st in "web P1" "mobil P1" "web P2" "mobil P2"; do
  set -- $st
  while [ "$(pend $1 $2)" != "0" ]; do
    log "P12 $1 $2: $(pend $1 $2) kaldı"
    python3 design/run_stitch.py --device $1 --pri $2 --workers 3 >> design/nohup.out 2>&1
    [ "$(pend $1 $2)" = "0" ] || sleep 1800
  done
  log "ASAMA-BITTI $1 $2"
done
KEYS=$(python3 -c "
import json,pathlib
s=json.load(open('design/state.json'))
print(' '.join(k for k,v in s.items() if v.get('done') and not pathlib.Path(f'design/html_orig/{k}.html').exists()))")
python3 design/local_fix.py $KEYS > design/qa/localfix_p12.txt 2>&1
python3 design/qa.py > design/qa/last.txt 2>&1
log "P12-TAMAM $(head -1 design/qa/last.txt)"
