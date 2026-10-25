"""Document loading helpers for OMR inputs (JPG, PNG, PDF)."""

from __future__ import annotations

from pathlib import Path
from typing import List

import fitz  # PyMuPDF
import numpy as np


def load_image(path: Path) -> np.ndarray:
    """Load a single image file into a BGR numpy array."""
    import cv2

    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to read image: {path}")
    return image


def pdf_to_images(path: Path, dpi: int = 200) -> List[np.ndarray]:
    """Render each page of a PDF into a BGR numpy array."""
    import cv2

    document = fitz.open(str(path))
    pages: List[np.ndarray] = []
    try:
        for page in document:
            matrix = fitz.Matrix(dpi / 72, dpi / 72)
            pixmap = page.get_pixmap(matrix=matrix)
            samples = pixmap.samples
            array = np.frombuffer(samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
            if pixmap.n == 4:
                array = cv2.cvtColor(array, cv2.COLOR_RGBA2BGR)
            elif pixmap.n == 3:
                array = cv2.cvtColor(array, cv2.COLOR_RGB2BGR)
            pages.append(array)
    finally:
        document.close()
    return pages
