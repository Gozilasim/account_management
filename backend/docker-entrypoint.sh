#!/usr/bin/env sh
# Created at: 2026-05-11 01:40
# Updated at: 2026-05-11 01:40
# Description: Backend container entrypoint that applies migrations before starting the server.

set -eu

python -m alembic upgrade head

exec "$@"
