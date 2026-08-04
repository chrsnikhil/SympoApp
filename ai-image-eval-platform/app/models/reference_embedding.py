from __future__ import annotations

import uuid

from sqlalchemy import String, ForeignKey, ARRAY, Float
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.base import TimestampMixin


class ReferenceEmbedding(Base, TimestampMixin):
    """
    Pre-computed embedding vector for a reference image, cached so we never
    re-run the vision model on the reference for every submission.
    """
    __tablename__ = "reference_embeddings"

    reference_image_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("reference_images.id"), nullable=False, unique=True, index=True
    )
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    vector: Mapped[list[float]] = mapped_column(ARRAY(Float), nullable=False)
    dimension: Mapped[int] = mapped_column(nullable=False)

    reference_image: Mapped["ReferenceImage"] = relationship(back_populates="embedding")
