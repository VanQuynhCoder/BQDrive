from pathlib import Path

import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parent
PDF = ROOT / "Y_MAU_LVTN_2025.pdf"
OUT = ROOT / "pdf_render"
OUT.mkdir(exist_ok=True)

document = pdfium.PdfDocument(PDF)
for page_number in (1, 6, 7, 12, 13):
    page = document[page_number - 1]
    image = page.render(scale=1.8).to_pil()
    image.save(OUT / f"page-{page_number}.png")
