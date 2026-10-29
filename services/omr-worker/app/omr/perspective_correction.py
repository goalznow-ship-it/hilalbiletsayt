"""Marker IDs and all 16 corners correct perspective and arbitrary rotation."""
import cv2
import numpy as np
from .template_manager import MARKERS, MARKER_SIZE, PX_PER_MM, WIDTH_MM, HEIGHT_MM


class UnreadablePage(ValueError):
    pass


def align_page(image: np.ndarray):
    if min(image.shape[:2]) < 600:
        raise UnreadablePage("LOW_RESOLUTION")
    scale = min(1, 3000 / max(image.shape[:2]))
    if scale < 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50))
    corners, ids, _ = detector.detectMarkers(grey)
    if ids is None or sorted(ids.flatten().tolist()) != list(MARKERS):
        raise UnreadablePage("ALIGNMENT_MARKERS_MISSING_OR_DUPLICATED")
    source, target = [], []
    for marker_corners, marker_id in zip(corners, ids.flatten()):
        x, y = MARKERS[int(marker_id)]
        s = MARKER_SIZE
        source.extend(marker_corners[0])
        target.extend([(x, y), (x + s, y), (x + s, y + s), (x, y + s)])
    source = np.float32(source)
    target = np.float32(target) * PX_PER_MM
    if cv2.contourArea(cv2.convexHull(source)) < image.shape[0] * image.shape[1] * .25:
        raise UnreadablePage("SHEET_TOO_SMALL")
    matrix, _ = cv2.findHomography(source, target, 0)
    if matrix is None or not np.isfinite(matrix).all():
        raise UnreadablePage("INVALID_PERSPECTIVE")
    projected = cv2.perspectiveTransform(source[None], matrix)[0]
    residual = float(np.sqrt(np.mean(np.sum((projected - target) ** 2, axis=1))))
    if residual > 3:
        raise UnreadablePage("ALIGNMENT_UNCERTAIN")
    w, h = WIDTH_MM * PX_PER_MM, HEIGHT_MM * PX_PER_MM
    boundary = cv2.perspectiveTransform(np.float32([[[0, 0], [w, 0], [w, h], [0, h]]]),
                                        np.linalg.inv(matrix))[0]
    if (boundary[:, 0].min() < -image.shape[1] * .02 or
            boundary[:, 1].min() < -image.shape[0] * .02 or
            boundary[:, 0].max() > image.shape[1] * 1.02 or
            boundary[:, 1].max() > image.shape[0] * 1.02):
        raise UnreadablePage("PAGE_CROPPED")
    aligned = cv2.warpPerspective(grey, matrix, (w, h), borderValue=255)
    return aligned, {"alignmentResidualPx": round(residual, 3),
                     "boundary": boundary.round(1).tolist(), "markerIds": [0, 1, 2, 3]}
