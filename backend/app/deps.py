# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 00:31
# Description: Shared FastAPI dependencies for authenticated Portal users and sessions.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from datetime import timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.audit import request_ip_address
from app.models import SessionToken, User, utcnow
from app.security import hash_token


# ###############################################
# Session And User Dependencies
# ###############################################

def get_session_from_request(request: Request, db: Session) -> SessionToken:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")

    session = db.scalar(select(SessionToken).where(SessionToken.token_hash == hash_token(raw_token)))
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session.")

    now = utcnow()
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")

    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive.")

    session.last_seen_at = now
    session.last_seen_ip_address = request_ip_address(request)
    db.commit()
    db.refresh(session)
    return session


def get_user_from_request(request: Request, db: Session) -> User:
    session = get_session_from_request(request, db)
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive.")
    return user


def get_current_session(request: Request, db: Session = Depends(get_db)) -> SessionToken:
    return get_session_from_request(request, db)


def get_current_user(
    session: SessionToken = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive.")
    return user
