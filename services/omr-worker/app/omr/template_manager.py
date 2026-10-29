"""hilal-a4-v1: millimetres from A4 top-left; shared by writer and reader.

Never edit issued v1 coordinates: introduce a new version. Four DICT_4X4_50
markers have 8 mm sides. Three columns have up to 50 rows at 3.8 mm pitch.
"""
from dataclasses import dataclass

VERSION = "hilal-a4-v1"
WIDTH_MM, HEIGHT_MM = 210, 297
PX_PER_MM = 6
MARKER_SIZE = 8
MARKERS = {0: (10, 10), 1: (192, 10), 2: (192, 279), 3: (10, 279)}
QR_RECT = (157, 24, 197, 64)
BUBBLE_RADIUS = 1.2


@dataclass(frozen=True)
class TemplateSpec:
    question_count: int = 150
    choice_count: int = 5

    def __post_init__(self):
        if type(self.question_count) is not int or not 1 <= self.question_count <= 150:
            raise ValueError("question_count must be 1..150")
        if type(self.choice_count) is not int or not 2 <= self.choice_count <= 5:
            raise ValueError("choice_count must be 2..5")

    @property
    def choices(self):
        return tuple("ABCDE"[:self.choice_count])

    def bubble(self, question: int, choice: int):
        if not 0 <= question < self.question_count or not 0 <= choice < self.choice_count:
            raise ValueError("Bubble outside template")
        column, row = divmod(question, 50)
        return 28 + column * 64 + choice * 5.3, 80 + row * 3.8


DEFAULT_TEMPLATE = TemplateSpec()
