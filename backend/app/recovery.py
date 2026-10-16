# Created at: 2026-10-11 11:34
# Updated at: 2026-10-11 12:39
# Description: Backup codes and one-time email codes used for account recovery and email verification.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.emailer import send_code_email
from app.models import AuthChallenge, BackupCode, User, utcnow
from app.security import hash_token

logger = logging.getLogger(__name__)

BACKUP_CODE_COUNT = 10
BACKUP_CODE_LENGTH = 8
EMAIL_CODE_LENGTH = 6
EMAIL_CODE_TTL_MINUTES = 10

# Purposes of one-time email codes. Each is stored as its own AuthChallenge row.
EMAIL_VERIFICATION = "email_verification"
RECOVERY_EMAIL_SETUP = "recovery_email"
RECOVERY_SIGN_IN = "recovery_sign_in"
ACCOUNT_DELETION = "account_deletion"


# ###############################################
# Shared Helpers
# ###############################################

def digits_only(code: str | None) -> str:
    return re.sub(r"\D", "", code or "")


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def mask_email(email: str) -> str:
    """Shows enough of an address to recognize it without giving it away: "b•••@example.com"."""
    name, _, domain = email.partition("@")
    return f"{name[:1]}•••@{domain}" if domain else "•••"


# ###############################################
# Backup Codes
# ###############################################

def _backup_code_hash(user_id: str, digits: str) -> str:
    return hash_token(f"backup-code:{user_id}:{digits}")


def generate_backup_codes(db: Session, user: User) -> list[str]:
    """Replaces every existing code with a fresh set and returns the new codes. They cannot be read back later."""
    for existing in list(user.backup_codes):
        db.delete(existing)

    codes: list[str] = []
    now = utcnow()
    for _ in range(BACKUP_CODE_COUNT):
        digits = "".join(secrets.choice("0123456789") for _ in range(BACKUP_CODE_LENGTH))
        db.add(BackupCode(user_id=user.id, code_hash=_backup_code_hash(user.id, digits), created_at=now))
        codes.append(f"{digits[:4]} {digits[4:]}")
    return codes


def use_backup_code(db: Session, user: User, code: str | None) -> bool:
    """Marks the matching unused code as used. The caller commits."""
    digits = digits_only(code)
    if len(digits) != BACKUP_CODE_LENGTH:
        return False
    match = db.scalar(
        select(BackupCode).where(
            BackupCode.user_id == user.id,
            BackupCode.code_hash == _backup_code_hash(user.id, digits),
            BackupCode.used_at.is_(None),
        )
    )
    if not match:
        return False
    match.used_at = utcnow()
    return True


def unused_backup_codes(db: Session, user: User) -> list[BackupCode]:
    return list(db.scalars(select(BackupCode).where(BackupCode.user_id == user.id, BackupCode.used_at.is_(None))))


def delete_backup_codes(db: Session, user: User) -> None:
    for existing in db.scalars(select(BackupCode).where(BackupCode.user_id == user.id)):
        db.delete(existing)


# ###############################################
# One-Time Email Codes
# ###############################################

def _email_code_hash(purpose: str, user_id: str, digits: str) -> str:
    return hash_token(f"email-code:{purpose}:{user_id}:{digits}")


def _active_email_code(db: Session, user: User, purpose: str) -> AuthChallenge | None:
    challenges = db.scalars(
        select(AuthChallenge)
        .where(AuthChallenge.user_id == user.id, AuthChallenge.purpose == purpose, AuthChallenge.consumed_at.is_(None))
        .order_by(AuthChallenge.created_at.desc())
    )
    now = utcnow()
    return next((challenge for challenge in challenges if _aware(challenge.expires_at) > now), None)


def start_email_code(db: Session, user: User, purpose: str, email: str) -> str:
    """Creates a new code for this purpose and cancels any earlier one. The caller commits."""
    now = utcnow()
    earlier = db.scalars(
        select(AuthChallenge).where(
            AuthChallenge.user_id == user.id,
            AuthChallenge.purpose == purpose,
            AuthChallenge.consumed_at.is_(None),
        )
    )
    for challenge in earlier:
        challenge.consumed_at = now

    digits = "".join(secrets.choice("0123456789") for _ in range(EMAIL_CODE_LENGTH))
    db.add(
        AuthChallenge(
            user_id=user.id,
            purpose=purpose,
            metadata_json={"code_hash": _email_code_hash(purpose, user.id, digits), "email": email},
            expires_at=now + timedelta(minutes=EMAIL_CODE_TTL_MINUTES),
        )
    )
    return digits


def pending_email_code(db: Session, user: User, purpose: str) -> AuthChallenge:
    challenge = _active_email_code(db, user, purpose)
    if not challenge:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code has expired. Request a new one.")
    return challenge


def email_code_matches(challenge: AuthChallenge, user: User, code: str | None) -> bool:
    digits = digits_only(code)
    expected = (challenge.metadata_json or {}).get("code_hash")
    return len(digits) == EMAIL_CODE_LENGTH and secrets.compare_digest(
        _email_code_hash(challenge.purpose, user.id, digits), expected or ""
    )


def email_codes_available() -> bool:
    """Codes can be delivered by email, or shown to the developer when the frontend runs locally."""
    return settings.email_configured or settings.frontend_is_local


def deliver_email_code(
    background_tasks: BackgroundTasks,
    to_address: str,
    code: str,
    purpose: str,
    locale: str | None,
) -> tuple[str, str | None]:
    """Sends the code and returns (delivery, dev_code). The code itself is returned only in local development."""
    if settings.email_configured:
        background_tasks.add_task(send_code_email, to_address, code, purpose, EMAIL_CODE_TTL_MINUTES, locale)
        return "email", None
    if not settings.frontend_is_local:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email is not available right now.")
    logger.info("One-time code for %s (%s): %s", to_address, purpose, code)
    return "log", code
