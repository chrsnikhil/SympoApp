"""Shared fixtures — synthetic images generated in-memory so tests never depend on fixture files."""
from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image


def _make_image_bytes(color: tuple[int, int, int], size: tuple[int, int] = (256, 256), fmt: str = "PNG") -> bytes:
    image = Image.new("RGB", size, color=color)
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture
def red_image_bytes() -> bytes:
    return _make_image_bytes((220, 30, 30))


@pytest.fixture
def blue_image_bytes() -> bytes:
    return _make_image_bytes((30, 30, 220))


@pytest.fixture
def near_red_image_bytes() -> bytes:
    return _make_image_bytes((210, 40, 35))


@pytest.fixture
def watermark_template_bytes() -> bytes:
    """A distinctive checkerboard patch used as a watermark template in tests."""
    arr = np.zeros((40, 40), dtype=np.uint8)
    arr[::4, ::4] = 255
    arr[2::4, 2::4] = 255
    image = Image.fromarray(arr).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
