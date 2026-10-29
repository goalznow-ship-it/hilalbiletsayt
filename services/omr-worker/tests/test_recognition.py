import cv2
import fitz
import numpy as np
import pytest
from app.omr.pdf_generator import generate_pdf, MM
from app.omr.template_manager import TemplateSpec, BUBBLE_RADIUS
from app.omr.document_loader import document_images, InvalidDocument, MAX_BYTES
from app.omr.pipeline import process_image, process_document, process_batch

TOKEN = "a" * 43


def sheet(spec=TemplateSpec(20, 5), marks=None, token=TOKEN, variant="A"):
    data = generate_pdf(token, spec, exam="EX-1", variant=variant, ticket="HK-1", candidate="QD-1")
    with fitz.open(stream=data, filetype="pdf") as doc:
        for q, choices in (marks or {}).items():
            for choice in choices:
                x, y = spec.bubble(q, choice)
                doc[0].draw_circle((x * MM, y * MM), BUBBLE_RADIUS * .9 * MM, fill=(0,), color=(0,))
        return doc.tobytes()


def raster(data):
    return next(document_images(data, "sheet.pdf", "application/pdf"))


@pytest.mark.parametrize("count,choices,variant", [(1, 2, "A"), (60, 4, "B"), (150, 5, "C")])
def test_pdf_roundtrip_and_coordinates(count, choices, variant):
    spec = TemplateSpec(count, choices)
    marks = {q: [q % choices] for q in range(count)}
    data = sheet(spec, marks, variant=variant)
    with fitz.open(stream=data, filetype="pdf") as doc:
        assert abs(doc[0].rect.width - 595.28) < .1
        assert abs(doc[0].rect.height - 841.89) < .1
    result = process_document(data, "sheet.pdf", "application/pdf")["pages"][0]
    assert result["status"] == "READ", result
    assert result["sheetToken"] == TOKEN
    assert [a["selected"] for a in result["answers"]] == ["ABCDE"[q % choices] for q in range(count)]


def test_blank_and_multiple_are_not_guessed():
    result = process_image(raster(sheet(marks={0: [1], 2: [0, 3]})))
    assert result["answers"][0]["selected"] == "B"
    assert result["answers"][1]["state"] == "BLANK"
    assert result["answers"][2]["state"] == "MULTIPLE"
    assert result["answers"][2]["selected"] is None
    assert result["status"] == "REVIEW"


@pytest.mark.parametrize("rotation", [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE])
def test_rotation(rotation):
    result = process_image(cv2.rotate(raster(sheet(marks={0: [2]})), rotation))
    assert result["status"] == "READ", result
    assert result["answers"][0]["selected"] == "C"


def test_skew_perspective_jpeg_and_batch():
    image = raster(sheet(marks={0: [4], 19: [0]}))
    h, w = image.shape[:2]
    matrix = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]),
                                        np.float32([[60, 90], [w - 40, 20], [w - 20, h - 80], [20, h - 20]]))
    warped = cv2.warpPerspective(image, matrix, (w, h), borderValue=(255, 255, 255))
    jpg = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()
    png = cv2.imencode(".png", image)[1].tobytes()
    results = process_batch([(jpg, "scan.jpg", "image/jpeg"), (png, "scan.png", "image/png")])
    for result in results:
        assert result["status"] == "READ", result
        assert result["pages"][0]["answers"][19]["selected"] == "A"


def test_invalid_identifier_and_missing_markers_require_review():
    image = raster(sheet())
    image[150:520, 1200:1600] = 255
    result = process_image(image)
    assert result["status"] == "REVIEW" and result["sheetToken"] is None
    assert process_image(np.full((1800, 1200, 3), 255, np.uint8))["status"] == "REVIEW"


def test_faint_partial_mark_requires_review():
    data = sheet()
    with fitz.open(stream=data, filetype="pdf") as doc:
        x, y = TemplateSpec(20, 5).bubble(0, 0)
        doc[0].draw_circle((x * MM, y * MM), .42 * MM, fill=(0,), color=(0,), width=.1)
        result = process_image(raster(doc.tobytes()))
    assert result["answers"][0]["state"] == "UNCERTAIN"
    assert result["status"] == "REVIEW"


def test_invalid_files_and_limits():
    assert process_document(b"not png", "x.png", "image/png")["status"] == "REJECTED"
    assert process_document(sheet(), "x.png", "image/png")["status"] == "REJECTED"
    assert process_document(b"x" * (MAX_BYTES + 1), "x.jpg", "image/jpeg")["error"] == "FILE_SIZE_LIMIT"
    with fitz.open() as doc:
        for _ in range(11):
            doc.new_page()
        assert process_document(doc.tobytes(), "x.pdf", "application/pdf")["status"] == "REJECTED"
    with pytest.raises(InvalidDocument):
        process_batch([(b"x", "x.png", "image/png")] * 5)
