"""
Password hashing + JWT issue/verify. Nothing here touches the DB —
app.services.auth wires this to the User model.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config.settings import get_settings
from app.core.exceptions import InvalidTokenError

settings = get_settings()
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _pwd_context.verify(plain_password, hashed_password)


def _create_token(subject: uuid.UUID, role: str, expires_delta: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    return _create_token(
        user_id, role, timedelta(minutes=settings.jwt_access_token_expire_minutes), "access"
    )


def create_refresh_token(user_id: uuid.UUID, role: str) -> str:
    return _create_token(
        user_id, role, timedelta(days=settings.jwt_refresh_token_expire_days), "refresh"
    )


def decode_token(token: str, expected_type: Optional[str] = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise InvalidTokenError("Token is invalid or expired") from exc

    if expected_type and payload.get("type") != expected_type:
        raise InvalidTokenError(f"Expected a {expected_type} token")
    return payload
