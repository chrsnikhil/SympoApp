from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.core.logging_config import get_logger
from app.database.database import AsyncSessionLocal, get_db
from app.models.challenge import Challenge
from app.models.score import Score
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.submission import SubmissionCreateResponse, SubmissionResult
from app.services.evaluation_service import EvaluationService
from app.services.storage import get_storage_service
from app.utils.image_validation import validate_upload

router = APIRouter(prefix="/submission", tags=["submissions"])
logger = get_logger(__name__)


async def _run_evaluation_in_background(submission_id: uuid.UUID, content: bytes, content_type: str) -> None:
    """
    Runs in its own DB session because the request's session is closed by
    the time BackgroundTasks executes (it runs after the response is sent).
    """
    async with AsyncSessionLocal() as db:
        service = EvaluationService(db)
        try:
            await service.evaluate_submission(submission_id, content, content_type)
        except Exception:
            logger.exception("background_evaluation_error", submission_id=str(submission_id))


@router.post("", response_model=SubmissionCreateResponse, status_code=202)
async def create_submission(
    background_tasks: BackgroundTasks,
    challenge_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    participant: User = Depends(require_role(UserRole.PARTICIPANT)),
) -> SubmissionCreateResponse:
    """
    Accepts the upload, validates + stores it, creates a PENDING submission
    row, and schedules the evaluation pipeline as a background task so the
    HTTP response returns instantly (per the spec's "response returned
    instantly" requirement) while scoring happens async.
    """
    challenge = await db.get(Challenge, challenge_id)
    if challenge is None:
        raise NotFoundError("Challenge not found")

    content = await file.read()
    validate_upload(content, file.content_type or "")

    storage = get_storage_service()
    submission_id = uuid.uuid4()
    storage_key = f"submissions/{challenge_id}/{participant.id}/{submission_id}.jpg"
    await storage.save(storage_key, content, file.content_type or "image/jpeg")

    submission = Submission(
        id=submission_id,
        challenge_id=challenge_id,
        participant_id=participant.id,
        storage_key=storage_key,
        status=SubmissionStatus.PENDING,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    background_tasks.add_task(_run_evaluation_in_background, submission.id, content, file.content_type or "image/jpeg")
    logger.info("submission_created", submission_id=str(submission.id), participant_id=str(participant.id))

    return SubmissionCreateResponse.model_validate(submission)


@router.get("/{submission_id}", response_model=SubmissionResult)
async def get_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionResult:
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if submission is None:
        raise NotFoundError("Submission not found")

    if user.role == UserRole.PARTICIPANT and submission.participant_id != user.id:
        raise PermissionDeniedError("You can only view your own submissions")

    score_result = await db.execute(select(Score).where(Score.submission_id == submission.id))
    score = score_result.scalar_one_or_none()

    return SubmissionResult(
        id=submission.id,
        challenge_id=submission.challenge_id,
        status=submission.status,
        watermark_detected=submission.watermark_detected,
        watermark_confidence=submission.watermark_confidence,
        similarity=score.similarity if score else None,
        final_score=score.final_score if score else None,
        model_used=score.model_used if score else None,
        processing_time_ms=submission.processing_time_ms,
        error_message=submission.error_message,
        created_at=submission.created_at,
    )
