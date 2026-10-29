"""Image recognition only. The API resolves identifiers and scores immutable keys."""
import cv2
from .template_manager import VERSION
from .perspective_correction import align_page, UnreadablePage
from .qr_detection import read_identifier
from .bubble_recognition import read_answers, BLANK_MAX, MARK_MIN
from .document_loader import document_images, InvalidDocument

ENGINE_VERSION = "1.0.0"


def process_image(image):
    base = {"engineVersion": ENGINE_VERSION, "templateVersion": VERSION,
            "sheetToken": None, "answers": [], "confidence": 0,
            "status": "REVIEW", "reviewFlags": [], "metadata": {}}
    try:
        grey, metadata = align_page(image)
        base["metadata"] = metadata
        token, spec = read_identifier(grey)
        base.update(sheetToken=token, questionCount=spec.question_count, choiceCount=spec.choice_count)
        sharpness = float(cv2.Laplacian(grey, cv2.CV_64F).var())
        if sharpness < 25:
            raise UnreadablePage("IMAGE_BLURRED")
        answers = read_answers(grey, spec)
        flags = sorted({a["state"] for a in answers if a["state"] in ("UNCERTAIN", "MULTIPLE")})
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
        pages = [{"pageIndex": i, **process_image(image)}
                 for i, image in enumerate(document_images(data, filename, mime))]
        return {"status": "REVIEW" if any(p["status"] == "REVIEW" for p in pages) else "READ", "pages": pages}
    except InvalidDocument as exc:
        return {"status": "REJECTED", "pages": [], "error": str(exc)}


def process_batch(files):
    if not 1 <= len(files) <= 4 or sum(len(f[0]) for f in files) > 50 * 1024 * 1024:
        raise InvalidDocument("BATCH_LIMIT")
    return [process_document(*file) for file in files]
