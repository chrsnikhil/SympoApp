from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.challenge import ChallengeStatus


class ChallengeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class ChallengeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: Optional[str]
    status: ChallengeStatus
    starts_at: Optional[datetime]
    ends_at: Optional[datetime]
    created_at: datetime
    has_reference_image: bool = False


class ReferenceImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    challenge_id: uuid.UUID
    watermarked_url: str
    width: Optional[int]
    height: Optional[int]
    created_at: datetime
