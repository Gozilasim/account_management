# Created at: 2026-10-11 11:21
# Updated at: 2026-10-11 11:36
# Description: Temporary lockouts after repeated failed sign-in, verification, and password reset attempts.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import hashlib
import math
from datetime import datetime, timedelta, timezone
from typing import NoReturn

from fastapi import HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.audit import request_ip_address
from app.config import settings
from app.models import AuthThrottle, utcnow

TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Try again later."

# Sign-in, verification codes, and password checks share one counter, so switching steps does not reset it.
SIGN_IN_SCOPE = "sign-in"
RESET_REQUEST_SCOPE = "password-reset-request"
CODE_REQUEST_SCOPE = "one-time-code-request"


# ###############################################
# Subjects
# ###############################################

def _subject(scope: str, kind: str, value: str) -> str:
    return hashlib.sha256(f"{scope}:{kind}:{value}".encode("utf-8")).hexdigest()


def throttle_subjects(request: Request | None, email: str | None = None, scope: str = SIGN_IN_SCOPE) -> list[str]:
    subjects: list[str] = []
    if email:
        subjects.append(_subject(scope, "account", email.strip().lower()))
    ip_address = request_ip_address(request)
    if ip_address:
        subjects.append(_subject(scope, "ip", ip_address))
    return subjects


# ###############################################
# Checks
# ###############################################

def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _too_many_attempts(locked_until: datetime) -> HTTPException:
    retry_after = max(1, math.ceil((locked_until - utcnow()).total_seconds()))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=TOO_MANY_ATTEMPTS_MESSAGE,
        headers={"Retry-After": str(retry_after)},
    )


def ensure_not_locked(db: Session, subjects: list[str]) -> None:
    if not subjects:
        return
    now = utcnow()
    throttles = db.scalars(select(AuthThrottle).where(AuthThrottle.subject.in_(subjects)))
    locks = [_aware(throttle.locked_until) for throttle in throttles if throttle.locked_until]
    active = [locked_until for locked_until in locks if locked_until > now]
    if active:
        raise _too_many_attempts(max(active))


# ###############################################
# Recording
# ###############################################

def record_failure(db: Session, subjects: list[str]) -> datetime | None:
    """Counts one failed attempt per subject and commits. Returns the lock expiry when this attempt caused a lock."""
    if not subjects:
        return None
    now = utcnow()
    window = timedelta(minutes=settings.auth_lockout_minutes)
    locked_until: datetime | None = None

    existing = {
        throttle.subject: throttle
        for throttle in db.scalars(select(AuthThrottle).where(AuthThrottle.subject.in_(subjects)))
    }
    for subject in subjects:
        throttle = existing.get(subject)
        if throttle is None:
            throttle = AuthThrottle(subject=subject, failure_count=0, window_started_at=now)
            db.add(throttle)
        elif now - _aware(throttle.window_started_at) > window:
            # Old failures no longer count once the window has passed.
            throttle.failure_count = 0
            throttle.window_started_at = now
            throttle.locked_until = None

        throttle.failure_count += 1
        if throttle.failure_count >= settings.auth_max_failed_attempts:
            throttle.failure_count = 0
            throttle.window_started_at = now
            throttle.locked_until = now + window
            locked_until = throttle.locked_until

    # Rows that can no longer affect anything are dropped so guessed emails do not pile up.
    stale_before = now - timedelta(days=1)
    # SQLite hands back naive datetimes, so the session must not try to re-check this filter in Python.
    db.execute(
        delete(AuthThrottle)
        .where(AuthThrottle.window_started_at < stale_before)
        .execution_options(synchronize_session=False)
    )
    db.commit()
    return locked_until


def reject_attempt(
    db: Session,
    subjects: list[str],
    detail: str,
    status_code: int = status.HTTP_401_UNAUTHORIZED,
) -> NoReturn:
    """Records the failure, then answers with the lockout if this attempt triggered it, or the normal error."""
    locked_until = record_failure(db, subjects)
    if locked_until:
        raise _too_many_attempts(locked_until)
    raise HTTPException(status_code=status_code, detail=detail)


def clear_failures(db: Session, subjects: list[str]) -> None:
    """Forgets earlier failures after a success. The caller commits."""
    if subjects:
        db.execute(
            delete(AuthThrottle).where(AuthThrottle.subject.in_(subjects)).execution_options(synchronize_session=False)
        )
