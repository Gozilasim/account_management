# Created at: 2026-05-11 01:27
# Updated at: 2026-05-11 01:27
# Description: Development server launcher that reads host and port from backend .env.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import uvicorn

from app.config import settings


# ###############################################
# CLI
# ###############################################

def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=True,
    )


if __name__ == "__main__":
    main()
