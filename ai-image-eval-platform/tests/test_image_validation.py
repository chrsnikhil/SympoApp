from __future__ import annotations

import pytest

from app.core.exceptions import InvalidImageError
from app.utils.image_validation import validate_upload


def test_valid_png_passes(red_image_bytes):
    validate_upload(red_image_bytes, "image/png")


def test_empty_file_rejected():
    with pytest.raises(InvalidImageError):
        validate_upload(b"", "image/png")


def test_wrong_content_type_rejected(red_image_bytes):
    with pytest.raises(InvalidImageError):
        validate_upload(red_image_bytes, "application/pdf")


def test_corrupt_bytes_rejected():
    with pytest.raises(InvalidImageError):
        validate_upload(b"not a real image" * 10, "image/png")


def test_oversized_file_rejected(monkeypatch, red_image_bytes):
    from app.config import settings as settings_module

    settings_module.get_settings.cache_clear()
    monkeypatch.setenv("MAX_UPLOAD_SIZE_MB", "0")
    with pytest.raises(InvalidImageError):
        validate_upload(red_image_bytes, "image/png")
    settings_module.get_settings.cache_clear()
