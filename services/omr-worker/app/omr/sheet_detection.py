"""Group repeated corner IDs by geometry, never by detector enumeration order."""
from itertools import product

import cv2
import numpy as np

from .document_loader import InvalidDocument
from .template_manager import MARKERS, MARKER_SIZE, PX_PER_MM

MAX_SHEETS = 20


def find_sheets(image):
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    parameters = cv2.aruco.DetectorParameters()
    parameters.minMarkerPerimeterRate = .008
    parameters.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50), parameters)
    corners, ids, _ = detector.detectMarkers(grey)
    if ids is None:
        return [], False
    markers = [(int(i), c) for i, c in zip(ids.flatten(), corners) if int(i) in MARKERS]
    if len(markers) > MAX_SHEETS * 4:
        raise InvalidDocument("SHEET_COUNT_LIMIT")
    if len(markers) == 4 and sorted(i for i, _ in markers) == list(MARKERS):
        return [[c for _, c in sorted(markers, key=lambda item: item[0])]], False
    target = np.float32([[(x, y), (x + MARKER_SIZE, y),
                         (x + MARKER_SIZE, y + MARKER_SIZE), (x, y + MARKER_SIZE)]
                        for x, y in MARKERS.values()])
    centers = target.mean(axis=1)
    proposals = []
    for anchor_index, (marker_id, anchor) in enumerate(markers):
        if marker_id != 0:
            continue
        # A local affine estimate only narrows the search; all 16 corners must
        # subsequently fit one projective transform. Nearby sheets cannot mix.
        affine, _ = cv2.estimateAffine2D(target[0], anchor[0], method=cv2.LMEDS)
        if affine is None:
            continue
        predicted = cv2.transform(centers[None], affine)[0]
        diagonal = np.linalg.norm(predicted[2] - predicted[0])
        choices = []
        for wanted in (1, 2, 3):
            ranked = sorted((float(np.linalg.norm(c[0].mean(axis=0) - predicted[wanted])), index)
                            for index, (i, c) in enumerate(markers) if i == wanted)
            choices.append([index for distance, index in ranked[:4] if distance < diagonal * .55])
        for others in product(*choices):
            indices = (anchor_index, *others)
            source = np.float32([markers[index][1][0] for index in indices])
            polygon = source.mean(axis=1)
            if not cv2.isContourConvex(polygon) or cv2.contourArea(polygon) < 10_000:
                continue
            matrix, _ = cv2.findHomography(source.reshape(-1, 2), target.reshape(-1, 2) * PX_PER_MM, 0)
            if matrix is None or not np.isfinite(matrix).all():
                continue
            projected = cv2.perspectiveTransform(source.reshape(1, -1, 2), matrix)[0]
            error = float(np.sqrt(np.mean(np.sum((projected - target.reshape(-1, 2) * PX_PER_MM) ** 2, axis=1))))
            if error <= 3:
                proposals.append((error, indices, polygon))
    used, groups, boundaries = set(), [], []
    for _, indices, polygon in sorted(proposals, key=lambda item: item[0]):
        if used.intersection(indices):
            continue
        if any(cv2.intersectConvexConvex(polygon, other)[0] > .1 * min(cv2.contourArea(polygon), cv2.contourArea(other))
               for other in boundaries):
            continue
        used.update(indices)
        groups.append([markers[index][1] for index in indices])
        boundaries.append(polygon)
    groups.sort(key=lambda group: (float(np.concatenate(group).mean(axis=(0, 1))[1]),
                                   float(np.concatenate(group).mean(axis=(0, 1))[0])))
    return groups, len(used) != len(markers)
