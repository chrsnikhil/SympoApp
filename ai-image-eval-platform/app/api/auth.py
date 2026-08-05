from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.models.user import UserRole
from app.schemas.user import TokenResponse, UserCreate, UserLogin, UserRead
from app.services.auth.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Public self-registration always creates a PARTICIPANT — admins are seeded via scripts/create_admin.py."""
    service = AuthService(db)
    user = await service.register(payload, role=UserRole.PARTICIPANT)
    access, refresh = service.issue_tokens(user)
    return TokenResponse(access_token=access, refresh_token=refresh, user=UserRead.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    service = AuthService(db)
    user = await service.authenticate(payload)
    access, refresh = service.issue_tokens(user)
    return TokenResponse(access_token=access, refresh_token=refresh, user=UserRead.model_validate(user))
