"""Vector A4 sheet; no answer key or candidate personal data in the QR."""
import re
import cv2
import fitz
from .template_manager import (TemplateSpec, VERSION, MARKERS, MARKER_SIZE,
                               WIDTH_MM, HEIGHT_MM, QR_RECT, BUBBLE_RADIUS)

MM = 72 / 25.4


def payload(token: str, spec: TemplateSpec):
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise ValueError("Invalid sheet identifier")
    return f"HILAL1.{token}.{spec.question_count}.{spec.choice_count}"


def generate_pdf(token: str, spec: TemplateSpec, *, exam: str, variant: str,
                 ticket: str, candidate: str) -> bytes:
    qr = cv2.QRCodeEncoder_create().encode(payload(token, spec))
    qr = cv2.copyMakeBorder(qr, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    with fitz.open() as doc:
        page = doc.new_page(width=WIDTH_MM * MM, height=HEIGHT_MM * MM)
        for marker_id, (x, y) in MARKERS.items():
            marker = cv2.aruco.generateImageMarker(dictionary, marker_id, 160)
            page.insert_image(fitz.Rect(x * MM, y * MM, (x + MARKER_SIZE) * MM,
                                        (y + MARKER_SIZE) * MM),
                              stream=cv2.imencode(".png", marker)[1].tobytes())
        page.insert_image(fitz.Rect(*(v * MM for v in QR_RECT)),
                          stream=cv2.imencode(".png", qr)[1].tobytes())
        page.insert_text((23 * MM, 29 * MM), "HILAL BILET - ANSWER SHEET", fontsize=13)
        for y, label, value in [(38, "Exam", exam), (44, "Variant", variant),
                                (50, "Ticket", ticket), (56, "Candidate", candidate)]:
            if len(value) > 100 or any(ord(c) < 32 for c in value):
                raise ValueError("Invalid printable label")
            line = f"{label}: {value}"
            size = min(9, 125 * MM / max(fitz.get_text_length(line, fontsize=1), 1))
            page.insert_text((23 * MM, y * MM), line, fontsize=size)
        page.insert_text((23 * MM, 65 * MM),
                         "Fill ONE circle completely. Do not fold or mark the corner squares.", fontsize=7)
        for q in range(spec.question_count):
            x, y = spec.bubble(q, 0)
            page.insert_text(((x - 9) * MM, (y + .8) * MM), str(q + 1), fontsize=7)
            for c, label in enumerate(spec.choices):
                bx, by = spec.bubble(q, c)
                if q % 50 == 0:
                    page.insert_text(((bx - .8) * MM, 75 * MM), label, fontsize=8)
                page.draw_circle((bx * MM, by * MM), BUBBLE_RADIUS * MM, width=.55, color=(0,))
        page.insert_text((23 * MM, 274 * MM), f"{VERSION} | Sheet {token[:12]} | Print A4 at 100%", fontsize=7)
        return doc.tobytes(deflate=True)
