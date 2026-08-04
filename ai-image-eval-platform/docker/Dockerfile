# Multi-stage backend image. Builds a CPU image by default; pass
# --build-arg BASE_IMAGE=nvidia/cuda:12.1.0-runtime-ubuntu22.04 for GPU.
ARG BASE_IMAGE=python:3.11-slim
FROM ${BASE_IMAGE} AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# If using the CUDA base image it ships without python3 — install it there only.
RUN if ! command -v python3 >/dev/null; then \
      apt-get update && apt-get install -y --no-install-recommends python3.11 python3-pip && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app

COPY requirements.txt .

# PyTorch, CPU-only.
#
# `pip install torch` from PyPI pulls the CUDA build on Linux even when the
# base image has no GPU — ~2.5GB of nvidia_cudnn / cublas / triton wheels that
# can never be used on a CPU deployment, for a ~7GB image. Installing torch
# and torchvision from PyTorch's CPU index FIRST pins the CPU builds, so the
# requirements.txt install below is satisfied by what is already present and
# never reaches for the CUDA variants.
#
# Versions are read out of requirements.txt rather than hardcoded, so this
# stays correct if the pins there ever move.
#
# For a GPU deployment, build with
#   --build-arg BASE_IMAGE=nvidia/cuda:12.1.0-runtime-ubuntu22.04 --build-arg TORCH_INDEX=
# and the CUDA wheels are used instead.
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
RUN pip install --upgrade pip && \
    if [ -n "$TORCH_INDEX" ]; then \
      TORCH_PIN=$(grep -E '^torch==' requirements.txt) && \
      VISION_PIN=$(grep -E '^torchvision==' requirements.txt) && \
      pip install --index-url "$TORCH_INDEX" "$TORCH_PIN" "$VISION_PIN"; \
    fi && \
    pip install -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY scripts ./scripts

RUN mkdir -p /data/storage /data/models

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
