from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.models.leaderboard import LeaderboardEntry
from app.models.user import User
from app.schemas.leaderboard import LeaderboardResponse, LeaderboardRow

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("/{challenge_id}", response_model=LeaderboardResponse)
async def get_leaderboard(challenge_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> LeaderboardResponse:
    result = await db.execute(
        select(LeaderboardEntry, User.display_name)
        .join(User, User.id == LeaderboardEntry.participant_id)
        .where(LeaderboardEntry.challenge_id == challenge_id)
        .order_by(LeaderboardEntry.rank.asc())
    )
    rows = result.all()

    entries = [
        LeaderboardRow(
            rank=entry.rank,
            participant_id=entry.participant_id,
            participant_name=name,
            best_score=entry.best_score,
            submitted_at=entry.submitted_at,
        )
        for entry, name in rows
    ]
    return LeaderboardResponse(challenge_id=challenge_id, entries=entries, generated_at=datetime.now(timezone.utc))
