#!/bin/bash
# $1 = modül adı; modül bitince denetle, işaretlileri yeniden üret, tekrar denetle
cd /Users/emrullah/developer/fullStack/sinav
until grep -q "BİTTİ $1" design/run.log; do sleep 20; done
for round in 1 2; do
  python3 design/qa.py > design/qa/last.txt 2>&1
  python3 design/fix.py >> design/qa/last.txt 2>&1
  n=$(python3 -c "import json;print(len(json.load(open('design/qa/redo.json'))))")
  echo "$(date +%H:%M:%S) DENETIM $1 tur $round: $n işaretli" >> design/run.log
  [ "$n" = "0" ] && break
  python3 design/run_stitch.py --redo --workers 3 >> design/nohup.out 2>&1
  python3 - <<'PY'
import json,pathlib
p=pathlib.Path("design/qa/qa.json"); q=json.loads(p.read_text())
for k in json.load(open("design/qa/redo.json")): q.pop(k,None)
p.write_text(json.dumps(q))
PY
  rm -f $(python3 -c "import json;print(' '.join('design/html/%s.html'%k for k in json.load(open('design/qa/redo.json'))))")
done
python3 design/qa.py > design/qa/last.txt 2>&1
echo "$(date +%H:%M:%S) DENETIM-BİTTİ $1: $(head -1 design/qa/last.txt)" >> design/run.log
