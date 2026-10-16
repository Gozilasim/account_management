# Created at: 2026-05-16 17:43
# Updated at: 2026-10-11 12:13
# Description: Authenticated API routes for the app launcher and for the apps a person has connected to their account.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_security_event
from app.consents import list_consents, revoke_consent
from app.database import get_db
from app.deps import get_current_user
from app.models import AppConsent, OidcClient, User
from app.schemas import ConnectedAppOut, LauncherAppOut, MessageOut

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


# ###############################################
# Connected App Routes
# ###############################################

def _clean(value: str | None) -> str | None:
    return value.strip() or None if value else None


def connected_app_out(consent: AppConsent) -> ConnectedAppOut:
    client = consent.client
    # A switched-off app stays listed so its access can still be removed, but it is no longer linked to.
    return ConnectedAppOut(
        client_id=client.client_id,
        name=client.name,
        home_url=_clean(client.home_url) if client.is_active else None,
        launch_url=_clean(client.launch_url) if client.is_active else None,
        icon_url=_clean(client.icon_url),
        scopes=list(consent.scopes or []),
        granted_at=consent.granted_at,
        last_used_at=consent.last_used_at,
    )


def _recency(consent: AppConsent) -> datetime:
    moment = consent.last_used_at or consent.granted_at
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def connected_apps(db: Session, user: User) -> list[ConnectedAppOut]:
    """The apps this person has allowed, most recently used first."""
    consents = sorted(list_consents(db, user), key=_recency, reverse=True)
    return [connected_app_out(consent) for consent in consents]


@router.get("/connected", response_model=list[ConnectedAppOut])
def list_connected_apps(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConnectedAppOut]:
    return connected_apps(db, current_user)


@router.delete("/connected/{client_id}", response_model=MessageOut)
def remove_connected_app(
    client_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    # Looked up without the "active" filter, so access to a switched-off app can still be removed.
    client = db.scalar(select(OidcClient).where(OidcClient.client_id == client_id))
    if not client or not revoke_consent(db, current_user, client):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This app is not connected to your account.")

    record_security_event(
        db,
        current_user.id,
        "app_access_removed",
        request,
        metadata={"client_id": client.client_id, "app_name": client.name},
    )
    db.commit()
    return MessageOut(message="Access removed.")
