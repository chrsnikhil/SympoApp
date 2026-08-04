"""Pure-math tests for cosine similarity and the similarity->score mapping — no model/DB needed."""
from __future__ import annotations

import numpy as np
import pytest

from app.utils.scoring import cosine_similarity, similarity_to_score


def test_cosine_similarity_identical_vectors_is_one():
    v = np.array([0.6, 0.8], dtype=np.float32)
    assert cosine_similarity(v, v) == pytest.approx(1.0, abs=1e-6)


def test_cosine_similarity_orthogonal_vectors_is_zero():
    a = np.array([1.0, 0.0], dtype=np.float32)
    b = np.array([0.0, 1.0], dtype=np.float32)
    assert cosine_similarity(a, b) == pytest.approx(0.0, abs=1e-6)


def test_cosine_similarity_is_clamped_to_zero_one():
    a = np.array([1.0, 0.0], dtype=np.float32)
    b = np.array([-1.0, 0.0], dtype=np.float32)
    result = cosine_similarity(a, b)
    assert 0.0 <= result <= 1.0


@pytest.mark.parametrize(
    "similarity,expected",
    [
        (0.95, 90.0),
        (0.90, 80.0),
        (0.80, 60.0),
        (0.70, 40.0),
    ],
)
def test_similarity_to_score_default_curve(similarity, expected):
    score = similarity_to_score(similarity, slope=200.0, intercept=-100.0, max_score=100.0)
    assert score == pytest.approx(expected)


def test_similarity_to_score_never_exceeds_max():
    score = similarity_to_score(1.0, slope=200.0, intercept=-100.0, max_score=100.0)
    assert score <= 100.0


def test_similarity_to_score_never_below_zero():
    score = similarity_to_score(0.0, slope=200.0, intercept=-100.0, max_score=100.0)
    assert score >= 0.0
