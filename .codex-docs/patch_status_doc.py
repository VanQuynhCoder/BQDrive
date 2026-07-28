from __future__ import annotations

import hashlib
import sys
import zipfile
from pathlib import Path

from lxml import etree


EXPECTED_SOURCE_HASH = (
    "3B10D52B479EC29204079A439395923A71B0DEA173E961A77DBE9D56BB99E919"
)
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}

REPLACEMENTS = {
    (3, 66, 5): (
        "Trạng thái vòng đời và kiểm duyệt xe: PENDING, APPROVED, RENTED "
        "hoặc REJECTED. Không ghi mới HIDDEN; việc ẩn xe dùng các cờ "
        "isHidden, hiddenByOwner và hiddenByAdmin."
    ),
    (3, 68, 5): "Cờ ẩn tổng hợp, độc lập với trạng thái vòng đời của xe.",
    (3, 69, 5): (
        "Cờ xe bị ẩn bởi chủ xe; không thay đổi trạng thái vòng đời của xe."
    ),
    (3, 70, 5): (
        "Cờ xe bị ẩn bởi quản trị viên; không thay đổi trạng thái vòng đời "
        "của xe."
    ),
    (5, 70, 5): (
        "Trạng thái vòng đời booking: REQUESTED, OWNER_APPROVED, "
        "PAYMENT_PENDING, PAID, IN_PROGRESS, RETURN_INSPECTION, "
        "AWAITING_EXTRA_CHARGE, COMPLETED, CANCELLED, REJECTED hoặc NO_SHOW. "
        "PENDING, WAITING_PAYMENT và CONFIRMED chỉ được đọc để tương thích "
        "dữ liệu cũ, không được ghi mới."
    ),
    (6, 20, 5): (
        "Trạng thái thanh toán tổng hợp: UNPAID, PENDING, DEPOSIT_PAID, "
        "PARTIAL hoặc PAID_FULL."
    ),
    (6, 25, 5): (
        "Trạng thái hợp đồng hoạt động: ACTIVE, COMPLETED hoặc CANCELLED. "
        "DRAFT chỉ dùng để đọc dữ liệu cũ và không được ghi mới."
    ),
    (7, 7, 5): (
        "Trạng thái giao dịch thanh toán: PENDING, PAID hoặc FAILED. "
        "Không ghi mới Payment.status = REFUNDED."
    ),
    (7, 12, 5): (
        "Mức độ hoàn tiền của giao dịch: NOT_REFUNDED, "
        "PARTIALLY_REFUNDED hoặc REFUNDED; được suy ra từ amount và "
        "refundedAmount."
    ),
    (8, 16, 5): (
        "Trạng thái xử lý hoàn tiền hoạt động: WAITING_FOR_REFUND_INFO, "
        "MANUAL_REQUIRED, PROCESSING hoặc SUCCEEDED. PENDING, FAILED và "
        "CANCELLED chỉ được đọc để tương thích dữ liệu cũ, không ghi mới."
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def replace_cell_text(
    root: etree._Element,
    table_index: int,
    row_index: int,
    cell_index: int,
    value: str,
) -> None:
    tables = root.xpath(".//w:body/w:tbl", namespaces=NS)
    table = tables[table_index]
    rows = table.xpath("./w:tr", namespaces=NS)
    cells = rows[row_index].xpath("./w:tc", namespaces=NS)
    text_nodes = cells[cell_index].xpath(".//w:t", namespaces=NS)
    if not text_nodes:
        raise RuntimeError(
            f"Không tìm thấy text node tại {table_index}/{row_index}/{cell_index}"
        )

    text_nodes[0].text = value
    for node in text_nodes[1:]:
        node.text = ""


def main() -> None:
    source = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()

    if source == output:
        raise RuntimeError("Không được ghi đè tài liệu gốc")
    if sha256(source) != EXPECTED_SOURCE_HASH:
        raise RuntimeError("Tài liệu gốc đã thay đổi; cần audit lại trước khi sửa")

    with zipfile.ZipFile(source, "r") as source_zip:
        document_xml = source_zip.read("word/document.xml")
        root = etree.fromstring(document_xml)
        for location, value in REPLACEMENTS.items():
            replace_cell_text(root, *location, value)

        updated_xml = etree.tostring(
            root,
            xml_declaration=True,
            encoding="UTF-8",
            standalone=True,
        )

        with zipfile.ZipFile(output, "w") as output_zip:
            for item in source_zip.infolist():
                content = (
                    updated_xml
                    if item.filename == "word/document.xml"
                    else source_zip.read(item.filename)
                )
                output_zip.writestr(item, content)

    if sha256(source) != EXPECTED_SOURCE_HASH:
        raise RuntimeError("Tài liệu gốc đã bị thay đổi ngoài ý muốn")

    print(f"[OK] Created: {output}")
    print(f"[OK] Replacements: {len(REPLACEMENTS)}")
    print(f"[OK] Source unchanged: {sha256(source)}")


if __name__ == "__main__":
    main()
