# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 02:42
# Description: FastAPI application factory and router registration.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.oidc_clients import sync_configured_oidc_clients
from app.routers import auth, oidc, profile

logger = logging.getLogger(__name__)


# ###############################################
# App Factory
# ###############################################

def create_app(sync_oidc_clients_on_startup: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if sync_oidc_clients_on_startup:
            synced_count = sync_configured_oidc_clients()
            if synced_count:
                logger.info("Synced %s OIDC integrated app(s) from OIDC_CLIENTS_JSON.", synced_count)
        yield

    app = FastAPI(title="Account Management Portal", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(profile.router)
    app.include_router(oidc.router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
