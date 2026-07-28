# Artifact contract - chuẩn hóa trạng thái BQDrive

- Reference: `D:\DoAn_LuanVanTotNghiep\Du_lieu_muc_vat_ly_he_thong_thue_xe.docx`
- SHA-256: `3B10D52B479EC29204079A439395923A71B0DEA173E961A77DBE9D56BB99E919`
- Output: `D:\DoAn_LuanVanTotNghiep\Du_lieu_muc_vat_ly_he_thong_thue_xe_dong_nhat_trang_thai.docx`
- Structure: 1 section, 15 tables. The source's cached page count is not reliable.
- Preserve: all package parts, section geometry, styles, numbering, headers,
  footers, relationships, drawings, tables, row/column geometry and cell
  formatting except the text nodes explicitly listed below.

## Editable slots

- Table 3, row 66, cell 5: `cars.status`.
- Table 3, rows 68-70, cell 5: car visibility flags.
- Table 5, row 70, cell 5: `bookings.status`.
- Table 6, row 20, cell 5: `contracts.paymentStatus`.
- Table 6, row 25, cell 5: `contracts.status`.
- Table 7, row 7, cell 5: `payments.status`.
- Table 7, row 12, cell 5: `payments.refundStatus`.
- Table 8, row 16, cell 5: `refunds.status`.

## Fidelity gates

- The source file must retain its recorded SHA-256.
- Only the intended `w:t` nodes in `word/document.xml` may change.
- All other ZIP package parts must remain byte-identical.
- Target descriptions must match the enums verified by backend build and
  status-rule tests.
- The output must open as a valid DOCX and preserve 1 section / 15 tables.
- Visual render is attempted with the packaged renderer. If LibreOffice and
  Microsoft Word are unavailable, structural package verification is the
  fallback and the limitation must be reported.
