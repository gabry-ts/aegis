# AEGIS backend — FastAPI served by uvicorn. Runs fully offline in mock mode.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DB_PATH=/data/aegis.db

WORKDIR /app

# Install dependencies first so the layer is cached across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code. Rule packs and the endpoint registry travel inside aegis/.
COPY aegis ./aegis
COPY demo ./demo

# Run unprivileged, with a writable directory for the sqlite audit log.
RUN useradd --create-home --uid 1000 aegis \
    && mkdir -p /data \
    && chown -R aegis:aegis /app /data
USER aegis

EXPOSE 8000
CMD ["uvicorn", "aegis.main:app", "--host", "0.0.0.0", "--port", "8000"]
