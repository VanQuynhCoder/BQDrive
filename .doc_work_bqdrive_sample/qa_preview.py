from pathlib import Path

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
)

import build_document as source


WORK = Path(r"D:\DoAn_LuanVanTotNghiep\.doc_work_bqdrive_sample")
PDF = WORK / "BQDrive_QA_preview.pdf"
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
step_main = ParagraphStyle(
    "StepMain", fontName="TNR", fontSize=13, leading=19.5, alignment=TA_JUSTIFY,
    leftIndent=1.27 * cm, firstLineIndent=-0.635 * cm, spaceAfter=2,
)
step_sub = ParagraphStyle(
    "StepSub", fontName="TNR", fontSize=13, leading=19.5, alignment=TA_JUSTIFY,
    leftIndent=2.54 * cm, firstLineIndent=-0.635 * cm, spaceAfter=2,
)
caption = ParagraphStyle(
    "Caption", fontName="TNR-Bold", fontSize=13, leading=19.5,
    alignment=TA_CENTER, spaceBefore=4, spaceAfter=6,
)
center = ParagraphStyle(
    "Center", fontName="TNR", fontSize=13, leading=19.5, alignment=TA_CENTER,
)


def esc(text):
    return (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


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
        Paragraph("CÁC QUY TRÌNH NGHIỆP VỤ LỚN<br/>CỦA HỆ THỐNG BQDRIVE", ParagraphStyle(
            "Title", parent=center, fontName="TNR-Bold", fontSize=16, leading=24,
        )),
        Spacer(1, 0.5 * cm),
        Paragraph("Trình bày theo cấu trúc quy trình và sơ đồ nghiệp vụ", ParagraphStyle(
            "Subtitle", parent=center, fontName="TNR-Italic",
        )),
        PageBreak(),
        Paragraph("MỤC LỤC", ParagraphStyle("TOCTitle", parent=h1, alignment=TA_CENTER)),
    ]
    for index, group in enumerate(source.GROUPS, 1):
        story.append(Paragraph(f"2.4.1.{index} {esc(group['title'])}", body))
    story += [
        Paragraph("Nội dung cần xác nhận", body),
        PageBreak(),
        Paragraph("MỤC LỤC HÌNH", ParagraphStyle("LOFTitle", parent=h1, alignment=TA_CENTER)),
    ]
    fig_index = 0
    for group in source.GROUPS:
        for proc in group["processes"]:
            if proc["diagram"]:
                fig_index += 1
                story.append(Paragraph(
                    f"Hình {fig_index}: Quy trình {esc(source.DIAGRAM_TITLES[proc['diagram']].lower())}",
                    body,
                ))
    story.append(PageBreak())
    for text in (
        "Các nghiệp vụ nhỏ trong báo cáo BQDrive được tổ chức lại thành tám nhóm lớn theo vòng đời xử lý. Cách trình bày gồm phần giới thiệu bằng văn xuôi, các quy trình cụ thể, bước chính, nhánh điều kiện và sơ đồ ở những luồng quan trọng.",
        "Việc tổ chức lại không thay đổi vai trò, trạng thái, điều kiện tài chính hoặc cấu trúc dữ liệu hiện có. Nội dung nghiệp vụ được đối chiếu với báo cáo gốc và code backend; những điểm chưa thể kết luận được tách riêng ở cuối tài liệu.",
    ):
        story.append(Paragraph(esc(text), body))

    fig_index = 0
    for group_index, group in enumerate(source.GROUPS, 1):
        if group_index > 1:
            story.append(PageBreak())
        story.append(Paragraph(f"2.4.1.{group_index} {esc(group['title'])}", h1))
        for intro in group["intro"]:
            story.append(Paragraph(esc(intro), body))
        for proc in group["processes"]:
            process_header = Paragraph(esc(proc["title"]), h2)
            steps = []
            for level, text in source.steps_for(proc):
                marker = "●" if level == 0 else "○"
                steps.append(Paragraph(f"{marker}&nbsp;&nbsp;{esc(text)}", step_main if level == 0 else step_sub))
            story.append(KeepTogether([process_header, steps[0]]))
            story.extend(steps[1:])
            if proc["diagram"]:
                fig_index += 1
                diagram = source.make_diagram(proc)
                image = Image(str(diagram), width=15.2 * cm, height=15.2 * cm * 760 / 1400)
                story.extend([
                    Spacer(1, 0.2 * cm),
                    image,
                    Paragraph(
                        f"Hình {fig_index}: Quy trình {esc(source.DIAGRAM_TITLES[proc['diagram']].lower())}",
                        caption,
                    ),
                ])
        if group.get("dashboard"):
            story.append(Paragraph("Bảng so sánh dashboard theo vai trò", h2))
            data = [["Vai trò", "Phạm vi dữ liệu", "Nội dung dashboard"]] + group["dashboard"]
            table = Table(data, colWidths=[3 * cm, 4 * cm, 9 * cm], repeatRows=1)
            table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, -1), "TNR"),
                ("FONTNAME", (0, 0), (-1, 0), "TNR-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("LEADING", (0, 0), (-1, -1), 14),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(table)

    story.extend([PageBreak(), Paragraph("Nội dung cần xác nhận", h1)])
    confirmations = source.json.loads((WORK / "build_summary.json").read_text(encoding="utf-8"))["confirmations"]
    for item in confirmations:
        story.append(Paragraph(f"●&nbsp;&nbsp;{esc(item)}", step_main))

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    page_count = len(PdfReader(str(PDF)).pages)
    (WORK / "page_count.txt").write_text(str(page_count), encoding="ascii")
    print(page_count)


if __name__ == "__main__":
    build()
