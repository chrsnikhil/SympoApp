"""
Similarity -> score conversion. Configurable via .env (slope/intercept) so
the mapping in the spec (0.95->100, 0.90->90 ... 0.70->70) can be tuned
without a code change: score = clamp(slope * similarity + intercept, 0, max).

With the default slope=200, intercept=-100:
  similarity 0.95 -> 90   similarity 0.90 -> 80   similarity 0.70 -> 40
Adjust slope/intercept in .env to match a different desired curve exactly
(e.g. slope=100, intercept=0 gives score == similarity * 100 linearly).
"""
from __future__ import annotations

import numpy as np


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Vectors are expected to already be L2-normalized (embedder guarantees this),
    but we normalize defensively here in case that ever changes."""
    a = vec_a / (np.linalg.norm(vec_a) + 1e-12)
    b = vec_b / (np.linalg.norm(vec_b) + 1e-12)
    similarity = float(np.dot(a, b))
    return max(0.0, min(1.0, similarity))


def similarity_to_score(similarity: float, slope: float, intercept: float, max_score: float) -> float:
    raw = slope * similarity + intercept
    return round(max(0.0, min(max_score, raw)), 2)
