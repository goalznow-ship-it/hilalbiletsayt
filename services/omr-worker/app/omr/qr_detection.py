import re
import cv2
from .template_manager import TemplateSpec, QR_RECT, PX_PER_MM
from .perspective_correction import UnreadablePage


def read_identifier(aligned):
    x1, y1, x2, y2 = [int(v * PX_PER_MM) for v in QR_RECT]
    crop = aligned[y1 - 12:y2 + 12, x1 - 12:x2 + 12]
    value, _, _ = cv2.QRCodeDetector().detectAndDecode(crop)
    match = re.fullmatch(r"HILAL1\.([A-Za-z0-9_-]{43})\.(\d{1,3})\.([2-5])", value)
    if not match:
        raise UnreadablePage("SHEET_IDENTIFIER_UNREADABLE")
    try:
        spec = TemplateSpec(int(match[2]), int(match[3]))
    except ValueError as exc:
        raise UnreadablePage("TEMPLATE_UNSUPPORTED") from exc
    return match[1], spec
