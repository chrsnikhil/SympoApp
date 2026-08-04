"""Domain exceptions, mapped to HTTP responses in app.main's exception handlers."""
from __future__ import annotations


class AppError(Exception):
    """Base class for all handled application errors."""
    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class InvalidTokenError(AppError):
    status_code = 401
    error_code = "invalid_token"


class AuthenticationError(AppError):
    status_code = 401
    error_code = "authentication_failed"


class PermissionDeniedError(AppError):
    status_code = 403
    error_code = "permission_denied"


class NotFoundError(AppError):
    status_code = 404
    error_code = "not_found"


class ConflictError(AppError):
    status_code = 409
    error_code = "conflict"


class InvalidImageError(AppError):
    status_code = 422
    error_code = "invalid_image"


class ModelInferenceError(AppError):
    status_code = 500
    error_code = "model_inference_failed"


class StorageError(AppError):
    status_code = 500
    error_code = "storage_failed"
