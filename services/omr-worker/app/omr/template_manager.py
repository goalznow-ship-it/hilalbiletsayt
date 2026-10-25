"""OMR template definitions.

The Hilal answer sheet contains 150 questions with five choices (A-E).
"""

from __future__ import annotations

from dataclasses import dataclass

QUESTION_COUNT = 150
CHOICE_LABELS = ("A", "B", "C", "D", "E")
CHOICE_COUNT = len(CHOICE_LABELS)


@dataclass(frozen=True)
class TemplateSpec:
    question_count: int = QUESTION_COUNT
    choice_count: int = CHOICE_COUNT
    choices: tuple[str, ...] = CHOICE_LABELS


DEFAULT_TEMPLATE = TemplateSpec()
