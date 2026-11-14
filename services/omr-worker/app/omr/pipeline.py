"""Image recognition only. The API resolves identifiers and scores immutable keys."""
import cv2
from .template_manager import VERSION, CODED_VERSION
from .work_number import read_work_number
from .perspective_correction import align_page, UnreadablePage
from .qr_detection import read_identifier
from .bubble_recognition import read_answers, BLANK_MAX, MARK_MIN
from .document_loader import document_images, InvalidDocument
from .sheet_detection import find_sheets

ENGINE_VERSION = "1.0.0"


def process_image(image, marker_group=None):
    base = {"engineVersion": ENGINE_VERSION, "templateVersion": VERSION,
            "sheetToken": None, "answers": [], "confidence": 0,
            "status": "REVIEW", "reviewFlags": [], "metadata": {}}
    try:
        grey, metadata = align_page(image, marker_group)
        base["metadata"] = metadata
        token, spec = read_identifier(grey)
        base.update(sheetToken=token, questionCount=spec.question_count, choiceCount=spec.choice_count, templateVersion=spec.version)
        sharpness = float(cv2.Laplacian(grey, cv2.CV_64F).var())
        if sharpness < 25:
            raise UnreadablePage("IMAGE_BLURRED")
        answers = read_answers(grey, spec)
        flags = {a["state"] for a in answers if a["state"] in ("UNCERTAIN", "MULTIPLE")}
        if spec.version == CODED_VERSION:
            base["workNumber"] = read_work_number(grey)
            if base["workNumber"] is None:
                flags.add("WORK_NUMBER_UNREADABLE")
        # A sheet with no marks at all is more likely a wrong page, a failed
        # scan or an absent candidate than a real attempt: a human decides.
        if all(a["state"] == "BLANK" for a in answers):
            flags.add("ALL_BLANK")
        flags = sorted(flags)
        base.update(answers=answers, confidence=min(a["confidence"] for a in answers),
                    status="REVIEW" if flags else "READ", reviewFlags=flags)
        metadata.update(sharpness=round(sharpness, 2), blankMax=BLANK_MAX, markMin=MARK_MIN)
    except UnreadablePage as exc:
        base["reviewFlags"] = [str(exc)]
    except (cv2.error, ValueError, IndexError):
        base["reviewFlags"] = ["IMAGE_ANALYSIS_FAILED"]
    return base


def process_document(data, filename, mime):
    try:
        pages = []
        for source_index, image in enumerate(document_images(data, filename, mime)):
            groups, incomplete = find_sheets(image)
            readings = [process_image(image, group) for group in groups] if groups else [process_image(image)]
            if groups and incomplete:
                readings.append({"engineVersion": ENGINE_VERSION, "templateVersion": VERSION,
                                 "sheetToken": None, "answers": [], "confidence": 0, "status": "REVIEW",
                                 "reviewFlags": ["UNRESOLVED_SHEETS"], "metadata": {}})
            for sheet_index, reading in enumerate(readings):
                reading["metadata"].update(sourcePageIndex=source_index, sheetIndex=sheet_index)
                pages.append({"pageIndex": len(pages), **reading})
                if len(pages) > 100:
                    raise InvalidDocument("DOCUMENT_SHEET_LIMIT")
        return {"status": "REVIEW" if any(p["status"] == "REVIEW" for p in pages) else "READ", "pages": pages}
    except InvalidDocument as exc:
        return {"status": "REJECTED", "pages": [], "error": str(exc)}


def process_batch(files):
    if not 1 <= len(files) <= 4 or sum(len(f[0]) for f in files) > 50 * 1024 * 1024:
        raise InvalidDocument("BATCH_LIMIT")
    return [process_document(*file) for file in files]
