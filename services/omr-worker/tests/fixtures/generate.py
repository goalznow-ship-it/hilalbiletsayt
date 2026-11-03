"""Regenerates the scanned-sheet fixtures used by tests/test_fixtures.py.

Run from services/omr-worker:  PYTHONPATH=. python tests/fixtures/generate.py
The images are committed so the tests exercise real files, not in-memory
renders; regenerate only when the template version changes.
"""
import json
from pathlib import Path

import cv2
import fitz
import numpy as np

from app.omr.document_loader import document_images
from app.omr.pdf_generator import MM, generate_pdf
from app.omr.pipeline import process_document
from app.omr.template_manager import BUBBLE_RADIUS, TemplateSpec

HERE = Path(__file__).parent
TOKEN = "Fixture-Sheet-Token_0123456789abcdefghijklm"  # 43 chars
SPEC = TemplateSpec(20, 5)
# Candidate answers on the clean sheet: question index -> choice index.
ANSWERS = {q: (q * 3) % 5 for q in range(20)}


def render(marks):
    data = generate_pdf(TOKEN, SPEC, exam="FIX-1", variant="A", ticket="HK-FIXTURE", candidate="QD-FIXTURE")
    with fitz.open(stream=data, filetype="pdf") as doc:
        for q, choices in marks.items():
            for choice in choices:
                x, y = SPEC.bubble(q, choice)
                doc[0].draw_circle((x * MM, y * MM), BUBBLE_RADIUS * .9 * MM, fill=(0,), color=(0,))
        pdf = doc.tobytes()
    return next(document_images(pdf, "sheet.pdf", "application/pdf"))


def save(name, image):
    ext = Path(name).suffix
    params = [cv2.IMWRITE_JPEG_QUALITY, 85] if ext == ".jpg" else [cv2.IMWRITE_PNG_COMPRESSION, 9]
    ok, buffer = cv2.imencode(ext, image, params)
    assert ok
    (HERE / name).write_bytes(buffer.tobytes())


def main():
    clean = render({q: [c] for q, c in ANSWERS.items()})
    save("clean.png", clean)

    save("blurry.jpg", cv2.GaussianBlur(clean, (0, 0), 7))

    # A sheet placed upside down and slightly tilted on a larger scanner bed.
    pad = clean.shape[0] // 12
    bed = cv2.copyMakeBorder(clean, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    h, w = bed.shape[:2]
    upside_down = cv2.rotate(bed, cv2.ROTATE_180)
    tilt = cv2.getRotationMatrix2D((w / 2, h / 2), 4, 1.0)
    save("rotated.jpg", cv2.warpAffine(upside_down, tilt, (w, h), borderValue=(255, 255, 255)))

    double = {q: [c] for q, c in ANSWERS.items()}
    double[3] = [ANSWERS[3], (ANSWERS[3] + 2) % 5]
    save("double_marked.png", render(double))

    save("blank.png", render({}))

    expected = {
        "token": TOKEN,
        "questionCount": SPEC.question_count,
        "choiceCount": SPEC.choice_count,
        "answers": ["ABCDE"[ANSWERS[q]] for q in range(20)],
        "doubleMarkedQuestion": 4,
    }
    (HERE / "expected.json").write_text(json.dumps(expected, indent=2) + "\n")

    # Contract snapshot consumed by the API scoring test (apps/api).
    page = process_document((HERE / "clean.png").read_bytes(), "clean.png", "image/png")["pages"][0]
    page["metadata"] = {}
    (HERE / "clean.worker.json").write_text(json.dumps(page, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
