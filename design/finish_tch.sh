#!/bin/bash
cd /Users/emrullah/developer/fullStack/sinav
until python3 -c "import json,sys;sys.exit(0 if json.load(open('design/state.json'))['TCH-01-mobil-koyu'].get('done') else 1)"; do
  python3 design/run_stitch.py --only M13-TCH --device mobil --workers 1 >> design/nohup.out 2>&1 || sleep 1800
done
python3 design/local_fix.py TCH-01-mobil-koyu > design/qa/localfix_tch.txt 2>&1
python3 -c "
from PIL import Image;import glob
for f in glob.glob('design/shots/*/TCH-01-mobil-koyu.png'):
    im=Image.open(f)
    if im.size[0]!=780: im.resize((780,round(im.size[1]*780/im.size[0])),Image.LANCZOS).save(f)"
python3 design/qa.py > design/qa/last.txt 2>&1
echo "$(date +%H:%M:%S) HEPSI-TAMAM $(head -1 design/qa/last.txt)" >> design/run.log
