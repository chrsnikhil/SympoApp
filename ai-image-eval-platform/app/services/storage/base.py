"""
Storage interface. Both LocalStorageService and S3StorageService implement
this so services/evaluation code never knows which backend is active —
swap STORAGE_BACKEND in .env and nothing else changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class StorageService(ABC):
    @abstractmethod
    async def save(self, key: str, content: bytes, content_type: str) -> str:
        """Persist bytes under `key`. Returns the storage key (not a public URL)."""

    @abstractmethod
    async def load(self, key: str) -> bytes:
        """Read bytes back by key. Raises StorageError if missing."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Remove an object. No-op if it doesn't exist."""

    @abstractmethod
    async def get_url(self, key: str, expires_seconds: int = 3600) -> str:
        """Public or presigned URL the frontend can render directly in an <img>."""
