from pathlib import Path
from PIL import Image, ImageDraw


work = Path(r"D:\DoAn_LuanVanTotNghiep\.doc_work_bqdrive_sample")
pages = sorted((work / "reduced_pages").glob("page-*.png"))
output = work / "reduced_sheets"
output.mkdir(exist_ok=True)

for sheet_index in range((len(pages) + 3) // 4):
    sheet = Image.new("RGB", (1488, 2106), "#bbbbbb")
    draw = ImageDraw.Draw(sheet)
    for offset, path in enumerate(pages[sheet_index * 4:(sheet_index + 1) * 4]):
        image = Image.open(path).convert("RGB")
        image.thumbnail((720, 1000))
        x = (offset % 2) * 744 + (744 - image.width) // 2
        y = (offset // 2) * 1053 + (1053 - image.height) // 2
        sheet.paste(image, (x, y))
        draw.text((x + 8, y + 8), str(sheet_index * 4 + offset + 1), fill="red")
    sheet.save(output / f"sheet-{sheet_index + 1}.png")

print(len(list(output.glob("sheet-*.png"))))
