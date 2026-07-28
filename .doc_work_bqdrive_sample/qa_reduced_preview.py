from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer

import build_reduced_document as source


WORK = Path(r"D:\DoAn_LuanVanTotNghiep\.doc_work_bqdrive_sample")
PDF = WORK / "BQDrive_reduced_QA_preview.pdf"
FONT_DIR = Path(r"C:\Windows\Fonts")

pdfmetrics.registerFont(TTFont("TNR", str(FONT_DIR / "times.ttf")))
pdfmetrics.registerFont(TTFont("TNR-Bold", str(FONT_DIR / "timesbd.ttf")))
pdfmetrics.registerFont(TTFont("TNR-Italic", str(FONT_DIR / "timesi.ttf")))

body = ParagraphStyle(
    "Body", fontName="TNR", fontSize=13, leading=19.5, alignment=TA_JUSTIFY,
    firstLineIndent=1 * cm, spaceAfter=3,
)
h1 = ParagraphStyle(
    "H1", fontName="TNR-Bold", fontSize=14, leading=21, alignment=TA_JUSTIFY,
    spaceBefore=10, spaceAfter=6, keepWithNext=True,
)
h2 = ParagraphStyle(
    "H2", fontName="TNR-Bold", fontSize=13, leading=19.5, alignment=TA_JUSTIFY,
    spaceBefore=8, spaceAfter=3, keepWithNext=True,
)
label = ParagraphStyle(
    "Label", parent=h2, spaceBefore=2, spaceAfter=2,
)
step = ParagraphStyle(
    "Step", fontName="TNR", fontSize=13, leading=19.5, alignment=TA_JUSTIFY,
    leftIndent=1.27 * cm, firstLineIndent=-0.635 * cm, spaceAfter=2,
)
substep = ParagraphStyle(
    "Substep", fontName="TNR", fontSize=13, leading=19.5, alignment=TA_JUSTIFY,
    leftIndent=2.54 * cm, firstLineIndent=-0.635 * cm, spaceAfter=2,
)
center = ParagraphStyle(
    "Center", fontName="TNR", fontSize=13, leading=19.5, alignment=TA_CENTER,
)


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("TNR", 11)
    canvas.drawCentredString(A4[0] / 2, 1.15 * cm, str(document.page))
    canvas.restoreState()


def build():
    document = SimpleDocTemplate(
        str(PDF), pagesize=A4, leftMargin=3 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
    )
    story = [
        Spacer(1, 5.8 * cm),
        Paragraph(
            "CÁC NGHIỆP VỤ RÚT GỌN<br/>CỦA HỆ THỐNG BQDRIVE",
            ParagraphStyle("Title", parent=center, fontName="TNR-Bold", fontSize=16, leading=24),
        ),
        Spacer(1, 0.5 * cm),
        Paragraph(
            "Tổ chức theo 8 nhóm và 23 quy trình chính",
            ParagraphStyle("Subtitle", parent=center, fontName="TNR-Italic"),
        ),
        PageBreak(),
        Paragraph("MỤC LỤC", ParagraphStyle("TOC", parent=h1, alignment=TA_CENTER)),
    ]
    for group_index, group in enumerate(source.GROUPS, 1):
        story.append(Paragraph(f"2.4.1.{group_index} {esc(group['title'])}", body))
        for process_index, process in enumerate(group["processes"], 1):
            story.append(Paragraph(
                f"2.4.1.{group_index}.{process_index} {esc(process['title'])}",
                ParagraphStyle("TOC2", parent=body, leftIndent=1 * cm, firstLineIndent=0),
            ))
    story += [
        PageBreak(),
        Paragraph(
            esc("Các nghiệp vụ của BQDrive được tổ chức lại thành tám nhóm lớn và hai mươi ba quy trình chính nhằm giảm thao tác lặp, nhưng vẫn giữ nguyên vai trò, trạng thái, quyền hạn, điều kiện tài chính và các quy tắc đã đối chiếu từ hệ thống."),
            body,
        ),
        Paragraph(
            esc("Mỗi nhóm được giới thiệu bằng văn xuôi, sau đó trình bày các quy trình bằng các bước tuần tự và nhánh xử lý. Các thao tác tra cứu, CRUD, loại payment và hành động thông báo được đặt trong quy trình chuyên trách thay vì tách thành các quy trình nhỏ độc lập."),
            body,
        ),
    ]

    for group_index, group in enumerate(source.GROUPS, 1):
        story.append(Paragraph(f"2.4.1.{group_index} {esc(group['title'])}", h1))
        for intro in group["intro"]:
            story.append(Paragraph(esc(intro), body))
        for process_index, process in enumerate(group["processes"], 1):
            process_heading = Paragraph(
                f"2.4.1.{group_index}.{process_index} {esc(process['title'])}",
                h2,
            )
            lead = Paragraph(esc(process["lead"]), body)
            steps_label = Paragraph("Các bước thực hiện:", label)
            first = process["steps"][0]
            first_step = Paragraph(
                f"●&nbsp;&nbsp;Bước 1: {esc(first[1])}",
                step,
            )
            story.append(KeepTogether([process_heading, lead, steps_label, first_step]))
            main_index = 1
            for level, text in process["steps"][1:]:
                if level == 0:
                    main_index += 1
                    story.append(Paragraph(f"●&nbsp;&nbsp;Bước {main_index}: {esc(text)}", step))
                else:
                    story.append(Paragraph(f"○&nbsp;&nbsp;{esc(text)}", substep))

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    page_count = len(PdfReader(str(PDF)).pages)
    (WORK / "reduced_page_count.txt").write_text(str(page_count), encoding="ascii")
    print(page_count)


if __name__ == "__main__":
    build()
