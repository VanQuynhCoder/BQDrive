from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def load(path: str):
    return json.loads(Path(path).read_text(encoding="utf-8"))["blocks"]


def report_entities(blocks):
    entities = {}
    active = False
    current = None
    for block in blocks:
        if block["kind"] == "paragraph":
            text = block.get("text", "").strip()
            if "3.1.1.1" in text:
                active = True
                continue
            if active and ("3.1.1.2" in text or text.startswith("3.1.2")):
                break
            match = re.search(r"Loại thực thể\s+([A-Z_]+)", text)
            if active and match:
                current = match.group(1)
        elif active and current and block["kind"] == "table":
            entities[current] = table_rows(block)
            current = None
    return entities


def physical_entities(blocks):
    entities = {}
    current = None
    for block in blocks:
        if block["kind"] == "paragraph":
            text = block.get("text", "").strip()
            if text.startswith("Bảng "):
                current = text.removeprefix("Bảng ").strip()
        elif current and block["kind"] == "table":
            entities[current] = table_rows(block)
            current = None
    return entities


def table_rows(block):
    rows = {}
    for values in block["rows"][1:]:
        if len(values) < 6:
            continue
        rows[values[0]] = {
            "type": values[1],
            "K": bool(values[2].strip()),
            "U": bool(values[3].strip()),
            "M": bool(values[4].strip()),
        }
    return rows


def main():
    report = report_entities(load(sys.argv[1]))
    physical = physical_entities(load(sys.argv[2]))
    mapping = {
        "USER": "users",
        "BUSINESS": "businesses",
        "BRAND": "brands",
        "CAR": "cars",
        "BOOKING": "bookings",
        "PAYMENT": "payments",
        "CONTRACT": "contracts",
    }

    print("REPORT ENTITIES:", ", ".join(report))
    print("PHYSICAL COLLECTIONS:", ", ".join(physical))
    print(
        "MISSING ENTITY DESCRIPTIONS:",
        ", ".join(sorted(set(physical) - set(mapping.values()))),
    )

    for report_name, collection in mapping.items():
        conceptual_fields = report[report_name]
        physical_fields = physical[collection]
        missing = sorted(set(physical_fields) - set(conceptual_fields))
        extra = sorted(set(conceptual_fields) - set(physical_fields))
        flag_diff = []
        for field in sorted(set(conceptual_fields) & set(physical_fields)):
            diffs = [
                key
                for key in ("K", "U", "M")
                if conceptual_fields[field][key] != physical_fields[field][key]
            ]
            if diffs:
                flag_diff.append(
                    f"{field}({','.join(diffs)}: "
                    f"concept={conceptual_fields[field]}, "
                    f"physical={physical_fields[field]})"
                )
        print(f"\n{report_name} -> {collection}")
        print("  missing:", ", ".join(missing) or "-")
        print("  extra:", ", ".join(extra) or "-")
        print("  flag differences:")
        for item in flag_diff:
            print("   -", item)


if __name__ == "__main__":
    main()
