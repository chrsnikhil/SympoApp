"""Upload validation — format, size, and a basic malicious-file guard, run before anything else touches the file."""
from __future__ import annotations

import io

from PIL import Image

from app.config.settings import get_settings
from app.core.exceptions import InvalidImageError

_ALLOWED_PIL_FORMATS = {"JPEG", "PNG", "WEBP"}


def validate_upload(content: bytes, declared_content_type: str) -> None:
    settings = get_settings()

    if len(content) == 0:
        raise InvalidImageError("Uploaded file is empty")

    if len(content) > settings.max_upload_size_bytes:
        raise InvalidImageError(
            f"File exceeds max size of {settings.max_upload_size_mb}MB"
        )

    if declared_content_type not in settings.allowed_image_types:
        raise InvalidImageError(f"Unsupported content type: {declared_content_type}")

    try:
        image = Image.open(io.BytesIO(content))
        image.verify()  # cheap structural check, catches truncated/corrupt files
        # Re-open after verify() — verify() leaves the file object unusable for further ops.
        image = Image.open(io.BytesIO(content))
        if image.format not in _ALLOWED_PIL_FORMATS:
            raise InvalidImageError(f"Unsupported image format: {image.format}")
        image.load()  # forces full decode, catches decompression-bomb-style truncation issues
    except InvalidImageError:
        raise
    except Exception as exc:
        raise InvalidImageError(f"File is not a valid image: {exc}") from exc
