from __future__ import annotations

import enum
import uuid
from typing import Optional

from sqlalchemy import String, ForeignKey, Enum, Float, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.base import TimestampMixin


class SubmissionStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SCORED = "scored"
    REJECTED_WATERMARK = "rejected_watermark"
    FAILED = "failed"


class Submission(Base, TimestampMixin):
    __tablename__ = "submissions"

    challenge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False, index=True
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, name="submission_status"),
        default=SubmissionStatus.PENDING,
        nullable=False,
        index=True,
    )
    watermark_detected: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    watermark_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(nullable=True)

    challenge: Mapped["Challenge"] = relationship(back_populates="submissions")
    participant: Mapped["User"] = relationship(back_populates="submissions")
    score: Mapped[Optional["Score"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan", uselist=False
    )
