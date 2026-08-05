from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.base import TimestampMixin


class LeaderboardEntry(Base, TimestampMixin):
    """
    Denormalized, per-challenge best-score-per-participant row. Rebuilt by
    LeaderboardService after every scored submission so GET /leaderboard
    is a single indexed read, not a live aggregation.
    """
    __tablename__ = "leaderboard_entries"
    __table_args__ = (UniqueConstraint("challenge_id", "participant_id", name="uq_leaderboard_participant"),)

    challenge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False, index=True
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    best_submission_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("submissions.id"), nullable=False
    )
    best_score: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)

    challenge: Mapped["Challenge"] = relationship(back_populates="leaderboard_entries")
