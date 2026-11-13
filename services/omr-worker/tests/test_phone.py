"""Phone JPEG orientation and the full 150-answer sheet at capture resolution."""
from io import BytesIO

import cv2
import pytest
from PIL import Image

from app.omr.pipeline import process_document
from app.omr.template_manager import TemplateSpec
from test_recognition import TOKEN, raster, sheet


@pytest.mark.parametrize("orientation", [1, 3, 6, 8])
def test_phone_jpeg_exif_preserves_identity_and_all_answers(orientation):
    count = 150
    image = Image.fromarray(cv2.cvtColor(raster(sheet(TemplateSpec(count, 5),
                                                    {q: [q % 5] for q in range(count)})), cv2.COLOR_BGR2RGB))
    image.thumbnail((1920, 2560))
    rotation = {3: Image.Transpose.ROTATE_180, 6: Image.Transpose.ROTATE_90, 8: Image.Transpose.ROTATE_270}
    if orientation in rotation:
        image = image.transpose(rotation[orientation])
    exif = Image.Exif()
    exif[274] = orientation
    data = BytesIO()
    image.save(data, format="JPEG", quality=95, exif=exif)
    result = process_document(data.getvalue(), "phone.jpg", "image/jpeg")
    assert result["status"] == "READ", result
    page = result["pages"][0]
    assert page["sheetToken"] == TOKEN
    assert [answer["selected"] for answer in page["answers"]] == ["ABCDE"[q % 5] for q in range(count)]
