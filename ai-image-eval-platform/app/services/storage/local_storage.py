from __future__ import annotations

import asyncio
import os

from app.config.settings import get_settings
from app.core.exceptions import StorageError
from app.services.storage.base import StorageService


class LocalStorageService(StorageService):
    """Disk-backed storage for dev / small deployments. Files served by main.py's static mount."""

    def __init__(self) -> None:
        settings = get_settings()
        self.root = settings.local_storage_path
        os.makedirs(self.root, exist_ok=True)

    def _path(self, key: str) -> str:
        full_path = os.path.normpath(os.path.join(self.root, key))
        if not full_path.startswith(os.path.normpath(self.root)):
            raise StorageError("Invalid storage key (path traversal attempt)")
        return full_path

    async def save(self, key: str, content: bytes, content_type: str) -> str:
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        await asyncio.to_thread(self._write, path, content)
        return key

    @staticmethod
    def _write(path: str, content: bytes) -> None:
        with open(path, "wb") as f:
            f.write(content)

    async def load(self, key: str) -> bytes:
        path = self._path(key)
        if not os.path.exists(path):
            raise StorageError(f"Object not found: {key}")
        return await asyncio.to_thread(self._read, path)

    @staticmethod
    def _read(path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if os.path.exists(path):
            await asyncio.to_thread(os.remove, path)

    async def get_url(self, key: str, expires_seconds: int = 3600) -> str:
        return f"/static/{key}"
