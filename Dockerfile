# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + embedded static files ───────────────────────────
FROM python:3.11-slim
WORKDIR /app

# System libs required by aiortc (opus audio, SRTP)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libopus0 libsrtp2-1 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies first (layer-cached until requirements change)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ ./

# Vite build output served as static files by FastAPI
COPY --from=frontend /build/dist ./static

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
