"""
Evaluation pipeline orchestrator — this is the file that implements the
"Evaluation Pipeline" section of the spec end to end:

  1. receive image            (handled by the API layer -> bytes in)
  2. validate image format    -> utils.image_validation
  3. detect watermark         -> services.ai.watermark
  4. if watermark: score = 0, stop
  5. generate embedding       -> services.ai.siglip
  6. load reference embedding -> DB
  7. cosine similarity        -> utils.scoring
  8. final score               -> utils.scoring
  9. save submission + score  -> DB
  10. return result             -> caller (background task or sync path)
  11. update leaderboard      -> services.leaderboard

Runs as a FastAPI BackgroundTask so POST /submission returns immediately
with status=PENDING, and the frontend polls GET /submission/{id} (or you
wire a websocket later) for the SCORED/REJECTED_WATERMARK result.
"""
from __future__ import annotations

import time
import uuid

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging_config import get_logger
from app.config.settings import get_settings
from app.models.reference_embedding import ReferenceEmbedding
from app.models.reference_image import ReferenceImage
from app.models.score import Score
from app.models.submission import Submission, SubmissionStatus
from app.services.ai.siglip import get_embedding_service
from app.services.ai.watermark import get_watermark_detector
from app.services.leaderboard.leaderboard_service import LeaderboardService
from app.services.storage import get_storage_service
from app.utils.image_validation import validate_upload
from app.utils.scoring import cosine_similarity, similarity_to_score

logger = get_logger(__name__)


class EvaluationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.settings = get_settings()
        self.storage = get_storage_service()
        self.embedder = get_embedding_service()
        self.watermark_detector = get_watermark_detector()
        self.leaderboard_service = LeaderboardService(db)

    async def evaluate_submission(self, submission_id: uuid.UUID, content: bytes, content_type: str) -> Submission:
        """
        The full 11-step pipeline. Called from a background task after the
        submission row is created with status=PENDING. Every exit path
        writes a terminal status so the row never hangs at PENDING.
        """
        start = time.perf_counter()
        submission = await self._get_submission(submission_id)
        submission.status = SubmissionStatus.PROCESSING
        await self.db.commit()

        try:
            # Step 2: validate
            validate_upload(content, content_type)

            # Step 3-4: watermark detection
            reference_image = await self._get_reference_image(submission.challenge_id)
            watermarked_reference_bytes = await self.storage.load(reference_image.watermarked_storage_key)

            watermark_result = self.watermark_detector.detect(
                submission_bytes=content,
                watermarked_reference_bytes=watermarked_reference_bytes,
            )
            submission.watermark_detected = watermark_result.watermark_detected
            submission.watermark_confidence = watermark_result.confidence

            if watermark_result.watermark_detected:
                logger.info("submission_rejected_watermark", submission_id=str(submission_id), confidence=watermark_result.confidence)
                submission.status = SubmissionStatus.REJECTED_WATERMARK
                submission.processing_time_ms = int((time.perf_counter() - start) * 1000)
                await self.db.flush()
                self.db.add(Score(submission_id=submission.id, similarity=0.0, final_score=0.0, model_used="none"))
                await self.db.commit()
                await self.leaderboard_service.update_for_submission(submission)
                return submission

            # Step 5: generate embedding for the submission
            submission_vector, embed_ms = self.embedder.embed_image_bytes(content)

            # Step 6: load cached reference embedding
            reference_embedding = await self._get_reference_embedding(reference_image.id)
            reference_vector = np.array(reference_embedding.vector, dtype=np.float32)

            # Step 7: cosine similarity
            similarity = cosine_similarity(submission_vector, reference_vector)

            # Step 8: convert to final score
            final_score = similarity_to_score(
                similarity,
                slope=self.settings.similarity_to_score_slope,
                intercept=self.settings.similarity_to_score_intercept,
                max_score=self.settings.max_score,
            )

            # Step 9: persist
            submission.status = SubmissionStatus.SCORED
            submission.processing_time_ms = int((time.perf_counter() - start) * 1000)
            self.db.add(
                Score(
                    submission_id=submission.id,
                    similarity=similarity,
                    final_score=final_score,
                    model_used=self.embedder.model_name,
                )
            )
            await self.db.commit()

            logger.info(
                "submission_scored",
                submission_id=str(submission_id),
                similarity=similarity,
                final_score=final_score,
                embed_ms=embed_ms,
                total_ms=submission.processing_time_ms,
            )

            # Step 11: leaderboard update
            await self.leaderboard_service.update_for_submission(submission)
            return submission

        except Exception as exc:
            logger.error("submission_evaluation_failed", submission_id=str(submission_id), error=str(exc))
            submission.status = SubmissionStatus.FAILED
            submission.error_message = str(exc)[:1000]
            submission.processing_time_ms = int((time.perf_counter() - start) * 1000)
            await self.db.commit()
            raise

    async def _get_submission(self, submission_id: uuid.UUID) -> Submission:
        result = await self.db.execute(select(Submission).where(Submission.id == submission_id))
        submission = result.scalar_one_or_none()
        if submission is None:
            raise NotFoundError(f"Submission {submission_id} not found")
        return submission

    async def _get_reference_image(self, challenge_id: uuid.UUID) -> ReferenceImage:
        result = await self.db.execute(
            select(ReferenceImage).where(ReferenceImage.challenge_id == challenge_id)
        )
        reference_image = result.scalar_one_or_none()
        if reference_image is None:
            raise NotFoundError("This challenge has no reference image uploaded yet")
        return reference_image

    async def _get_reference_embedding(self, reference_image_id: uuid.UUID) -> ReferenceEmbedding:
        result = await self.db.execute(
            select(ReferenceEmbedding).where(ReferenceEmbedding.reference_image_id == reference_image_id)
        )
        embedding = result.scalar_one_or_none()
        if embedding is None:
            raise NotFoundError("Reference embedding has not been computed yet")
        return embedding

    async def generate_reference_embedding(self, reference_image: ReferenceImage) -> ReferenceEmbedding:
        """Called once, right after the admin uploads a reference image (see api/challenges.py)."""
        original_bytes = await self.storage.load(reference_image.original_storage_key)
        vector, elapsed_ms = self.embedder.embed_image_bytes(original_bytes)
        logger.info("reference_embedding_generated", reference_image_id=str(reference_image.id), elapsed_ms=elapsed_ms)

        embedding = ReferenceEmbedding(
            reference_image_id=reference_image.id,
            model_name=self.embedder.model_name,
            vector=vector.tolist(),
            dimension=vector.shape[0],
        )
        self.db.add(embedding)
        await self.db.commit()
        await self.db.refresh(embedding)
        return embedding
