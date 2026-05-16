# Created at: 2026-05-16 17:43
# Updated at: 2026-05-17 02:58
# Description: Authenticated app launcher API routes for connected OIDC clients.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import OidcClient, User
from app.schemas import LauncherAppOut

router = APIRouter(prefix="/api/apps", tags=["apps"])


# ###############################################
# Launcher Routes
# ###############################################

@router.get("/launcher", response_model=list[LauncherAppOut])
def list_launcher_apps(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LauncherAppOut]:
    _ = current_user
    clients = db.scalars(
        select(OidcClient)
        .where(
            OidcClient.is_active.is_(True),
            OidcClient.launcher_visible.is_(True),
            OidcClient.home_url.is_not(None),
        )
        .order_by(OidcClient.name.asc())
    ).all()

    return [
        LauncherAppOut(
            client_id=client.client_id,
            name=client.name,
            home_url=client.home_url.strip(),
            launch_url=client.launch_url.strip() if client.launch_url else None,
            icon_url=client.icon_url.strip() if client.icon_url else None,
        )
        for client in clients
        if client.home_url and client.home_url.strip()
    ]
