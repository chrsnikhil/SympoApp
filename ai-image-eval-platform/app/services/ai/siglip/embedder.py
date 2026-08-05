"""
Embedding generation. SigLIP 2 is primary; CLIP is a drop-in fallback used
if SigLIP fails to load (e.g. offline, weights unavailable) — both expose
the same `embed_image(bytes) -> np.ndarray` contract so nothing upstream
(evaluation_service) needs to know which one is active.

Model swap = change EMBEDDING_MODEL in .env. No other code changes.
"""
from __future__ import annotations

import io
import time
from abc import ABC, abstractmethod
from functools import lru_cache
from typing import Literal

import numpy as np
import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor, CLIPModel, CLIPProcessor

from app.config.settings import get_settings
from app.core.exceptions import ModelInferenceError, InvalidImageError
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def resolve_device(preference: str) -> str:
    if preference == "cuda" and torch.cuda.is_available():
        return "cuda"
    if preference == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return "cpu"


def load_image_from_bytes(content: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(content))
        image.verify()
        image = Image.open(io.BytesIO(content)).convert("RGB")
        return image
    except Exception as exc:
        raise InvalidImageError(f"Could not decode image: {exc}") from exc


class BaseEmbedder(ABC):
    model_name: str

    @abstractmethod
    def embed(self, image: Image.Image) -> np.ndarray:
        """Return an L2-normalized embedding vector for a single image."""

    def embed_batch(self, images: list[Image.Image]) -> np.ndarray:
        """Default: sequential. Subclasses override for true batched inference."""
        return np.stack([self.embed(img) for img in images])


class SiglipEmbedder(BaseEmbedder):
    def __init__(self, model_name: str, device: str, cache_dir: str):
        self.model_name = model_name
        self.device = device
        logger.info("loading_model", model=model_name, device=device)
        self.processor = AutoProcessor.from_pretrained(model_name, cache_dir=cache_dir)
        self.model = AutoModel.from_pretrained(model_name, cache_dir=cache_dir).to(device).eval()

    @torch.inference_mode()
    def embed(self, image: Image.Image) -> np.ndarray:
        return self.embed_batch([image])[0]

    @torch.inference_mode()
    def embed_batch(self, images: list[Image.Image]) -> np.ndarray:
        inputs = self.processor(images=images, return_tensors="pt").to(self.device)
        features = self.model.get_image_features(**inputs)
        features = features / features.norm(p=2, dim=-1, keepdim=True)
        return features.cpu().numpy().astype(np.float32)


class ClipEmbedder(BaseEmbedder):
    """Fallback embedder — same interface, used automatically if SigLIP fails to load."""

    def __init__(self, model_name: str, device: str, cache_dir: str):
        self.model_name = model_name
        self.device = device
        logger.info("loading_fallback_model", model=model_name, device=device)
        self.processor = CLIPProcessor.from_pretrained(model_name, cache_dir=cache_dir)
        self.model = CLIPModel.from_pretrained(model_name, cache_dir=cache_dir).to(device).eval()

    @torch.inference_mode()
    def embed(self, image: Image.Image) -> np.ndarray:
        return self.embed_batch([image])[0]

    @torch.inference_mode()
    def embed_batch(self, images: list[Image.Image]) -> np.ndarray:
        inputs = self.processor(images=images, return_tensors="pt").to(self.device)
        features = self.model.get_image_features(**inputs)
        features = features / features.norm(p=2, dim=-1, keepdim=True)
        return features.cpu().numpy().astype(np.float32)


class EmbeddingService:
    """Public facade used by evaluation_service. Handles model selection + fallback + timing logs."""

    def __init__(self):
        settings = get_settings()
        self.device = resolve_device(settings.model_device)
        self.batch_size = settings.embedding_batch_size
        self._embedder: BaseEmbedder = self._load_primary(settings)

    def _load_primary(self, settings) -> BaseEmbedder:
        try:
            if settings.embedding_model == "siglip2":
                return SiglipEmbedder(settings.siglip_model_name, self.device, settings.model_cache_dir)
            return ClipEmbedder(settings.clip_model_name, self.device, settings.model_cache_dir)
        except Exception as exc:
            logger.warning("primary_model_load_failed", error=str(exc), falling_back_to="clip")
            try:
                return ClipEmbedder(settings.clip_model_name, self.device, settings.model_cache_dir)
            except Exception as fallback_exc:
                raise ModelInferenceError(
                    f"Both primary and fallback embedding models failed to load: {fallback_exc}"
                ) from fallback_exc

    @property
    def model_name(self) -> str:
        return self._embedder.model_name

    @property
    def is_loaded(self) -> bool:
        return self._embedder is not None

    def embed_image_bytes(self, content: bytes) -> tuple[np.ndarray, int]:
        """Returns (normalized embedding, elapsed_ms)."""
        image = load_image_from_bytes(content)
        start = time.perf_counter()
        try:
            vector = self._embedder.embed(image)
        except Exception as exc:
            raise ModelInferenceError(f"Embedding generation failed: {exc}") from exc
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info("embedding_generated", model=self.model_name, elapsed_ms=elapsed_ms, dim=vector.shape[0])
        return vector, elapsed_ms

    def embed_image_batch(self, contents: list[bytes]) -> tuple[np.ndarray, int]:
        images = [load_image_from_bytes(c) for c in contents]
        start = time.perf_counter()
        vectors = self._embedder.embed_batch(images)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info("batch_embedding_generated", model=self.model_name, count=len(images), elapsed_ms=elapsed_ms)
        return vectors, elapsed_ms


@lru_cache
def get_embedding_service() -> EmbeddingService:
    """Singleton — model loads once per process, not once per request."""
    return EmbeddingService()
