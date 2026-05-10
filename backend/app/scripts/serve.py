# Created at: 2026-05-11 01:40
# Updated at: 2026-05-11 01:40
# Description: Production-style backend server launcher for Docker.

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
        reload=False,
    )


if __name__ == "__main__":
    main()
