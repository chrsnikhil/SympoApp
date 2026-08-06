"""
Application entrypoint. Run with:
    uvicorn app.main:app --host 0.0.0.0 --port 8000

Wires together: routers, CORS, request logging, rate limiting, static file
serving for local storage, structured error handling, and Swagger/OpenAPI
(served automatically by FastAPI at /docs and /openapi.json).
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api import auth, challenges, submissions, leaderboard, health
from app.config.settings import get_settings
from app.core.exceptions import AppError
from app.core.logging_config import configure_logging, get_logger
from app.middleware.logging_middleware import RequestLoggingMiddleware

settings = get_settings()
configure_logging()
logger = get_logger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.rate_limit_per_minute}/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the embedding model at startup rather than on the first request,
    # so the first participant upload isn't the one paying the model-load cost.
    from app.services.ai.siglip import get_embedding_service
    logger.info("startup_loading_model")
    get_embedding_service()
    logger.info("startup_complete")
    yield
    logger.info("shutdown")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Automated AI image generation competition scoring platform.",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

if settings.storage_backend == "local":
    app.mount("/static", StaticFiles(directory=settings.local_storage_path), name="static")


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    logger.warning("app_error", error_code=exc.error_code, message=exc.message, path=request.url.path)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "error_code": exc.error_code})


app.include_router(health.router, prefix=settings.api_v1_prefix)
app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(challenges.router, prefix=settings.api_v1_prefix)
app.include_router(submissions.router, prefix=settings.api_v1_prefix)
app.include_router(leaderboard.router, prefix=settings.api_v1_prefix)
