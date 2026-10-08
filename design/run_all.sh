#!/bin/bash
cd /Users/emrullah/developer/fullStack/sinav
for m in M00-BILESENLER M01-AUTH-ONB M02-DIAG M03-HOME M04-STUDY M05-TUTOR M06-EXAM M07-ME M08-PAY M09-SYS M10-MKT M11-CMS; do
  python3 design/run_stitch.py --only $m --pri P0 --workers 2
done
for p in P1 P2; do
  for m in M01-AUTH-ONB M02-DIAG M03-HOME M04-STUDY M05-TUTOR M06-EXAM M07-ME M08-PAY M09-SYS M10-MKT M11-CMS M12-ORG M13-TCH M14-BOOK-FUT; do
    python3 design/run_stitch.py --only $m --pri $p --workers 2
  done
done
python3 design/run_stitch.py --redo --workers 2
python3 design/qa.py > design/qa/last.txt 2>&1; echo "$(date +%H:%M:%S) DENETIM-SON: $(head -1 design/qa/last.txt)" >> design/run.log
echo TUM-ISLER-BITTI >> design/run.log
