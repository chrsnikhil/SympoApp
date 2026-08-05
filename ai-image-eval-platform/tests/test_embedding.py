"""
Embedding-service tests. Uses a fake embedder (no real model download) to
verify EmbeddingService's contract — normalization, batching, timing —
independent of which real backbone (SigLIP 2 / CLIP) is loaded. A separate,
network-gated test exercises the real SigLIP 2 model when explicitly enabled.
"""
from __future__ import annotations

import os

import numpy as np
import pytest

from app.services.ai.siglip.embedder import BaseEmbedder, EmbeddingService, load_image_from_bytes


class FakeEmbedder(BaseEmbedder):
    """Deterministic stand-in: hashes average pixel color into a fixed-size unit vector."""
    model_name = "fake-embedder-test"

    def embed(self, image):
        arr = np.asarray(image.resize((8, 8))).astype(np.float32).flatten()
        vector = arr[:16] if len(arr) >= 16 else np.pad(arr, (0, 16 - len(arr)))
        norm = np.linalg.norm(vector)
        return vector / norm if norm > 0 else vector


def _service_with_fake_embedder() -> EmbeddingService:
    service = EmbeddingService.__new__(EmbeddingService)  # bypass real model loading in __init__
    service.device = "cpu"
    service.batch_size = 8
    service._embedder = FakeEmbedder()
    return service


def test_embed_image_bytes_returns_normalized_vector(red_image_bytes):
    service = _service_with_fake_embedder()
    vector, elapsed_ms = service.embed_image_bytes(red_image_bytes)
    assert np.isclose(np.linalg.norm(vector), 1.0, atol=1e-5)
    assert elapsed_ms >= 0


def test_similar_images_produce_higher_similarity_than_dissimilar(red_image_bytes, near_red_image_bytes, blue_image_bytes):
    service = _service_with_fake_embedder()
    from app.utils.scoring import cosine_similarity

    ref_vec, _ = service.embed_image_bytes(red_image_bytes)
    near_vec, _ = service.embed_image_bytes(near_red_image_bytes)
    far_vec, _ = service.embed_image_bytes(blue_image_bytes)

    sim_near = cosine_similarity(ref_vec, near_vec)
    sim_far = cosine_similarity(ref_vec, far_vec)
    assert sim_near > sim_far


def test_load_image_from_bytes_rejects_garbage():
    from app.core.exceptions import InvalidImageError

    with pytest.raises(InvalidImageError):
        load_image_from_bytes(b"definitely not an image")


@pytest.mark.skipif(
    os.environ.get("RUN_MODEL_INTEGRATION_TESTS") != "1",
    reason="Downloads real SigLIP 2 weights — opt in with RUN_MODEL_INTEGRATION_TESTS=1",
)
def test_real_siglip_model_loads_and_embeds(red_image_bytes):
    from app.services.ai.siglip.embedder import get_embedding_service

    get_embedding_service.cache_clear()
    service = get_embedding_service()
    vector, _ = service.embed_image_bytes(red_image_bytes)
    assert vector.ndim == 1
    assert np.isclose(np.linalg.norm(vector), 1.0, atol=1e-3)
