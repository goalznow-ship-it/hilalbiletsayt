"""One photo can contain many independent sheets, including repeated marker IDs."""
import cv2
import numpy as np
import pytest
from functools import lru_cache

from app.omr.pipeline import process_document
from app.omr.template_manager import TemplateSpec, CODED_VERSION
from app.omr.supervisor import run_bounded
from test_recognition import raster, sheet


@lru_cache(maxsize=4)
def photo(count, *, missing_corner=False, small=False):
    width = 440 if small else 880
    height = round(width * 297 / 210)
    columns = min(3, count)
    rows = (count + columns - 1) // columns
    image = np.full((rows * (height + 40) + 40, columns * (width + 40) + 40, 3), 160, np.uint8)
    for index in range(count):
        card = cv2.resize(raster(sheet(TemplateSpec(150, 5, CODED_VERSION), {q: [(q + index) % 5] for q in range(150)},
                                       token=f"{index:043d}", work_number=str(10000000 + index))), (width, height), interpolation=cv2.INTER_AREA)
        if missing_corner and index == count - 1:
            card[:int(height * .08), :int(width * .12)] = 255
        if index % 2:
            card = cv2.rotate(card, cv2.ROTATE_180)
        x, y = 40 + (index % columns) * (width + 40), 40 + (index // columns) * (height + 40)
        image[y:y + height, x:x + width] = card
    return cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tobytes()


@pytest.mark.parametrize("count", [2, 12])
def test_each_sheet_in_one_phone_photo_has_its_own_identity_and_answers(count):
    result = process_document(photo(count), "group.jpg", "image/jpeg")
    assert result["status"] == "READ", [(p["reviewFlags"], p["metadata"]) for p in result["pages"]]
    assert len(result["pages"]) == count
    assert {p["sheetToken"] for p in result["pages"]} == {f"{index:043d}" for index in range(count)}
    assert [p["pageIndex"] for p in result["pages"]] == list(range(count))
    for page in result["pages"]:
        index = int(page["sheetToken"])
        assert page["workNumber"] == str(10000000 + index)
        assert [a["selected"] for a in page["answers"]] == ["ABCDE"[(q + index) % 5] for q in range(150)]


def test_incomplete_neighbor_is_reported_without_losing_readable_sheet():
    result = process_document(photo(2, missing_corner=True), "partial.jpg", "image/jpeg")
    assert result["status"] == "REVIEW"
    assert any(p["sheetToken"] == "0" * 43 and p["status"] == "READ" for p in result["pages"])
    assert any("UNRESOLVED_SHEETS" in p["reviewFlags"] for p in result["pages"])


def test_small_cards_are_not_scored_by_upscaling():
    result = process_document(photo(2, small=True), "small.jpg", "image/jpeg")
    assert result["status"] == "REVIEW"
    assert all(p["status"] == "REVIEW" for p in result["pages"])


def test_twelve_sheets_fit_the_production_process_limits():
    result = run_bounded("process", [(photo(12), "group.jpg", "image/jpeg")])[0]
    assert result["status"] == "READ", result
    assert len(result["pages"]) == 12


def test_group_photo_with_perspective_and_quarter_turn():
    data = np.frombuffer(photo(2), np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    h, w = image.shape[:2]
    matrix = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]),
                                        np.float32([[35, 45], [w - 25, 15], [w - 10, h - 30], [10, h - 10]]))
    image = cv2.warpPerspective(image, matrix, (w, h), borderValue=(160, 160, 160))
    image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    data = cv2.imencode(".jpg", image)[1].tobytes()
    result = process_document(data, "angled.jpg", "image/jpeg")
    assert result["status"] == "READ", result
    assert {p["workNumber"] for p in result["pages"]} == {"10000000", "10000001"}
