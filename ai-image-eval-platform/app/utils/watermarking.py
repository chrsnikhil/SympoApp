"""
Applies a visible watermark to the admin's original reference image so
participants only ever see a degraded copy — used once at upload time,
never in the scoring path (scoring compares against the ORIGINAL, not
the watermarked version, per the spec).
"""
from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


def apply_watermark(original_bytes: bytes, text: str = "PREVIEW • NOT FOR REUSE") -> bytes:
    image = Image.open(io.BytesIO(original_bytes)).convert("RGB")

    # Slightly darken so the tiled watermark text stays legible on bright images.
    image = ImageEnhance.Brightness(image).enhance(0.92)

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", size=max(18, image.width // 22))
    except OSError:
        font = ImageFont.load_default()

    tile_w, tile_h = image.width // 3, image.height // 4
    for y in range(0, image.height + tile_h, tile_h):
        for x in range(0, image.width + tile_w, tile_w):
            draw.text((x, y), text, font=font, fill=(255, 255, 255, 90))

    watermarked = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    buffer = io.BytesIO()
    watermarked.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()
