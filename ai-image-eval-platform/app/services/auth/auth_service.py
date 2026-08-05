"""User registration/login business logic — the API layer only parses requests and calls this."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ConflictError
from app.core.logging_config import get_logger
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserLogin

logger = get_logger(__name__)


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, payload: UserCreate, role: UserRole = UserRole.PARTICIPANT) -> User:
        existing = await self.db.execute(select(User).where(User.email == payload.email))
        if existing.scalar_one_or_none() is not None:
            raise ConflictError("A user with this email already exists")

        user = User(
            email=payload.email,
            hashed_password=hash_password(payload.password),
            display_name=payload.display_name,
            role=role,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        logger.info("user_registered", user_id=str(user.id), role=role.value)
        return user

    async def authenticate(self, payload: UserLogin) -> User:
        result = await self.db.execute(select(User).where(User.email == payload.email))
        user = result.scalar_one_or_none()
        if user is None or not verify_password(payload.password, user.hashed_password):
            logger.warning("login_failed", email=payload.email)
            raise AuthenticationError("Invalid email or password")
        if not user.is_active:
            raise AuthenticationError("This account has been deactivated")
        logger.info("user_authenticated", user_id=str(user.id))
        return user

    @staticmethod
    def issue_tokens(user: User) -> tuple[str, str]:
        access = create_access_token(user.id, user.role.value)
        refresh = create_refresh_token(user.id, user.role.value)
        return access, refresh
