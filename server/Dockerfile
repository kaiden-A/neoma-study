# syntax=docker/dockerfile:1
# Built with context = ./server and deployed to Cloud Run, which injects PORT
# and expects the app to listen on 0.0.0.0.

# --- Stage 1: resolve and install into /app/.venv ---------------------------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Manifest first: a source-only change reuses the dependency layer.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY . .

# --- Stage 2: runtime --------------------------------------------------------
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --create-home app

COPY --from=builder --chown=app:app /app/.venv /app/.venv
# app/ carries the FastAPI code and the Jinja email templates; the rest is
# needed for schema changes and maintenance jobs, e.g.
#   docker run --rm -e DATABASE_URL=... <image> alembic upgrade head
COPY --from=builder --chown=app:app /app/app /app/app
COPY --from=builder --chown=app:app /app/alembic /app/alembic
COPY --from=builder --chown=app:app /app/alembic.ini /app/alembic.ini
COPY --from=builder --chown=app:app /app/scripts /app/scripts

USER app

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
