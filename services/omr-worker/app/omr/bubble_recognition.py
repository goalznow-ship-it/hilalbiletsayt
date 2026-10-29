"""Interior ink excludes printed rings. Borderline marks stay uncertain."""
import numpy as np
from .template_manager import PX_PER_MM, BUBBLE_RADIUS, TemplateSpec

BLANK_MAX = .12
MARK_MIN = .50


def read_answers(grey: np.ndarray, spec: TemplateSpec):
    answers = []
    radius = BUBBLE_RADIUS * PX_PER_MM
    for q in range(spec.question_count):
        fills, ring_integrity = [], []
        for c in range(spec.choice_count):
            bx, by = spec.bubble(q, c)
            x, y = round(bx * PX_PER_MM), round(by * PX_PER_MM)
            d = int(radius * 1.8)
            crop = grey[y-d:y+d+1, x-d:x+d+1].astype(float)
            yy, xx = np.mgrid[-d:d+1, -d:d+1]
            distance = np.sqrt(xx*xx + yy*yy)
            white = float(np.percentile(crop[distance > radius * 1.45], 80))
            cutoff = min(180, white * .72)
            fills.append(float(np.mean(crop[distance < radius * .66] < cutoff)))
            ring_integrity.append(float(np.mean(crop[(distance > radius * .85) &
                                                       (distance < radius * 1.15)] < cutoff)))
        marked = [spec.choices[i] for i, value in enumerate(fills) if value >= MARK_MIN]
        ambiguous = any(BLANK_MAX < value < MARK_MIN for value in fills)
        # Missing outlines indicate a damaged/misaligned grid, not unanswered questions.
        if min(ring_integrity) < .15 or ambiguous:
            state, selected, confidence = "UNCERTAIN", None, .3
        elif len(marked) > 1:
            state, selected, confidence = "MULTIPLE", None, min(fills[spec.choices.index(m)] for m in marked)
        elif marked:
            state, selected = "MARKED", marked[0]
            confidence = min(fills[spec.choices.index(selected)], 1 - max(
                (v for i, v in enumerate(fills) if spec.choices[i] != selected), default=0))
        else:
            state, selected, confidence = "BLANK", None, 1 - max(fills)
        answers.append({"question": q + 1, "state": state, "selected": selected,
                        "marked": marked, "confidence": round(confidence, 3),
                        "fillRatios": [round(v, 3) for v in fills]})
    return answers
