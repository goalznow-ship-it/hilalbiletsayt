"""A coded work number confirms QR identity; ambiguity never selects a pupil."""
from .bubble_recognition import bubble_fills, BLANK_MAX, MARK_MIN
from .template_manager import work_number_bubble


def read_work_number(grey):
    digits = []
    for column in range(8):
        fills, rings = bubble_fills(grey, [work_number_bubble(column, digit) for digit in range(10)])
        marked = [digit for digit, fill in enumerate(fills) if fill >= MARK_MIN]
        if len(marked) != 1 or min(rings) < .15 or any(BLANK_MAX < fill < MARK_MIN for fill in fills):
            return None
        digit = marked[0]
        if min(fills[digit], 1 - max(fill for index, fill in enumerate(fills) if index != digit)) < .85:
            return None
        digits.append(str(digit))
    return "".join(digits)
