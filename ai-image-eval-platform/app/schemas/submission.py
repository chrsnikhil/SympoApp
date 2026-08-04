from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.submission import SubmissionStatus


class SubmissionCreateResponse(BaseModel):
    """Returned immediately on upload — evaluation may still be running in the background."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    challenge_id: uuid.UUID
    status: SubmissionStatus
    created_at: datetime


class SubmissionResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    challenge_id: uuid.UUID
    status: SubmissionStatus
    watermark_detected: Optional[bool]
    watermark_confidence: Optional[float]
    similarity: Optional[float] = None
    final_score: Optional[float] = None
    model_used: Optional[str] = None
    processing_time_ms: Optional[int]
    error_message: Optional[str]
    created_at: datetime
