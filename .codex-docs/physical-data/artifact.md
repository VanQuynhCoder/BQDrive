# Template execution contract

## Reference

- Source: `C:\Users\bom13\Downloads\VuHoangUng-1.docx`
- SHA-256: `658FCCC7C50240004CA92C502B88B2C5A03834376B69F680FF1AAC30E8AF606C`
- Source size: 7,524,228 bytes
- Relevant source slot: body paragraph 532 (`Heading 3`, "Dữ liệu ở mức vật lý") through paragraph 712, including tables 8-29.
- Source section count: 7.
- Source page count: unresolved because the package has no `docProps/app.xml` page count and no Word/LibreOffice renderer is installed.
- Evidence:
  - `.codex-docs/physical-data/reference-structure.json`
  - `.codex-docs/physical-data/template-style-evidence.json`
  - `section_audit.py` output captured during the task.

## Page system

- Page size: A4 portrait, 8.27 x 11.69 inches.
- Margins: left 1.18 inches; right 0.79 inches; top 0.79 inches; bottom 0.79 inches.
- Output uses one section and no source header/footer furniture because it is a standalone thesis section.
- Tables may continue across pages and repeat the header row.

## Typography

- Body and tables: Times New Roman, inherited from the reference document.
- Section heading: source `Heading 3` role, 14 pt, bold.
- Collection heading: source `Heading 4` role, bold.
- Table header: Times New Roman, bold.
- Body table text: Times New Roman, regular.
- No decorative title block is introduced.

## Tables

- Each collection uses the reference's six-column structure:
  `Thuộc tính | Kiểu | K | U | M | Diễn giải`.
- K: primary/key field.
- U: unique field or member of a documented compound unique index.
- M: required by the Mongoose schema. `_id` is also marked mandatory because MongoDB generates it.
- Reference table grid: 2019, 2385, 530, 524, 567, 3265 DXA (total 9290 DXA).
- The output keeps the narrow K/U/M columns and assigns the most width to `Diễn giải`.
- Rows have automatic height, wrapped text, vertical centering, and repeated header rows.

## Content flow

1. `3.1.3 Dữ liệu ở mức vật lý`.
2. Scope and K/U/M legend.
3. One `Bảng <collection>` subsection for every implemented Mongoose model:
   users, businesses, brands, cars, carts, bookings, contracts, payments,
   refunds, extracharges, returninspections, reviews, notifications,
   holidaycalendars.
4. A compact index summary grounded in explicit `schema.index(...)` and
   `unique: true` declarations.

## Slot map

- Replace the bookstore-specific physical tables with rental-system collection definitions.
- Preserve the reference's heading hierarchy, typography, table columns, and A4 page geometry.
- Do not copy unrelated source prose, figures, screenshots, headers, or footers.
- Embedded MongoDB objects are represented with dot notation.
- `createdAt` and `updatedAt` are included for every schema using
  `timestamps: true`.
- Mongoose's internal `__v` is omitted because it is not referenced by the
  application's business model.

## Package preservation

- The source document remains byte-for-byte unchanged.
- The output is a new standalone DOCX.
- Source styles and numbering definitions are used only as visual evidence;
  unrelated images, custom XML, comments, drawings, and relationships are not
  copied into the standalone deliverable.

## Fidelity gates

- All 14 model files are represented.
- Field names, scalar/container types, required flags, unique declarations,
  references, enums, and timestamps agree with the current Mongoose schemas.
- No table has fixed row heights.
- Header rows repeat on page continuation.
- No text is clipped structurally; table widths fit the A4 writable area.
- Visual PNG verification is attempted; if Word/LibreOffice is unavailable,
  structural DOCX checks and package audits are used and the limitation is
  disclosed.
