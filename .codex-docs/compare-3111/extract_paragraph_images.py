from __future__ import annotations

import shutil
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn


def main() -> None:
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    start_index = int(sys.argv[3])
    end_index = int(sys.argv[4])
    destination.mkdir(parents=True, exist_ok=True)

    document = Document(source)
    extracted = 0
    for paragraph_index in range(start_index, end_index + 1):
        paragraph = document.paragraphs[paragraph_index]
        for image_index, blip in enumerate(
            paragraph._p.xpath(".//a:blip")
        ):
            relationship_id = blip.get(qn("r:embed"))
            if not relationship_id:
                continue
            part = document.part.related_parts[relationship_id]
            extension = Path(part.partname).suffix or ".bin"
            output = destination / (
                f"paragraph-{paragraph_index}-image-{image_index}{extension}"
            )
            output.write_bytes(part.blob)
            print(
                f"{output} | rel={relationship_id} | "
                f"content_type={part.content_type}"
            )
            extracted += 1

    print(f"Extracted {extracted} image(s)")


if __name__ == "__main__":
    main()
