from __future__ import annotations

import enum
import uuid
from typing import List

from sqlalchemy import Enum, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.base import TimestampMixin


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    PARTICIPANT = "participant"
    JUDGE = "judge"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.PARTICIPANT, nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    submissions: Mapped[List["Submission"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan"
    )
    challenges_created: Mapped[List["Challenge"]] = relationship(back_populates="created_by")

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role.value})>"
