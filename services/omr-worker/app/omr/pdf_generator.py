"""Vector A4 sheet; no answer key or candidate personal data in the QR."""
import re
from pathlib import Path
import cv2
import fitz
from .template_manager import (TemplateSpec, VERSION, MARKERS, MARKER_SIZE,
                               WIDTH_MM, HEIGHT_MM, QR_RECT, BUBBLE_RADIUS, CODED_VERSION, work_number_bubble)

MM = 72 / 25.4
FONT_PATH = Path(__file__).resolve().parents[1] / "assets" / "DejaVuSans.ttf"


def payload(token: str, spec: TemplateSpec):
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise ValueError("Invalid sheet identifier")
    prefix = "HILAL2" if spec.version == CODED_VERSION else "HILAL1"
    return f"{prefix}.{token}.{spec.question_count}.{spec.choice_count}"


def generate_pdf(token: str, spec: TemplateSpec, *, exam: str, variant: str,
                 ticket: str, candidate: str, candidateName: str = "", workNumber: str = "") -> bytes:
    if spec.version == CODED_VERSION and not re.fullmatch(r"[0-9]{8}", workNumber):
        raise ValueError("Eight-digit work number required")
    qr = cv2.QRCodeEncoder_create().encode(payload(token, spec))
    qr = cv2.copyMakeBorder(qr, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    with fitz.open() as doc:
        page = doc.new_page(width=WIDTH_MM * MM, height=HEIGHT_MM * MM)
        page.insert_font(fontname="Hilal", fontfile=str(FONT_PATH))
        font = fitz.Font(fontfile=str(FONT_PATH))
        for marker_id, (x, y) in MARKERS.items():
            marker = cv2.aruco.generateImageMarker(dictionary, marker_id, 160)
            page.insert_image(fitz.Rect(x * MM, y * MM, (x + MARKER_SIZE) * MM,
                                        (y + MARKER_SIZE) * MM),
                              stream=cv2.imencode(".png", marker)[1].tobytes())
        page.insert_image(fitz.Rect(*(v * MM for v in QR_RECT)),
                          stream=cv2.imencode(".png", qr)[1].tobytes())
        page.insert_text((23 * MM, 29 * MM), "HİLAL BİLET — CAVAB KARTI", fontsize=12, fontname="Hilal")
        for y, label, value in [(34, "İmtahan", exam), (39, "Variant", variant),
                                (44, "Bilet", ticket), (49, "Qeydiyyat kodu", candidate),
                                (54, "Ad, soyad", candidateName), (59, "İş nömrəsi", workNumber)]:
            if len(value) > 100 or any(ord(c) < 32 for c in value):
                raise ValueError("Invalid printable label")
            line = f"{label}: {value}"
            size = min(9, 125 * MM / max(font.text_length(line, fontsize=1), 1))
            page.insert_text((23 * MM, y * MM), line, fontsize=size, fontname="Hilal")
        page.insert_text((23 * MM, 67 * MM),
                         "Hər sualda bir dairəni tam qaralayın. QR və künc nişanlarını təmiz saxlayın.",
                         fontsize=7, fontname="Hilal")
        if spec.version == CODED_VERSION:
            page.insert_text((54 * MM, 86 * MM), "İŞ NÖMRƏSİ", fontname="Hilal", fontsize=6)
            page.insert_text((54 * MM, 90 * MM), "Hər sütunda bir rəqəm", fontname="Hilal", fontsize=5)
            for column in range(8):
                x, _ = work_number_bubble(column, 0)
                page.draw_rect(fitz.Rect((x - 1.5) * MM, 95 * MM, (x + 1.5) * MM, 100 * MM), width=.4)
                for digit in range(10):
                    bx, by = work_number_bubble(column, digit)
                    if column == 0:
                        page.insert_text((52.4 * MM, (by + .8) * MM), str(digit), fontsize=6)
                    page.draw_circle((bx * MM, by * MM), BUBBLE_RADIUS * MM, width=.55, color=(0,))
            page.insert_text((54 * MM, 146 * MM), "Biletdəki 8 rəqəmi kodlayın.", fontname="Hilal", fontsize=5)
        for q in range(spec.question_count):
            x, y = spec.bubble(q, 0)
            page.insert_text(((x - 9) * MM, (y + .8) * MM), str(q + 1), fontsize=7)
            for c, label in enumerate(spec.choices):
                bx, by = spec.bubble(q, c)
                if q % 50 == 0:
                    page.insert_text(((bx - .8) * MM, 75 * MM), label, fontsize=8)
                page.draw_circle((bx * MM, by * MM), BUBBLE_RADIUS * MM, width=.55, color=(0,))
        page.insert_text((23 * MM, 274 * MM), f"{spec.version} | Kart {token[:12]} | A4 — 100% ölçüdə çap edin",
                         fontsize=7, fontname="Hilal")
        doc.subset_fonts()
        return doc.tobytes(deflate=True)
