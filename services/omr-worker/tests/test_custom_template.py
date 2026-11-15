import json
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.omr.custom_template import prepare_template, process_custom, Layout
from app.omr.supervisor import run_bounded

VERSION = "custom:3f701e13-737d-4899-88e3-745b1e1cba00"
LAYOUT = {"width": 1200, "height": 1700,
          "answers": [{"left": 140/1200, "right": 340/1200, "top": 800/1700, "bottom": 1250/1700,
                       "rows": 10, "columns": 5, "radius": .01},
                      {"left": 740/1200, "right": 940/1200, "top": 800/1700, "bottom": 1250/1700,
                       "rows": 10, "columns": 5, "radius": .01}],
          "workNumber": {"left": .25, "right": 650/1200, "top": 150/1700, "bottom": 600/1700,
                         "rows": 10, "columns": 8, "radius": .01}}


def card(number=None, multiple=False):
    image = np.full((1700, 1200, 3), 255, np.uint8)
    for text, xy in [("MY EXAM / 2026", (55, 60)), ("Student work number", (290, 110)),
                     ("CHOOSE ONE ANSWER", (90, 725)), ("MATHEMATICS", (695, 725)),
                     ("Full name: ______________________________", (90, 1430)),
                     ("Read instructions before completing this examination.", (90, 1530)),
                     ("School 17 - autumn assessment", (90, 1620))]:
        cv2.putText(image, text, xy, cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    layout = Layout.model_validate(LAYOUT)
    for block, grid in enumerate([*layout.answers, layout.workNumber]):
        for row_index, row in enumerate(grid.centers(1200, 1700)):
            for column, (x, y) in enumerate(row):
                cv2.circle(image, (round(x), round(y)), 12, (0, 0, 0), 2)
                if number is not None and ((block < 2 and (column == row_index % 5 or multiple and row_index == 0 and column == 1)) or
                                           (block == 2 and column < len(number) and row_index == int(number[column]))):
                    cv2.circle(image, (round(x), round(y)), 11, (0, 0, 0), -1)
            cv2.putText(image, str(row_index + 1 if block < 2 else row_index), (round(row[0][0])-45, round(row[0][1])+6),
                        cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 0, 0), 2)
    return image


def encoded(image):
    return cv2.imencode(".png", image)[1].tobytes()


def scan(image):
    return process_custom([(encoded(image), "scan.png", "image/png")], encoded(card()), LAYOUT, VERSION)[0]


def test_blank_model_calibration_and_invalid_grid():
    result = prepare_template((encoded(card()), "sample.png", "image/png"), LAYOUT)
    assert (result["width"], result["height"]) == (1200, 1700)
    with pytest.raises(ValueError):
        prepare_template((encoded(card("12345678")), "sample.png", "image/png"), LAYOUT)
    bad = {**LAYOUT, "answers": [{**LAYOUT["answers"][0], "left": .15}]}
    with pytest.raises(ValueError):
        prepare_template((encoded(card()), "sample.png", "image/png"), bad)
    with pytest.raises(ValueError):
        Layout.model_validate({**LAYOUT, "answers": [LAYOUT["answers"][0]] * 2})


@pytest.mark.parametrize("rotation", [None, cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180])
def test_reads_own_card_without_qr_or_standard_markers(rotation):
    image = card("12345678")
    if rotation is not None:
        image = cv2.rotate(image, rotation)
    result = scan(image)
    assert result["status"] == "READ", result
    page = result["pages"][0]
    assert page["workNumber"] == "12345678"
    assert page["sheetToken"] is None
    assert [a["selected"] for a in page["answers"]] == list("ABCDE" * 4)


def test_perspective_and_multiple_cards():
    canvas = np.full((2000, 2700, 3), 180, np.uint8)
    source = np.float32([[0, 0], [1199, 0], [1199, 1699], [0, 1699]])
    for target, number in [(np.float32([[100, 100], [1150, 140], [1170, 1700], [80, 1740]]), "12345678"),
                           (np.float32([[1450, 140], [2500, 100], [2520, 1740], [1420, 1700]]), "87654321")]:
        matrix = cv2.getPerspectiveTransform(source, target)
        warped = cv2.warpPerspective(card(number), matrix, (2700, 2000))
        mask = cv2.warpPerspective(np.full((1700, 1200), 255, np.uint8), matrix, (2700, 2000))
        canvas[mask > 0] = warped[mask > 0]
    result = scan(canvas)
    assert result["status"] == "READ", result
    assert {p["workNumber"] for p in result["pages"]} == {"12345678", "87654321"}


def test_ambiguous_work_number_and_multiple_answers_remain_review():
    result = scan(card("1234567", multiple=True))
    page = result["pages"][0]
    assert result["status"] == "REVIEW"
    assert page["workNumber"] is None
    assert "WORK_NUMBER_UNREADABLE" in page["reviewFlags"]
    assert "MULTIPLE" in page["reviewFlags"]


def test_wrong_model_and_cropped_page_do_not_receive_identity():
    for image in [np.full((1700, 1200, 3), 255, np.uint8), card("12345678")[100:-100, 100:-100]]:
        result = scan(image)
        assert result["status"] == "REVIEW"
        assert all(not p.get("workNumber") for p in result["pages"])


def test_custom_pipeline_uses_bounded_subprocess():
    result = run_bounded("custom", ([(encoded(card("12345678")), "scan.png", "image/png")], encoded(card()), LAYOUT, VERSION))
    assert result[0]["pages"][0]["workNumber"] == "12345678"


def test_twelve_custom_cards_in_one_photo_under_worker_limits():
    canvas = np.full((5300, 2850, 3), 180, np.uint8)
    expected = {str(12345670 + i) for i in range(12)}
    for i, number in enumerate(sorted(expected)):
        image = cv2.resize(card(number), (900, 1275), interpolation=cv2.INTER_AREA)
        y, x = 30 + (i // 3) * 1320, 30 + (i % 3) * 940
        canvas[y:y+1275, x:x+900] = image
    result = run_bounded("custom", ([(encoded(canvas), "group.png", "image/png")], encoded(card()), LAYOUT, VERSION))[0]
    assert result["status"] == "READ", result
    assert {p["workNumber"] for p in result["pages"]} == expected


def test_custom_upload_endpoints(monkeypatch):
    secret = "custom-template-worker-secret-32-characters"
    monkeypatch.setattr(settings, "omr_worker_secret", secret)
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {secret}"}
    assert client.post("/api/omr/templates", files={"file": ("blank.png", encoded(card()), "image/png")}).status_code == 401
    result = client.post("/api/omr/templates", headers=headers, data={"layout": json.dumps(LAYOUT)},
                         files={"file": ("blank.png", encoded(card()), "image/png")})
    assert result.status_code == 200, result.text
    result = client.post("/api/omr/process", headers=headers, data={"layout": json.dumps(LAYOUT), "version": VERSION},
                         files=[("files", ("scan.png", encoded(card("12345678")), "image/png")),
                                ("sample", ("blank.png", encoded(card()), "image/png"))])
    assert result.status_code == 200, result.text
    assert result.json()["files"][0]["status"] == "READ"
    invalid = client.post("/api/omr/templates", headers=headers, data={"layout": "{}"},
                          files={"file": ("blank.png", encoded(card()), "image/png")})
    assert invalid.status_code == 422
