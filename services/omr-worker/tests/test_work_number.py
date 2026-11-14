import cv2
import fitz
import pytest

from app.omr.pdf_generator import generate_pdf, MM
from app.omr.template_manager import TemplateSpec, CODED_VERSION, work_number_bubble, BUBBLE_RADIUS
from app.omr.pipeline import process_image
from app.omr.results_pdf import generate_report
from test_recognition import TOKEN, raster


def coded_sheet(number="12345678", extra=False):
    spec = TemplateSpec(150, 5, CODED_VERSION)
    data = generate_pdf(TOKEN, spec, exam="Sınaq", variant="A", ticket="HK-1", candidate="QD1234567890",
                        candidateName="Əli Əliyev", workNumber="12345678")
    with fitz.open(stream=data, filetype="pdf") as doc:
        assert "Əli Əliyev" in doc[0].get_text()
        for column, digit in enumerate(number):
            x, y = work_number_bubble(column, int(digit))
            doc[0].draw_circle((x * MM, y * MM), BUBBLE_RADIUS * .9 * MM, fill=(0,), color=(0,))
        if extra:
            x, y = work_number_bubble(0, 0)
            doc[0].draw_circle((x * MM, y * MM), BUBBLE_RADIUS * .9 * MM, fill=(0,), color=(0,))
        for q in range(150):
            x, y = spec.bubble(q, q % 5)
            doc[0].draw_circle((x * MM, y * MM), BUBBLE_RADIUS * .9 * MM, fill=(0,), color=(0,))
        return doc.tobytes()


@pytest.mark.parametrize("number,extra,expected", [("12345678", False, "12345678"), ("", False, None),
                                                  ("1234567", False, None), ("12345678", True, None)])
def test_work_number_requires_exactly_one_dark_mark_per_digit(number, extra, expected):
    image = cv2.resize(raster(coded_sheet(number, extra)), (880, 1245))
    result = process_image(cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE))
    assert result["workNumber"] == expected, result
    assert result["status"] == ("READ" if expected else "REVIEW"), result
    assert result["templateVersion"] == CODED_VERSION
    assert [a["selected"] for a in result["answers"]] == ["ABCDE"[q % 5] for q in range(150)]


def test_unicode_names_and_work_numbers_survive_report_export():
    row = ["page", "upload", "ticket", "candidate", "branch", "A", 12, 20, "COMPLETED", "Əli Əliyev", "QD1234567890", "HK-1", "12345678"]
    data = generate_report([row] + [row] * 23)
    with fitz.open(stream=data, filetype="pdf") as doc:
        assert len(doc) == 2
        assert "Əli Əliyev" in doc[1].get_text()
        assert "12345678" in doc[1].get_text()
