from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.schemas.common import HealthResponse
from app.services.ai.siglip import get_embedding_service

router = APIRouter(tags=["ops"])


@router.get("/health", response_model=HealthResponse)
async def health(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:
        db_status = f"error: {exc}"

    embedder = get_embedding_service()
    return HealthResponse(
        status="ok" if db_status == "ok" else "degraded",
        database=db_status,
        model_loaded=embedder.is_loaded,
        device=embedder.device,
    )


@router.get("/metrics")
async def metrics() -> dict:
    """Minimal Prometheus-style plaintext metrics stub — extend with prometheus_client if needed."""
    embedder = get_embedding_service()
    return {
        "model_name": embedder.model_name,
        "device": embedder.device,
    }
