"""Exposes get_storage_service() — the only entry point other modules should use."""
from app.services.storage.factory import get_storage_service  # noqa: F401
from app.services.storage.base import StorageService  # noqa: F401
