# syntax=docker/dockerfile:1

# ---- Stage 1: build the static frontend export ----
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
# next.config.ts sets `output: "export"`, so `npm run build` produces
# /app/frontend/out -- plain static HTML/CSS/JS, no Node server involved.

# ---- Stage 2: backend runtime ----
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS backend
WORKDIR /app/backend

# Install dependencies first (cache-friendly: only re-runs when
# pyproject.toml/uv.lock change, not on every source edit).
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-install-project

COPY backend/app ./app
RUN uv sync --locked

# The document catalog and the built frontend are the other things the
# backend serves at runtime. (templates/ isn't copied in yet -- nothing
# reads template files until a future issue adds document generation.)
COPY catalog.json /app/catalog.json
COPY --from=frontend-build /app/frontend/out /app/frontend/out

ENV PRELEGAL_STATIC_DIR=/app/frontend/out \
    PRELEGAL_CATALOG_PATH=/app/catalog.json \
    PRELEGAL_DB_PATH=/app/backend/data/app.db \
    PATH="/app/backend/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
