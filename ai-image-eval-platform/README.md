# AI Image Evaluation Platform — Backend

Automated scoring backend for an AI image generation competition. Admin
uploads a reference image (participants only ever see a watermarked
version); participants upload their AI-generated attempt; the backend
detects watermark copying, embeds the image with **SigLIP 2** (CLIP
fallback), computes cosine similarity against the reference, converts it to
a score, and updates a live leaderboard — no human scoring.

Frontend is developed separately — see [`frontend/API_CONTRACT.md`](frontend/API_CONTRACT.md)
for the full endpoint reference and example calls.

## Quick start

```bash
cp .env.example .env
# edit .env — at minimum set a real JWT_SECRET_KEY

docker compose up --build
```

- API: http://localhost:8000/api/v1
- Swagger UI: http://localhost:8000/docs
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)

First run downloads the SigLIP 2 weights (a few hundred MB) — this happens
once at container startup (see `lifespan` in `app/main.py`), not per-request.

Create the first admin:
```bash
docker compose exec backend python scripts/create_admin.py \
  --email admin@example.com --password "changeme123" --name "Admin"
```

Dev mode (hot reload, source bind-mounted):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

GPU: set `--build-arg BASE_IMAGE=nvidia/cuda:12.1.0-runtime-ubuntu22.04` in
`docker-compose.yml`'s backend build args, uncomment the `deploy.resources`
block, and set `MODEL_DEVICE=cuda` in `.env`. CPU fallback is automatic if
no GPU is present (`MODEL_DEVICE=auto`, the default).

## Running migrations manually

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic revision --autogenerate -m "message"
```

## Tests

```bash
pip install -r requirements.txt
pytest                              # fast — no model download, no DB
RUN_MODEL_INTEGRATION_TESTS=1 pytest tests/test_embedding.py   # downloads real SigLIP 2 weights
```

## Architecture

```
app/
├── api/            FastAPI routers (auth, challenges, submissions, leaderboard, health)
├── config/          Pydantic Settings (reads .env)
├── core/            security (JWT/bcrypt), exceptions, structured logging
├── database/        async SQLAlchemy engine/session
├── models/           ORM tables — Users, Challenges, ReferenceImages,
│                     ReferenceEmbeddings, Submissions, Scores,
│                     LeaderboardEntries, AuditLogs
├── schemas/          Pydantic request/response contracts
├── services/
│   ├── ai/siglip/     SigLIP 2 embedder + CLIP fallback, one interface
│   ├── ai/watermark/  OpenCV watermark detector (template match + SSIM + ORB)
│   ├── storage/       local disk / S3-MinIO, one interface
│   ├── auth/           register/login logic
│   ├── leaderboard/    best-score-per-participant + rank recompute
│   └── evaluation_service.py   the 11-step pipeline, orchestrates everything above
├── middleware/       request logging
└── main.py           app wiring: CORS, rate limiting, routers, exception handlers
```

**Swapping models:** change `EMBEDDING_MODEL=siglip2|clip` in `.env`. If
SigLIP 2 fails to load (offline, weights unavailable), `EmbeddingService`
automatically falls back to CLIP and logs a warning — no code change needed.

**Scoring curve:** `similarity_to_score(similarity) = clamp(slope * similarity + intercept, 0, max_score)`,
tunable via `SIMILARITY_TO_SCORE_SLOPE` / `_INTERCEPT` / `MAX_SCORE` in `.env`
without touching code.

**Watermark rejection:** a weighted combination of template matching (0.45),
SSIM against the watermarked reference (0.35), and ORB feature matching
(0.20). Crossing `WATERMARK_CONFIDENCE_THRESHOLD` short-circuits the
pipeline with `score = 0` before any embedding is computed.
