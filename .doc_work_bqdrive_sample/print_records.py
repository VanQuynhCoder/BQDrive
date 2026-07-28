from pathlib import Path
import json
import sys


payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
start = int(sys.argv[2])
end = int(sys.argv[3])
for record in payload["records"]:
    if start <= record["index"] <= end:
        drawing = " [DRAWING]" if record["drawing"] else ""
        print(
            f'{record["index"]:04d} p{record["page"]:03d} '
            f'{record["style"]}{drawing}: {record["text"]}'
        )
