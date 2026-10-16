# Created at: 2026-05-11 01:40
# Updated at: 2026-10-11 01:37
# Description: Docker image for the FastAPI backend service.

# ###############################################
# Base Image
# ###############################################

FROM python:3.12-slim

# Bytecode caching is left on: the base image ships no stdlib .pyc files, so
# disabling it makes every health probe recompile the modules it imports.
ENV PYTHONUNBUFFERED=1
ENV PORTAL_PROJECT_ROOT=/app
# Keeps the app package importable from any directory without an editable install.
ENV PYTHONPATH=/app/backend

WORKDIR /app/backend

# ###############################################
# Dependencies
# ###############################################

# Install from pyproject.toml alone, before the source is copied, so a code
# change reuses this layer instead of reinstalling every package.
COPY backend/pyproject.toml ./
RUN python -c "import tomllib; print(*tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies'], sep='\n')" > /tmp/requirements.txt \
    && python -m pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# ###############################################
# Application
# ###############################################

COPY backend/docker-entrypoint.sh /usr/local/bin/backend-entrypoint
RUN chmod +x /usr/local/bin/backend-entrypoint

COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app

EXPOSE 8000

ENTRYPOINT ["backend-entrypoint"]
CMD ["python", "-m", "app.scripts.serve"]
