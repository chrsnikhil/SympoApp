from __future__ import annotations

import hashlib
import uuid

from fastapi import APIRouter, Depends, UploadFile, File
from PIL import Image
import io

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.exceptions import NotFoundError, InvalidImageError
from app.core.logging_config import get_logger
from app.database.database import get_db
from app.models.challenge import Challenge, ChallengeStatus
from app.models.reference_image import ReferenceImage
from app.models.user import User, UserRole
from app.schemas.challenge import ChallengeCreate, ChallengeRead, ReferenceImageRead
from app.services.evaluation_service import EvaluationService
from app.services.storage import get_storage_service
from app.utils.image_validation import validate_upload
from app.utils.watermarking import apply_watermark

router = APIRouter(prefix="/challenge", tags=["challenges"])
logger = get_logger(__name__)


@router.post("", response_model=ChallengeRead, status_code=201)
async def create_challenge(
    payload: ChallengeCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.ADMIN)),
) -> ChallengeRead:
    challenge = Challenge(
        title=payload.title,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status=ChallengeStatus.DRAFT,
        created_by_id=admin.id,
    )
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    return ChallengeRead.model_validate(challenge)


@router.get("", response_model=list[ChallengeRead])
async def list_challenges(db: AsyncSession = Depends(get_db)) -> list[ChallengeRead]:
    result = await db.execute(select(Challenge).order_by(Challenge.created_at.desc()))
    challenges = result.scalars().all()
    return [
        ChallengeRead.model_validate(c, update={"has_reference_image": bool(c.reference_images)})
        for c in challenges
    ]


@router.get("/{challenge_id}", response_model=ChallengeRead)
async def get_challenge(challenge_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> ChallengeRead:
    challenge = await db.get(Challenge, challenge_id)
    if challenge is None:
        raise NotFoundError("Challenge not found")
    return ChallengeRead.model_validate(challenge, update={"has_reference_image": bool(challenge.reference_images)})


@router.post("/{challenge_id}/reference", response_model=ReferenceImageRead, status_code=201)
async def upload_reference_image(
    challenge_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.ADMIN)),
) -> ReferenceImageRead:
    """
    Admin-only. Stores the ORIGINAL (used for scoring, never served to
    participants) and a watermarked copy (served via GET, what participants
    see), then kicks off reference-embedding generation immediately so the
    first submission doesn't pay that cost.
    """
    challenge = await db.get(Challenge, challenge_id)
    if challenge is None:
        raise NotFoundError("Challenge not found")

    content = await file.read()
    validate_upload(content, file.content_type or "")

    try:
        image = Image.open(io.BytesIO(content))
        width, height = image.size
    except Exception as exc:
        raise InvalidImageError(f"Could not read image dimensions: {exc}") from exc

    content_hash = hashlib.sha256(content).hexdigest()
    watermarked_bytes = apply_watermark(content)

    storage = get_storage_service()
    original_key = f"references/{challenge_id}/original.jpg"
    watermarked_key = f"references/{challenge_id}/watermarked.jpg"
    await storage.save(original_key, content, file.content_type or "image/jpeg")
    await storage.save(watermarked_key, watermarked_bytes, "image/jpeg")

    # Replace any existing reference image for this challenge (unique constraint on challenge_id).
    existing = await db.execute(select(ReferenceImage).where(ReferenceImage.challenge_id == challenge_id))
    existing_ref = existing.scalar_one_or_none()
    if existing_ref is not None:
        await db.delete(existing_ref)
        await db.flush()

    reference_image = ReferenceImage(
        challenge_id=challenge_id,
        original_storage_key=original_key,
        watermarked_storage_key=watermarked_key,
        width=width,
        height=height,
        content_hash=content_hash,
    )
    db.add(reference_image)
    challenge.status = ChallengeStatus.ACTIVE
    await db.commit()
    await db.refresh(reference_image)

    evaluation_service = EvaluationService(db)
    await evaluation_service.generate_reference_embedding(reference_image)

    watermarked_url = await storage.get_url(watermarked_key)
    logger.info("reference_image_uploaded", challenge_id=str(challenge_id), admin_id=str(admin.id))
    return ReferenceImageRead(
        id=reference_image.id,
        challenge_id=challenge_id,
        watermarked_url=watermarked_url,
        width=width,
        height=height,
        created_at=reference_image.created_at,
    )
