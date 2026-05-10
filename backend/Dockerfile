# Created at: 2026-05-11 01:40
# Updated at: 2026-05-11 01:40
# Description: Docker image for the FastAPI backend service.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORTAL_PROJECT_ROOT=/app

WORKDIR /app/backend

COPY backend/pyproject.toml backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY backend/docker-entrypoint.sh /usr/local/bin/backend-entrypoint

RUN chmod +x /usr/local/bin/backend-entrypoint \
    && python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -e .

EXPOSE 8000

ENTRYPOINT ["backend-entrypoint"]
CMD ["python", "-m", "app.scripts.serve"]
