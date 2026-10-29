"""Bounded, signature-checked decoding. Never trust the filename or MIME alone."""
from io import BytesIO
from pathlib import Path
import warnings
import cv2
import fitz
import numpy as np
from PIL import Image, ImageOps

MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_PAGES = 10
DPI = 200
TYPES = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


class InvalidDocument(ValueError):
    pass


def document_images(data: bytes, filename: str, mime: str):
    ext = Path(filename).suffix.lower()
    if not data or len(data) > MAX_BYTES:
        raise InvalidDocument("FILE_SIZE_LIMIT")
    if ext not in TYPES or mime != TYPES[ext]:
        raise InvalidDocument("UNSUPPORTED_FILE_TYPE")
    if ext == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise InvalidDocument("FILE_SIGNATURE_MISMATCH")
        try:
            with fitz.open(stream=data, filetype="pdf") as doc:
                if doc.needs_pass or not 1 <= len(doc) <= MAX_PAGES:
                    raise InvalidDocument("PDF_ENCRYPTED_OR_PAGE_LIMIT")
                for page in doc:
                    w, h = page.rect.width * DPI / 72, page.rect.height * DPI / 72
                    if min(w, h) < 100 or w * h > MAX_PIXELS:
                        raise InvalidDocument("PAGE_DIMENSION_LIMIT")
                for page in doc:
                    pix = page.get_pixmap(dpi=DPI, colorspace=fitz.csRGB, alpha=False)
                    yield cv2.cvtColor(np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3), cv2.COLOR_RGB2BGR)
        except InvalidDocument:
            raise
        except Exception as exc:
            raise InvalidDocument("PDF_DECODE_FAILED") from exc
    else:
        expected = "PNG" if ext == ".png" else "JPEG"
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(data)) as im:
                    if im.format != expected:
                        raise InvalidDocument("FILE_SIGNATURE_MISMATCH")
                    if im.width * im.height > MAX_PIXELS or getattr(im, "n_frames", 1) != 1:
                        raise InvalidDocument("IMAGE_DIMENSION_OR_FRAME_LIMIT")
                    im.verify()
                with Image.open(BytesIO(data)) as im:
                    yield cv2.cvtColor(np.array(ImageOps.exif_transpose(im).convert("RGB")), cv2.COLOR_RGB2BGR)
        except InvalidDocument:
            raise
        except Exception as exc:
            raise InvalidDocument("IMAGE_DECODE_FAILED") from exc


def load_image(path: Path) -> np.ndarray:
    return next(document_images(path.read_bytes(), path.name, TYPES.get(path.suffix.lower(), "")))


def pdf_to_images(path: Path, dpi: int = DPI):
    if dpi != DPI:
        raise InvalidDocument("Only the calibrated 200 DPI render is supported")
    return list(document_images(path.read_bytes(), path.name, "application/pdf"))
