# Created at: 2026-10-11 12:14
# Updated at: 2026-10-11 12:14
# Description: API routes for a person's own data: what the account holds, downloading it, and deleting the account.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.audit import record_security_event
from app.avatar_history import normalized_avatar_history
from app.cloudinary_service import delete_avatar
from app.config import settings
from app.consents import list_consents
from app.database import get_db
from app.deps import get_current_session, get_current_user
from app.emailer import send_account_deleted_email
from app.models import (
    AccessToken,
    AppConsent,
    AuthChallenge,
    AuthorizationCode,
    SecurityEvent,
    SessionToken,
    User,
    utcnow,
)
from app.recovery import (
    ACCOUNT_DELETION,
    BACKUP_CODE_LENGTH,
    deliver_email_code,
    digits_only,
    email_code_matches,
    email_codes_available,
    pending_email_code,
    start_email_code,
)
from app.routers.apps import connected_apps
from app.routers.auth import (
    CODE_SENT_MESSAGE,
    confirm_current_password,
    ensure_aware,
    limit_code_requests,
    second_factor_is_valid,
    security_event_out,
    session_out,
)
from app.schemas import CodeSentResponse, DataSummaryOut, DeleteAccountRequest, MessageOut
from app.security import normalize_email
from app.throttle import clear_failures, reject_attempt

router = APIRouter(prefix="/api/account", tags=["account"])
logger = logging.getLogger(__name__)

EXPORT_FORMAT_VERSION = 1


# ###############################################
# Helpers
# ###############################################

def delete_confirmation(user: User) -> str:
    """What deleting the account asks for on top of the email address and password."""
    if user.mfa_enabled and user.mfa_secret:
        return "authenticator"
    if email_codes_available():
        return "email_code"
    # Without extra verification and without email there is nothing further to check.
    return "password"


def active_sessions(db: Session, user: User) -> list[SessionToken]:
    now = utcnow()
    sessions = db.scalars(
        select(SessionToken).where(SessionToken.user_id == user.id).order_by(SessionToken.last_seen_at.desc())
    )
    return [session for session in sessions if ensure_aware(session.expires_at) > now]


def _iso(value: datetime | None) -> str | None:
    return ensure_aware(value).isoformat() if value else None


def profile_picture_ids(user: User) -> list[str]:
    ids = [item["public_id"] for item in normalized_avatar_history(user)]
    if user.avatar_public_id:
        ids.append(user.avatar_public_id)
    return ids


# ###############################################
# Summary And Export Routes
# ###############################################

@router.get("/data-summary", response_model=DataSummaryOut)
def data_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DataSummaryOut:
    event_count = db.scalar(
        select(func.count()).select_from(SecurityEvent).where(SecurityEvent.user_id == current_user.id)
    )
    return DataSummaryOut(
        sessions=len(active_sessions(db, current_user)),
        security_events=event_count or 0,
        profile_pictures=len(normalized_avatar_history(current_user)) + (1 if current_user.avatar_url else 0),
        connected_apps=len(list_consents(db, current_user)),
        delete_confirmation=delete_confirmation(current_user),
    )


@router.get("/export")
def export_account_data(
    request: Request,
    current_user: User = Depends(get_current_user),
    current_session: SessionToken = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Everything the account holds about the person, as one JSON file. Secrets are never part of it."""
    user = current_user
    events = db.scalars(
        select(SecurityEvent).where(SecurityEvent.user_id == user.id).order_by(SecurityEvent.created_at.desc())
    ).all()
    unused_codes = [code for code in user.backup_codes if code.used_at is None]
    exported_at = utcnow()

    payload = {
        "format": "account-export",
        "version": EXPORT_FORMAT_VERSION,
        "product": settings.product_name,
        "exported_at": _iso(exported_at),
        "account": {
            "id": user.id,
            "email": user.email,
            "email_verified": bool(user.email_verified),
            "display_name": user.display_name,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone_number": user.phone_number,
            "phone_verified": bool(user.phone_verified),
            "gender": user.gender,
            "gender_custom": user.gender_custom,
            "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
            "locale": user.locale,
            "timezone": user.timezone,
            "created_at": _iso(user.created_at),
            "updated_at": _iso(user.updated_at),
        },
        "profile_pictures": {
            "current": user.avatar_url,
            "history": normalized_avatar_history(user),
        },
        "sign_in": {
            "password_changed_at": _iso(user.password_changed_at or user.created_at),
            "extra_verification_enabled": bool(user.mfa_enabled),
            "extra_verification_set_up_at": _iso(user.mfa_enrolled_at),
            "backup_codes_remaining": len(unused_codes),
            "backup_codes_generated_at": _iso(max((code.created_at for code in user.backup_codes), default=None)),
            "recovery_email": user.recovery_email if user.recovery_email_verified_at else None,
        },
        "sessions": [
            session_out(session, current_session.id).model_dump(mode="json") for session in active_sessions(db, user)
        ],
        "security_events": [security_event_out(event).model_dump(mode="json") for event in events],
        "connected_apps": [app.model_dump(mode="json") for app in connected_apps(db, user)],
    }

    record_security_event(db, user.id, "data_exported", request)
    db.commit()
    filename = f"account-data-{exported_at:%Y-%m-%d}.json"
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ###############################################
# Account Deletion Routes
# ###############################################

@router.post("/delete/code", response_model=CodeSentResponse)
def send_account_deletion_code(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CodeSentResponse:
    if delete_confirmation(current_user) != "email_code":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This account is not confirmed with an emailed code.")
    limit_code_requests(db, request, current_user)

    code = start_email_code(db, current_user, ACCOUNT_DELETION, current_user.email)
    db.commit()
    delivery, dev_code = deliver_email_code(background_tasks, current_user.email, code, ACCOUNT_DELETION, current_user.locale)
    return CodeSentResponse(message=CODE_SENT_MESSAGE, delivery=delivery, dev_code=dev_code)


def erase_account(db: Session, user: User) -> None:
    """Removes the person and every row that belongs to them. The caller commits."""
    # SQLite only follows ON DELETE CASCADE when foreign keys are switched on, so nothing is left to the database.
    for model in (AppConsent, AccessToken, AuthorizationCode, AuthChallenge, SecurityEvent):
        db.execute(delete(model).where(model.user_id == user.id).execution_options(synchronize_session=False))
    # Sessions and backup codes go with the user through the ORM relationships.
    db.delete(user)


@router.post("/delete", response_model=MessageOut)
def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    """Deletes the account at once and for good, after the email, the password, and a code have been confirmed."""
    if normalize_email(payload.email) != current_user.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That is not the email address of this account.")
    subjects = confirm_current_password(db, request, current_user, payload.current_password)

    confirmation = delete_confirmation(current_user)
    if confirmation == "authenticator":
        method = "backup_code" if len(digits_only(payload.code)) == BACKUP_CODE_LENGTH else "totp"
        if not payload.code or not second_factor_is_valid(db, current_user, payload.code, method):
            reject_attempt(db, subjects, "Invalid verification code.")
    elif confirmation == "email_code":
        challenge = pending_email_code(db, current_user, ACCOUNT_DELETION)
        if not email_code_matches(challenge, current_user, payload.code):
            reject_attempt(db, subjects, "That code is not right.")

    user_id, email, locale = current_user.id, current_user.email, current_user.locale
    picture_ids = profile_picture_ids(current_user)

    erase_account(db, current_user)
    clear_failures(db, subjects)
    db.commit()
    response.delete_cookie(key=settings.session_cookie_name, secure=settings.session_cookie_secure, samesite="lax")

    # Stored pictures and the farewell email are handled after the answer is sent. Neither can undo the deletion.
    for public_id in picture_ids:
        background_tasks.add_task(delete_avatar, public_id)
    if settings.email_configured:
        background_tasks.add_task(send_account_deleted_email, email, locale)
    logger.info("Account deleted: user_id=%s", user_id)
    return MessageOut(message="Account deleted.")
