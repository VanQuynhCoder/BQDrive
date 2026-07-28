from pathlib import Path
from collections import Counter
import json
import sys


payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
start = int(sys.argv[2])
end = int(sys.argv[3])
records = [r for r in payload["records"] if start <= r["index"] <= end]
for record in records:
    if record["text"] or record["drawing"]:
        run = record["runs"][0] if record["runs"] else {}
        print(
            f'{record["index"]:04d} style={record["style"]!r} align={record["alignment"]} '
            f'left={record["left_indent_cm"]} first={record["first_line_cm"]} '
            f'before={record["space_before_pt"]} after={record["space_after_pt"]} '
            f'line={record["line_spacing"]} drawing={record["drawing"]} '
            f'font={run.get("font")} size={run.get("size")} bold={run.get("bold")} '
            f'text={record["text"][:100]}'
        )
