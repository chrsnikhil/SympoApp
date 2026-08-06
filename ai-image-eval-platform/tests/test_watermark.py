"""Watermark detector tests using synthetic images — verifies each signal fires correctly."""
from __future__ import annotations

from app.services.ai.watermark.detector import WatermarkDetector


def _detector() -> WatermarkDetector:
    return WatermarkDetector(confidence_threshold=0.75, ssim_threshold=0.55, orb_min_matches=15)


def test_identical_image_to_watermarked_reference_is_detected(red_image_bytes):
    detector = _detector()
    result = detector.detect(
        submission_bytes=red_image_bytes,
        watermarked_reference_bytes=red_image_bytes,
    )
    assert result.watermark_detected is True
    assert result.signals["ssim"] > 0.9


def test_unrelated_image_is_not_detected(red_image_bytes, blue_image_bytes):
    detector = _detector()
    result = detector.detect(
        submission_bytes=blue_image_bytes,
        watermarked_reference_bytes=red_image_bytes,
    )
    assert result.watermark_detected is False


def test_result_includes_all_three_signals(red_image_bytes, watermark_template_bytes):
    detector = _detector()
    result = detector.detect(
        submission_bytes=red_image_bytes,
        template_bytes=watermark_template_bytes,
        watermarked_reference_bytes=red_image_bytes,
    )
    assert set(result.signals.keys()) == {"template_match", "orb_match", "ssim"}
    assert 0.0 <= result.confidence <= 1.0
