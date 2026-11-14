"""Unicode result reports share the answer sheet's embedded font."""
import fitz

from .pdf_generator import FONT_PATH


def generate_report(rows):
    columns = [(36, 210, "Ad, soyad", 9), (254, 90, "İş nömrəsi", 12), (352, 120, "Qeydiyyat kodu", 10),
               (480, 160, "Bilet", 11), (648, 60, "Variant", 5), (716, 90, "Bal", None)]
    font = fitz.Font(fontfile=str(FONT_PATH))
    content = rows[1:]
    with fitz.open() as doc:
        for start in range(0, max(1, len(content)), 22):
            page = doc.new_page(width=842, height=595)
            page.insert_font(fontname="Hilal", fontfile=str(FONT_PATH))
            page.insert_text((36, 40), "HİLAL — TƏSDİQLƏNMİŞ NƏTİCƏLƏR", fontname="Hilal", fontsize=14)
            page.insert_text((36, 60), f"Səhifə {start // 22 + 1} · Ümumi nəticə: {len(content)}", fontname="Hilal", fontsize=9)
            for x, _, label, _ in columns:
                page.insert_text((x, 85), label, fontname="Hilal", fontsize=9)
            for index, row in enumerate(content[start:start + 22]):
                y = 107 + index * 21
                for x, width, _, field in columns:
                    value = f"{row[6]} / {row[7]}" if field is None else str(row[field])
                    size = min(9, width / max(font.text_length(value, fontsize=1), 1))
                    page.insert_text((x, y), value, fontname="Hilal", fontsize=size)
                page.draw_line((36, y + 6), (806, y + 6), color=(.85,), width=.3)
        doc.subset_fonts()
        return doc.tobytes(deflate=True)
