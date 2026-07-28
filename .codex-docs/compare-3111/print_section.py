from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    source = Path(sys.argv[1])
    start_marker = sys.argv[2]
    end_markers = sys.argv[3:]
    data = json.loads(source.read_text(encoding="utf-8"))
    active = False

    for block in data["blocks"]:
        text = block.get("text", "") if block["kind"] == "paragraph" else ""
        if start_marker in text:
            active = True

        if active:
            if block["kind"] == "paragraph":
                print(
                    f"P{block['index']} [{block.get('style')}] "
                    f"{text}"
                )
            else:
                print(f"TABLE {block['index']}")
                for row in block["rows"]:
                    print(" | ".join(row))

        if (
            active
            and block["kind"] == "paragraph"
            and any(marker in text for marker in end_markers)
            and start_marker not in text
        ):
            break


if __name__ == "__main__":
    main()
