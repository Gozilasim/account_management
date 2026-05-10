# Created at: 2026-05-11 01:17
# Updated at: 2026-05-11 01:27
# Description: FastAPI application factory and router registration.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, oidc, profile


# ###############################################
# App Factory
# ###############################################

def create_app() -> FastAPI:
    app = FastAPI(title="Account Management Portal", version="0.1.0")

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
