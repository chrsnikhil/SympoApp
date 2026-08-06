from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class LeaderboardRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rank: Optional[int]
    participant_id: uuid.UUID
    participant_name: str
    best_score: float
    submitted_at: datetime


class LeaderboardResponse(BaseModel):
    challenge_id: uuid.UUID
    entries: List[LeaderboardRow]
    generated_at: datetime
