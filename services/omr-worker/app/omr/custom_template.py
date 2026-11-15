"""Calibrated user cards: register against a blank scan, then read marked grids."""
import base64
import cv2
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .document_loader import document_images, InvalidDocument
from .perspective_correction import UnreadablePage
from .bubble_recognition import BLANK_MAX, MARK_MIN


class Grid(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    left: float = Field(ge=0, le=1)
    top: float = Field(ge=0, le=1)
    right: float = Field(ge=0, le=1)
    bottom: float = Field(ge=0, le=1)
    rows: int = Field(ge=1, le=150)
    columns: int = Field(ge=2, le=10)
    radius: float = Field(ge=.002, le=.03)

    def centers(self, width, height):
        return [[(x, y) for x in np.linspace(self.left * width, self.right * width, self.columns)]
                for y in np.linspace(self.top * height, self.bottom * height, self.rows)]


class Layout(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    width: int = Field(ge=600, le=2000)
    height: int = Field(ge=600, le=2000)
    answers: list[Grid] = Field(min_length=1, max_length=10)
    workNumber: Grid

    @model_validator(mode="after")
    def valid_grids(self):
        if sum(g.rows for g in self.answers) > 150 or self.workNumber.rows != 10 or self.workNumber.columns != 8:
            raise ValueError("INVALID_GRID_SIZE")
        rectangles = []
        for grid in [*self.answers, self.workNumber]:
            r = grid.radius * self.width
            if (grid.right <= grid.left or (grid.rows == 1 and grid.bottom != grid.top) or
                    (grid.rows > 1 and grid.bottom <= grid.top) or
                    (grid.right - grid.left) * self.width / (grid.columns - 1) < 2.8 * r or
                    (grid.rows > 1 and (grid.bottom - grid.top) * self.height / (grid.rows - 1) < 2.8 * r)):
                raise ValueError("GRID_BUBBLES_OVERLAP")
            bounds = (grid.left * self.width - r * 1.8, grid.top * self.height - r * 1.8,
                      grid.right * self.width + r * 1.8, grid.bottom * self.height + r * 1.8)
            if bounds[0] < 0 or bounds[1] < 0 or bounds[2] >= self.width or bounds[3] >= self.height:
                raise ValueError("GRID_OUTSIDE_PAGE")
            if any(bounds[0] < b[2] and bounds[2] > b[0] and bounds[1] < b[3] and bounds[3] > b[1] for b in rectangles):
                raise ValueError("GRIDS_OVERLAP")
            rectangles.append(bounds)
        if any(g.columns != self.answers[0].columns or g.columns > 5 for g in self.answers):
            raise ValueError("INVALID_CHOICE_COUNT")
        return self


def normalize_sample(file):
    pages = list(document_images(*file))
    if len(pages) != 1:
        raise InvalidDocument("TEMPLATE_MUST_HAVE_ONE_PAGE")
    image = pages[0]
    if max(image.shape[:2]) > 2000:
        scale = 2000 / max(image.shape[:2])
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    if min(image.shape[:2]) < 600:
        raise InvalidDocument("LOW_RESOLUTION")
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def sample_response(grey):
    data = cv2.imencode(".png", grey)[1].tobytes()
    if len(data) > 3 * 1024 * 1024:
        raise InvalidDocument("TEMPLATE_SIZE_LIMIT")
    return {"width": grey.shape[1], "height": grey.shape[0], "image": base64.b64encode(data).decode("ascii")}


def fills_at(grey, reference, centers, radius, calibrate=False):
    fills, intact = [], []
    d = int(radius * 1.7)
    yy, xx = np.mgrid[-d:d+1, -d:d+1]
    distance = np.sqrt(xx * xx + yy * yy)
    inside = distance < radius * .65
    ring = (distance > radius * .75) & (distance < radius * 1.25)
    for bx, by in centers:
        x, y = round(bx), round(by)
        crop = grey[y-d:y+d+1, x-d:x+d+1]
        blank = reference[y-d:y+d+1, x-d:x+d+1]
        if crop.shape != inside.shape:
            raise UnreadablePage("CUSTOM_GRID_INVALID")
        cutoff = min(180, float(np.percentile(crop, 85)) * .72)
        ref_cutoff = min(180, float(np.percentile(blank, 85)) * .72)
        reference_ring = ring & (blank < ref_cutoff)
        available = inside & (blank >= ref_cutoff)
        if (np.mean(blank[inside] < ref_cutoff) >= .45 or
                np.mean(blank[ring] < ref_cutoff) < .12 or not available.any()):
            raise UnreadablePage("TEMPLATE_NOT_BLANK_OR_GRID_MISALIGNED")
        if calibrate:
            continue
        fills.append(float(np.mean(crop[available] < cutoff)))
        intact.append(float(np.mean(crop[reference_ring] < cutoff)) >= .65)
    return fills, intact


def reference_features(reference, layout):
    mask = np.full(reference.shape, 255, np.uint8)
    for grid in [*layout.answers, layout.workNumber]:
        for row in grid.centers(layout.width, layout.height):
            for x, y in row:
                cv2.circle(mask, (round(x), round(y)), round(grid.radius * layout.width * .8), 0, -1)
    return cv2.SIFT_create(nfeatures=6000).detectAndCompute(reference, mask)


def prepare_template(file, raw_layout=None):
    grey = normalize_sample(file)
    if raw_layout is not None:
        layout = Layout.model_validate(raw_layout)
        if grey.shape != (layout.height, layout.width):
            raise ValueError("TEMPLATE_DIMENSIONS_CHANGED")
        for grid in [*layout.answers, layout.workNumber]:
            for row in grid.centers(layout.width, layout.height):
                fills_at(grey, grey, row, grid.radius * layout.width, calibrate=True)
        keypoints, _ = reference_features(grey, layout)
        if len(keypoints) < 40:
            raise ValueError("TEMPLATE_ALIGNMENT_FEATURES_MISSING")
    return sample_response(grey)


def aligned_cards(image, reference, features):
    """Scene-to-reference matches allow repeated copies of the same blank card."""
    scale = min(1, 4000 / max(image.shape[:2]))
    if scale < 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    points, descriptors = cv2.SIFT_create(nfeatures=24000).detectAndCompute(grey, None)
    ref_points, ref_descriptors = features
    if descriptors is None or ref_descriptors is None:
        raise UnreadablePage("CUSTOM_TEMPLATE_NOT_MATCHED")
    pairs = cv2.BFMatcher().knnMatch(descriptors, ref_descriptors, k=2)
    matches = [m for pair in pairs if len(pair) == 2 for m, n in [pair] if m.distance < .68 * n.distance]
    found = 0
    while len(matches) >= 20 and found < 20:
        source = np.float32([points[m.queryIdx].pt for m in matches])
        target = np.float32([ref_points[m.trainIdx].pt for m in matches])
        matrix, inliers = cv2.findHomography(source, target, cv2.RANSAC, 2.5, maxIters=4000, confidence=.999)
        if matrix is None or inliers is None or int(inliers.sum()) < 20:
            break
        inliers = inliers.ravel().astype(bool)
        h, w = reference.shape
        if cv2.contourArea(cv2.convexHull(target[inliers])) < w * h * .18:
            break
        try:
            boundary = cv2.perspectiveTransform(np.float32([[[0, 0], [w-1, 0], [w-1, h-1], [0, h-1]]]), np.linalg.inv(matrix))[0]
        except np.linalg.LinAlgError:
            break
        if not np.isfinite(boundary).all() or not cv2.isContourConvex(boundary) or cv2.contourArea(boundary, oriented=True) <= 0:
            break
        if min(np.linalg.norm(boundary[(i+1) % 4] - boundary[i]) for i in range(4)) < 600:
            raise UnreadablePage("LOW_RESOLUTION")
        if (boundary[:, 0].min() < -grey.shape[1] * .01 or boundary[:, 1].min() < -grey.shape[0] * .01 or
                boundary[:, 0].max() > grey.shape[1] * 1.01 or boundary[:, 1].max() > grey.shape[0] * 1.01):
            raise UnreadablePage("PAGE_CROPPED")
        aligned = cv2.warpPerspective(grey, matrix, (w, h), borderValue=255)
        yield aligned, {"boundary": (boundary / scale).round(1).tolist(), "alignmentMatches": int(inliers.sum())}
        found += 1
        matches = [m for m in matches if cv2.pointPolygonTest(boundary, points[m.queryIdx].pt, False) < 0]
    if not found or len(matches) >= 20:
        raise UnreadablePage("CUSTOM_TEMPLATE_NOT_MATCHED" if not found else "UNRESOLVED_SHEETS")


def read_custom(grey, reference, layout, version, metadata):
    answers, flags = [], set()
    for grid in layout.answers:
        for centers in grid.centers(layout.width, layout.height):
            fills, intact = fills_at(grey, reference, centers, grid.radius * layout.width)
            marked = ["ABCDE"[i] for i, f in enumerate(fills) if f >= MARK_MIN]
            if not all(intact) or any(BLANK_MAX < f < MARK_MIN for f in fills):
                state, confidence = "UNCERTAIN", .3
            elif len(marked) > 1:
                state, confidence = "MULTIPLE", min(f for f in fills if f >= MARK_MIN)
            else:
                state = "MARKED" if marked else "BLANK"
                confidence = min(f if f >= MARK_MIN else 1-f for f in fills)
            if state in ("MULTIPLE", "UNCERTAIN"):
                flags.add(state)
            answers.append({"question": len(answers)+1, "state": state, "selected": marked[0] if state == "MARKED" else None,
                            "marked": marked, "confidence": round(confidence, 3), "fillRatios": [round(f, 3) for f in fills]})
    number = ""
    grid = layout.workNumber
    rows = grid.centers(layout.width, layout.height)
    for column in range(8):
        fills, intact = fills_at(grey, reference, [row[column] for row in rows], grid.radius * layout.width)
        digits = [str(i) for i, f in enumerate(fills) if f >= .85]
        if len(digits) != 1 or not all(intact) or any(BLANK_MAX < f < .85 for f in fills):
            flags.add("WORK_NUMBER_UNREADABLE")
        else:
            number += digits[0]
    if all(a["state"] == "BLANK" for a in answers):
        flags.add("ALL_BLANK")
    return {"engineVersion": "1.0.0", "templateVersion": version, "sheetToken": None,
            "workNumber": number if len(number) == 8 else None, "questionCount": len(answers),
            "choiceCount": layout.answers[0].columns, "answers": answers,
            "confidence": min(a["confidence"] for a in answers), "status": "REVIEW" if flags else "READ",
            "reviewFlags": sorted(flags), "metadata": metadata}


def process_custom(files, sample, raw_layout, version):
    layout = Layout.model_validate(raw_layout)
    reference = normalize_sample((sample, "template.png", "image/png"))
    if reference.shape != (layout.height, layout.width):
        raise ValueError("TEMPLATE_DIMENSIONS_CHANGED")
    features = reference_features(reference, layout)
    documents = []
    for file in files:
        pages = []
        try:
            for source_index, image in enumerate(document_images(*file)):
                try:
                    for grey, metadata in aligned_cards(image, reference, features):
                        metadata.update(sourcePageIndex=source_index, sheetIndex=len(pages))
                        reading = read_custom(grey, reference, layout, version, metadata)
                        pages.append({"pageIndex": len(pages), **reading})
                        if len(pages) > 100:
                            raise InvalidDocument("DOCUMENT_SHEET_LIMIT")
                except (UnreadablePage, cv2.error) as exc:
                    pages.append({"pageIndex": len(pages), "engineVersion": "1.0.0", "templateVersion": version,
                                  "sheetToken": None, "answers": [], "confidence": 0, "status": "REVIEW",
                                  "reviewFlags": [str(exc) if isinstance(exc, UnreadablePage) else "IMAGE_ANALYSIS_FAILED"],
                                  "metadata": {"sourcePageIndex": source_index}})
                if len(pages) > 100:
                    raise InvalidDocument("DOCUMENT_SHEET_LIMIT")
            documents.append({"status": "REVIEW" if any(p["status"] == "REVIEW" for p in pages) else "READ", "pages": pages})
        except InvalidDocument as exc:
            documents.append({"status": "REJECTED", "pages": [], "error": str(exc)})
    return documents
