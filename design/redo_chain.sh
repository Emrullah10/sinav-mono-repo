#!/bin/bash
cd /Users/emrullah/developer/fullStack/sinav
python3 design/run_stitch.py --redo --workers 1 >> design/nohup.out 2>&1
python3 - <<'PY'
import json,pathlib
p=pathlib.Path("design/qa/qa.json"); q=json.loads(p.read_text())
for k in json.load(open("design/qa/redo.json")): q.pop(k,None); pathlib.Path(f"design/html/{k}.html").unlink(missing_ok=True)
p.write_text(json.dumps(q))
PY
python3 design/qa.py > design/qa/last.txt 2>&1
echo "$(date +%H:%M:%S) DENETIM-SON $1: $(head -1 design/qa/last.txt)" >> design/run.log
