"""
Watermark detection using three OpenCV signals, combined into one confidence
score — deliberately not OCR-based, since a copied reference image may carry
a logo/pattern watermark rather than text:

1. Template matching  — sliding-window cross-correlation against a known
   watermark template (best when the exact watermark graphic is known).
2. SSIM                — structural similarity between the submission and
   the admin's watermarked reference, high SSIM overall = image is very
   close to (or a re-save of) the watermarked reference.
3. ORB feature matching — keypoint/descriptor matching, robust to resizing,
   cropping, and mild recompression, unlike template matching alone.

Any single strong signal or a combined weighted score above the threshold
triggers a rejection (score = 0) upstream in evaluation_service.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim

from app.config.settings import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class WatermarkResult:
    watermark_detected: bool
    confidence: float
    bounding_box: Optional[tuple[int, int, int, int]]  # x, y, w, h
    signals: dict[str, float]


def _bytes_to_gray_cv(content: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(content)).convert("RGB")
    arr = np.array(image)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)


class WatermarkDetector:
    def __init__(self, confidence_threshold: float, ssim_threshold: float, orb_min_matches: int):
        self.confidence_threshold = confidence_threshold
        self.ssim_threshold = ssim_threshold
        self.orb_min_matches = orb_min_matches
        self.orb = cv2.ORB_create(nfeatures=1000)
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    # --- Signal 1: template matching ---
    def _template_match_score(self, submission_gray: np.ndarray, template_gray: np.ndarray) -> tuple[float, Optional[tuple[int, int, int, int]]]:
        if template_gray.shape[0] > submission_gray.shape[0] or template_gray.shape[1] > submission_gray.shape[1]:
            scale = min(
                submission_gray.shape[0] / template_gray.shape[0],
                submission_gray.shape[1] / template_gray.shape[1],
            ) * 0.9
            template_gray = cv2.resize(
                template_gray, (int(template_gray.shape[1] * scale), int(template_gray.shape[0] * scale))
            )
        result = cv2.matchTemplate(submission_gray, template_gray, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)
        h, w = template_gray.shape
        bbox = (max_loc[0], max_loc[1], w, h) if max_val > 0.5 else None
        return float(max(max_val, 0.0)), bbox

    # --- Signal 2: SSIM against the watermarked reference ---
    def _ssim_score(self, submission_gray: np.ndarray, watermarked_reference_gray: np.ndarray) -> float:
        target_size = (watermarked_reference_gray.shape[1], watermarked_reference_gray.shape[0])
        resized = cv2.resize(submission_gray, target_size)
        score, _ = ssim(resized, watermarked_reference_gray, full=True)
        return float(max(score, 0.0))

    # --- Signal 3: ORB keypoint matching ---
    def _orb_score(self, submission_gray: np.ndarray, template_gray: np.ndarray) -> float:
        kp1, des1 = self.orb.detectAndCompute(template_gray, None)
        kp2, des2 = self.orb.detectAndCompute(submission_gray, None)
        if des1 is None or des2 is None or len(kp1) == 0:
            return 0.0
        matches = self.matcher.match(des1, des2)
        good_matches = [m for m in matches if m.distance < 50]
        return min(len(good_matches) / max(self.orb_min_matches, 1), 1.0)

    def detect(
        self,
        submission_bytes: bytes,
        template_bytes: Optional[bytes] = None,
        watermarked_reference_bytes: Optional[bytes] = None,
    ) -> WatermarkResult:
        submission_gray = _bytes_to_gray_cv(submission_bytes)
        signals: dict[str, float] = {}
        bbox: Optional[tuple[int, int, int, int]] = None

        if template_bytes:
            template_gray = _bytes_to_gray_cv(template_bytes)
            signals["template_match"], bbox = self._template_match_score(submission_gray, template_gray)
            signals["orb_match"] = self._orb_score(submission_gray, template_gray)
        else:
            signals["template_match"] = 0.0
            signals["orb_match"] = 0.0

        if watermarked_reference_bytes:
            reference_gray = _bytes_to_gray_cv(watermarked_reference_bytes)
            signals["ssim"] = self._ssim_score(submission_gray, reference_gray)
        else:
            signals["ssim"] = 0.0

        # Weighted combination — template match is the strongest single signal,
        # SSIM catches whole-image re-saves, ORB catches cropped/resized copies.
        confidence = (
            0.45 * signals["template_match"]
            + 0.35 * signals["ssim"]
            + 0.20 * signals["orb_match"]
        )
        detected = (
            confidence >= self.confidence_threshold
            or signals["ssim"] >= self.ssim_threshold + 0.35  # near-identical whole image
        )

        logger.info("watermark_check", signals=signals, confidence=confidence, detected=detected)
        return WatermarkResult(
            watermark_detected=detected,
            confidence=round(float(confidence), 4),
            bounding_box=bbox,
            signals=signals,
        )


@lru_cache
def get_watermark_detector() -> WatermarkDetector:
    settings = get_settings()
    return WatermarkDetector(
        confidence_threshold=settings.watermark_confidence_threshold,
        ssim_threshold=settings.watermark_ssim_threshold,
        orb_min_matches=settings.watermark_orb_min_matches,
    )
