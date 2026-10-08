#!/bin/bash
# Kota açılana kadar 10 dakikada bir dener; açılınca üretimi kaldığı yerden sürdürür.
cd /Users/emrullah/developer/fullStack/sinav
while true; do
  out=$(stitch generate screen -p 1306830902736940837 -d MOBILE --title "KOTA-TEST" --prompt "Tek düğmeli basit ekran" --format json 2>&1)
  if echo "$out" | grep -q '"success": true'; then
    id=$(echo "$out" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")
    stitch delete screen "$id" -p 1306830902736940837 >/dev/null 2>&1
    echo "$(date +%H:%M:%S) KOTA-ACIK üretim sürüyor" >> design/run.log
    break
  fi
  echo "$(date +%H:%M:%S) kota kapalı, bekleniyor" >> design/run.log
  sleep 600
done
design/run_all.sh
