# Template execution contract

## Reference

- Source: `C:\Users\bom13\Downloads\VuHoangUng-1.docx`
- SHA-256: `658fccc7c50240004ca92c502b88b2c5a03834376b69f680ff1aac30e8af606c`
- Scope inspected: section "Các quy trình, nghiệp vụ", especially the sequence beginning with "Nghiệp vụ mua sản phẩm điện tử" and continuing through user/admin procedures.
- Sections: 7.
- Source paragraphs: 1,414; tables: 51; images/drawings: 197.
- Render status: unresolved because neither LibreOffice nor Microsoft Word is installed in the execution environment. Structural evidence is stored in `template.json`, `template-style-evidence.json`, and the packaged audit outputs.

## Page system

- A4 portrait: 8.27 x 11.69 inches.
- Margins in all seven source sections: left 1.18 in (3.0 cm), right 0.79 in (2.0 cm), top 0.79 in (2.0 cm), bottom 0.79 in (2.0 cm).
- Sections begin on a new page.
- Footer contains an automatic `PAGE` field. The BQDrive document will use a centered page number.
- The new document will use one A4 section because the requested artifact is a standalone procedure chapter, not a full thesis.

## Typography and paragraph rhythm

- Dominant font: Times New Roman.
- Body: 13 pt, justified, 1.3-line spacing in the sample. User override: 1.5-line spacing.
- Large-business-process title: 14 pt bold, justified/left aligned, 6 pt before, 3-6 pt after, keep with next.
- Process title: 13 pt bold, justified/left aligned, 6 pt before, 3 pt after, keep with next.
- Introduction prose: 13 pt, justified, first-line indent 1 cm, 1.5-line spacing, 3-6 pt after.
- Main process step: 13 pt, justified, marker `●`, left indent about 1.27 cm, hanging indent about 0.635 cm, 3 pt after.
- Conditional/sub-step: 13 pt, justified, marker `○`, left indent about 2.54 cm, hanging indent about 0.635 cm, 3 pt after.
- Figure paragraph: centered, no first-line indent, image width limited to the text area.
- Figure caption: 13 pt bold, centered, 6 pt before/after. User override: automatic `SEQ Hình` field rather than typed numbers.

## Lists, figures and tables

- Process actions are presented as short, ordered bullet paragraphs, not as a table.
- `●` is used for main actions and `○` for decision branches.
- Each diagram follows its step list. The diagram uses white background, black linework, rectangles for actions, diamonds for decisions and labeled arrows.
- Figure captions use the form `Hình <automatic number>: Quy trình ...`.
- Dashboard comparison is the only required data table. It uses a three-column grid with role, data scope and displayed metrics.

## Content flow

1. Simple title page.
2. Automatic table of contents.
3. Automatic list of figures.
4. Short opening note explaining consolidation into eight groups.
5. Eight BQDrive business-process groups.
6. Each group starts with 2-5 prose paragraphs.
7. Each concrete process is a separate process heading followed by 4-10 action/branch bullets.
8. Important processes include a centered diagram and automatic caption.
9. Final section: "Nội dung cần xác nhận".

## Slot map

- Replace all template body content with BQDrive content.
- Preserve/recreate: A4 geometry, Times New Roman hierarchy, prose-to-process-to-diagram rhythm, bullet indentation, centered figures/captions and page-number treatment.
- Remove: title-page identity, acknowledgements, original TOCs, all selling-system prose, all product/order diagrams, all data-model content, screenshots, and unused media.
- Add: BQDrive title, two automatic contents fields, eight process groups, BQDrive diagrams, dashboard table, confirmation section.

## Package handling

- Preserve as design evidence: source styles, numbering definitions, section geometry and footer page-number pattern.
- Replace/remove as user-mandated content: `word/document.xml` body, source headers, source media, source drawing relationships, source bookmarks and source TOC caches.
- Recreate fields in the new document: `TOC`, `TOC \c "Hình"`, `SEQ Hình`, `PAGE`, with `w:updateFields=true`.
- No visible source text, product name, selling workflow, source data or source image may remain in the output.

## Fidelity gates

- Eight main BQDrive groups must remain unchanged.
- Body/process typography and bullet indentation must visibly follow the source pattern.
- Every required diagram must remain legible at A4 width and must sit immediately after its process steps.
- No process title may be left alone at the end of a page.
- No source selling terminology may appear.
- The reference SHA-256 must remain unchanged at delivery.
