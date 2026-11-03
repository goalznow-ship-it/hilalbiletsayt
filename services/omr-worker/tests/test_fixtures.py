"""Recognition of committed scan fixtures: clean, blurry, rotated, double-marked, blank."""
import json
from pathlib import Path

import pytest

from app.omr.pipeline import process_document

FIXTURES = Path(__file__).parent / "fixtures"
EXPECTED = json.loads((FIXTURES / "expected.json").read_text())
MIME = {".png": "image/png", ".jpg": "image/jpeg"}


def recognise(name):
    path = FIXTURES / name
    result = process_document(path.read_bytes(), name, MIME[path.suffix])
    assert len(result["pages"]) == 1
    return result["pages"][0]


def selected(page):
    return [a["selected"] for a in page["answers"]]


@pytest.mark.parametrize("name", ["clean.png", "rotated.jpg"])
def test_readable_sheets_are_read_exactly(name):
    page = recognise(name)
    assert page["status"] == "READ", page["reviewFlags"]
    assert page["sheetToken"] == EXPECTED["token"]
    assert page["questionCount"] == EXPECTED["questionCount"]
    assert selected(page) == EXPECTED["answers"]
    assert page["confidence"] >= 0.85


def test_blurry_sheet_goes_to_review_without_answers():
    page = recognise("blurry.jpg")
    # Too blurred to trust: no answers are proposed and a human must decide.
    assert page["status"] == "REVIEW"
    assert page["answers"] == []
    assert page["reviewFlags"]


def test_double_marked_question_is_not_guessed():
    page = recognise("double_marked.png")
    assert page["status"] == "REVIEW"
    assert "MULTIPLE" in page["reviewFlags"]
    question = EXPECTED["doubleMarkedQuestion"]
    answer = page["answers"][question - 1]
    assert answer["state"] == "MULTIPLE" and answer["selected"] is None
    others = [s for i, s in enumerate(selected(page)) if i != question - 1]
    assert others == [s for i, s in enumerate(EXPECTED["answers"]) if i != question - 1]


def test_blank_sheet_goes_to_review():
    page = recognise("blank.png")
    assert page["status"] == "REVIEW"
    assert page["reviewFlags"] == ["ALL_BLANK"]
    assert all(a["state"] == "BLANK" for a in page["answers"])


def test_clean_sheet_matches_api_contract_snapshot():
    """apps/api/src/omr/omr.fixture.unit.spec.ts scores this snapshot."""
    page = recognise("clean.png")
    page["metadata"] = {}
    snapshot = json.loads((FIXTURES / "clean.worker.json").read_text())
    assert {k: page[k] for k in ("status", "sheetToken", "answers", "questionCount", "choiceCount")} == \
        {k: snapshot[k] for k in ("status", "sheetToken", "answers", "questionCount", "choiceCount")}
