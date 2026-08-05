"""
Keeps leaderboard_entries as a denormalized "best score per participant"
table, recomputed after every scored/rejected submission (step 11 of the
pipeline). GET /leaderboard/{challenge_id} then just reads this table
ordered by rank — no live aggregation on the read path.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.leaderboard import LeaderboardEntry
from app.models.score import Score
from app.models.submission import Submission

logger = get_logger(__name__)


class LeaderboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_for_submission(self, submission: Submission) -> None:
        score_result = await self.db.execute(select(Score).where(Score.submission_id == submission.id))
        score = score_result.scalar_one_or_none()
        if score is None:
            return

        entry_result = await self.db.execute(
            select(LeaderboardEntry).where(
                LeaderboardEntry.challenge_id == submission.challenge_id,
                LeaderboardEntry.participant_id == submission.participant_id,
            )
        )
        entry = entry_result.scalar_one_or_none()

        if entry is None:
            entry = LeaderboardEntry(
                challenge_id=submission.challenge_id,
                participant_id=submission.participant_id,
                best_submission_id=submission.id,
                best_score=score.final_score,
                submitted_at=submission.created_at,
            )
            self.db.add(entry)
        elif score.final_score > entry.best_score:
            entry.best_submission_id = submission.id
            entry.best_score = score.final_score
            entry.submitted_at = submission.created_at

        await self.db.commit()
        await self._recompute_ranks(submission.challenge_id)

    async def _recompute_ranks(self, challenge_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(LeaderboardEntry)
            .where(LeaderboardEntry.challenge_id == challenge_id)
            .order_by(LeaderboardEntry.best_score.desc(), LeaderboardEntry.submitted_at.asc())
        )
        entries = result.scalars().all()
        for rank, entry in enumerate(entries, start=1):
            entry.rank = rank
        await self.db.commit()
        logger.info("leaderboard_recomputed", challenge_id=str(challenge_id), entries=len(entries))
