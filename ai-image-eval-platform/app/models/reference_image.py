from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import String, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.base import TimestampMixin


class ReferenceImage(Base, TimestampMixin):
    """
    The admin-uploaded ground-truth image for a challenge.
    Stores both the original (never shown to participants) and the
    watermarked version (what participants actually see).
    """
    __tablename__ = "reference_images"

    challenge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False, unique=True, index=True
    )
    original_storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    watermarked_storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    challenge: Mapped["Challenge"] = relationship(back_populates="reference_images")
    embedding: Mapped[Optional["ReferenceEmbedding"]] = relationship(
        back_populates="reference_image", cascade="all, delete-orphan", uselist=False
    )
