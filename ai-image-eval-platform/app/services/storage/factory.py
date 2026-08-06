from __future__ import annotations

from functools import lru_cache

from app.config.settings import get_settings
from app.services.storage.base import StorageService
from app.services.storage.local_storage import LocalStorageService
from app.services.storage.s3_storage import S3StorageService


@lru_cache
def get_storage_service() -> StorageService:
    settings = get_settings()
    if settings.storage_backend == "s3":
        return S3StorageService()
    return LocalStorageService()
