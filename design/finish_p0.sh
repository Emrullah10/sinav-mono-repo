#!/bin/bash
# Kalan P0 mobil ekranlarını kota açılınca üretir, sonra yerel düzeltme + denetim.
cd /Users/emrullah/developer/fullStack/sinav
until [ "$(python3 design/run_stitch.py --device mobil --pri P0 --count-pending)" = "0" ]; do
  python3 design/run_stitch.py --device mobil --pri P0 --workers 3 >> design/nohup.out 2>&1
  [ "$(python3 design/run_stitch.py --device mobil --pri P0 --count-pending)" = "0" ] || sleep 1800
done
python3 design/local_fix.py MKT-15-mobil-koyu MKT-16-mobil-acik MKT-16-mobil-koyu > design/qa/localfix_son.txt 2>&1
python3 design/qa.py > design/qa/last.txt 2>&1
echo "$(date +%H:%M:%S) P0-TAMAM $(head -1 design/qa/last.txt)" >> design/run.log
