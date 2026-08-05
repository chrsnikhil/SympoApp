"""
Application settings.

Single source of truth for configuration. Every other module imports
`get_settings()` instead of touching `os.environ` directly, so config
stays testable (override via env vars or a `.env` file) and typed.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List, Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "AI Image Evaluation Platform"
    app_env: Literal["development", "production", "test"] = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # --- Security ---
    jwt_secret_key: str = Field(..., min_length=16)
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7

    # --- Database ---
    database_url: str
    database_url_sync: str

    # --- CORS ---
    cors_origins: List[str] = ["http://localhost:3000"]

    # --- Storage ---
    storage_backend: Literal["local", "s3"] = "local"
    local_storage_path: str = "/data/storage"
    s3_endpoint_url: str = "http://minio:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket_name: str = "eval-platform"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    # --- AI models ---
    embedding_model: Literal["siglip2", "clip"] = "siglip2"
    siglip_model_name: str = "google/siglip2-base-patch16-224"
    clip_model_name: str = "openai/clip-vit-base-patch32"
    model_device: Literal["auto", "cpu", "cuda"] = "auto"
    model_cache_dir: str = "/data/models"
    embedding_batch_size: int = 8

    # --- Watermark detection ---
    watermark_confidence_threshold: float = 0.75
    watermark_template_path: str = "/data/watermark/template.png"
    watermark_ssim_threshold: float = 0.55
    watermark_orb_min_matches: int = 15

    # --- Scoring ---
    similarity_to_score_slope: float = 200.0
    similarity_to_score_intercept: float = -100.0
    max_score: float = 100.0

    # --- Uploads ---
    max_upload_size_mb: int = 15
    allowed_image_types: List[str] = ["image/jpeg", "image/png", "image/webp"]

    # --- Rate limiting ---
    rate_limit_per_minute: int = 30

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — env is read once per process."""
    return Settings()
