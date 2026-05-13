# Created at: 2026-05-11 01:17
# Updated at: 2026-05-13 23:34
# Description: Authentication, session, password, and MFA API routes.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import record_security_event, request_device_label, request_ip_address, request_user_agent
from app.avatar_history import normalized_avatar_history
from app.config import settings
from app.database import get_db
from app.deps import get_current_session, get_current_user
from app.models import AccessToken, AuthChallenge, SecurityEvent, SessionToken, User, utcnow
from app.profile_completion import profile_completion
from app.schemas import (
    ChangePasswordRequest,
    DisableMfaRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MessageOut,
    MfaSetupOut,
    MfaVerifyRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordCompleteRequest,
    ResetPasswordInspectRequest,
    ResetPasswordInspectResponse,
    SecurityEventOut,
    SessionOut,
    UserOut,
)
from app.security import (
    add_query_params,
    create_session,
    hash_password,
    hash_token,
    make_qr_data_url,
    make_totp_secret,
    make_totp_uri,
    normalize_email,
    random_token,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)
PASSWORD_RESET_GENERIC_MESSAGE = "If an account exists for that email, a reset link has been prepared."


# ###############################################
# Response And Challenge Helpers
# ###############################################

def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        first_name=user.first_name,
        last_name=user.last_name,
        phone_number=user.phone_number,
        phone_verified=bool(user.phone_verified),
        gender=user.gender,
        gender_custom=user.gender_custom,
        date_of_birth=user.date_of_birth,
        locale=user.locale,
        timezone=user.timezone,
        avatar_url=user.avatar_url,
        avatar_history=normalized_avatar_history(user),
        mfa_enabled=user.mfa_enabled,
        mfa_enrolled=user.mfa_enrolled_at is not None,
        email_verified=user.email_verified,
        profile_completion=profile_completion(user),
    )


def session_out(session: SessionToken, current_session_id: str) -> SessionOut:
    return SessionOut(
        id=session.id,
        device_label=session.device_label,
        login_ip_address=session.login_ip_address,
        last_seen_ip_address=session.last_seen_ip_address,
        user_agent=session.user_agent,
        created_at=session.created_at,
        last_seen_at=session.last_seen_at,
        expires_at=session.expires_at,
        is_current=session.id == current_session_id,
    )


def security_event_out(event: SecurityEvent) -> SecurityEventOut:
    return SecurityEventOut(
        id=event.id,
        event_type=event.event_type,
        ip_address=event.ip_address,
        user_agent=event.user_agent,
        device_label=event.device_label,
        created_at=event.created_at,
        metadata=event.metadata_json,
    )


def create_request_session(db: Session, user: User, request: Request) -> str:
    return create_session(
        db,
        user,
        ip_address=request_ip_address(request),
        user_agent=request_user_agent(request),
        device_label=request_device_label(request),
    )


def set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_token,
        max_age=settings.session_ttl_minutes * 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )


def make_mfa_setup(db: Session, user: User, secret: str, metadata: dict | None = None) -> MfaSetupOut:
    challenge = AuthChallenge(
        user_id=user.id,
        purpose="mfa_setup",
        metadata_json=metadata,
        expires_at=utcnow() + timedelta(minutes=15),
    )
    db.add(challenge)
    db.flush()
    uri = make_totp_uri(user.email, secret)
    return MfaSetupOut(
        challenge_id=challenge.id,
        otpauth_uri=uri,
        qr_code_data_url=make_qr_data_url(uri),
        manual_entry_key=secret,
    )


def get_active_challenge(db: Session, challenge_id: str, purpose: str) -> AuthChallenge:
    challenge = db.get(AuthChallenge, challenge_id)
    if not challenge or challenge.purpose != purpose or challenge.consumed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid challenge.")
    expires_at = ensure_aware(challenge.expires_at)
    if expires_at <= utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Challenge expired.")
    return challenge


def ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def reset_link_for_token(token: str) -> str:
    return add_query_params(f"{settings.frontend_origin}/reset-password", {"token": token})


def find_active_password_reset_challenge(db: Session, token: str) -> AuthChallenge | None:
    token_hash = hash_token(token)
    challenges = db.scalars(
        select(AuthChallenge).where(
            AuthChallenge.purpose == "password_reset",
            AuthChallenge.consumed_at.is_(None),
        )
    )
    for challenge in challenges:
        metadata = challenge.metadata_json or {}
        if metadata.get("token_hash") != token_hash:
            continue
        if ensure_aware(challenge.expires_at) <= utcnow():
            return None
        return challenge
    return None


def consume_existing_password_reset_challenges(db: Session, user_id: str) -> None:
    now = utcnow()
    challenges = db.scalars(
        select(AuthChallenge).where(
            AuthChallenge.user_id == user_id,
            AuthChallenge.purpose == "password_reset",
            AuthChallenge.consumed_at.is_(None),
        )
    )
    for challenge in challenges:
        challenge.consumed_at = now


def revoke_user_auth_state(db: Session, user_id: str) -> None:
    now = utcnow()
    sessions = db.scalars(select(SessionToken).where(SessionToken.user_id == user_id))
    for session in sessions:
        db.delete(session)

    access_tokens = db.scalars(
        select(AccessToken).where(
            AccessToken.user_id == user_id,
            AccessToken.revoked_at.is_(None),
        )
    )
    for access_token in access_tokens:
        access_token.revoked_at = now


# ###############################################
# Registration And Login
# ###############################################

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    email = normalize_email(payload.email)
    secret = make_totp_secret()
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        mfa_secret=secret,
        mfa_enabled=False,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.") from exc

    setup = make_mfa_setup(db, user, secret)
    db.commit()
    return RegisterResponse(mfa_setup=setup, user=user_out(user))


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    email = normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    if user.mfa_enabled:
        challenge = AuthChallenge(
            user_id=user.id,
            purpose="mfa_login",
            expires_at=utcnow() + timedelta(minutes=10),
        )
        db.add(challenge)
        db.commit()
        return LoginResponse(mfa_required=True, challenge_id=challenge.id)

    if user.mfa_enrolled_at is None:
        if not user.mfa_secret:
            user.mfa_secret = make_totp_secret()
        setup = make_mfa_setup(db, user, user.mfa_secret)
        db.commit()
        return LoginResponse(mfa_setup_required=True, mfa_setup=setup)

    raw_session = create_request_session(db, user, request)
    record_security_event(db, user.id, "login_success", request)
    db.commit()
    set_session_cookie(response, raw_session)
    return LoginResponse(user=user_out(user))


# ###############################################
# Password Reset Routes
# ###############################################

@router.post("/password/forgot", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> ForgotPasswordResponse:
    email = normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email))
    reset_link: str | None = None

    if user and user.is_active:
        reset_token = random_token()
        consume_existing_password_reset_challenges(db, user.id)
        db.add(
            AuthChallenge(
                user_id=user.id,
                purpose="password_reset",
                metadata_json={"token_hash": hash_token(reset_token)},
                expires_at=utcnow() + timedelta(minutes=settings.password_reset_token_ttl_minutes),
            )
        )
        if settings.password_reset_delivery.lower() == "dev_log":
            reset_link = reset_link_for_token(reset_token)
            logger.info("Password reset link generated for user_id=%s link=%s", user.id, reset_link)
        db.commit()

    return ForgotPasswordResponse(message=PASSWORD_RESET_GENERIC_MESSAGE, reset_link=reset_link)


@router.post("/password/reset/inspect", response_model=ResetPasswordInspectResponse)
def inspect_password_reset(
    payload: ResetPasswordInspectRequest,
    db: Session = Depends(get_db),
) -> ResetPasswordInspectResponse:
    challenge = find_active_password_reset_challenge(db, payload.token.strip())
    if not challenge:
        return ResetPasswordInspectResponse(valid=False, mfa_required=False)

    user = db.get(User, challenge.user_id)
    if not user or not user.is_active:
        return ResetPasswordInspectResponse(valid=False, mfa_required=False)

    return ResetPasswordInspectResponse(valid=True, mfa_required=bool(user.mfa_enabled))


@router.post("/password/reset/complete", response_model=MessageOut)
def complete_password_reset(
    payload: ResetPasswordCompleteRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageOut:
    challenge = find_active_password_reset_challenge(db, payload.token.strip())
    if not challenge:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token.")

    user = db.get(User, challenge.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token.")

    if user.mfa_enabled:
        if not user.mfa_secret:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA setup is incomplete.")
        if not payload.mfa_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA code is required.")
        if not verify_totp(user.mfa_secret, payload.mfa_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code.")

    user.password_hash = hash_password(payload.new_password)
    challenge.consumed_at = utcnow()
    record_security_event(db, user.id, "password_reset", request)
    revoke_user_auth_state(db, user.id)
    db.commit()
    return MessageOut(message="Password reset.")


# ###############################################
# MFA Routes
# ###############################################

@router.post("/mfa/login/verify", response_model=LoginResponse)
def verify_mfa_login(
    payload: MfaVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    challenge = get_active_challenge(db, payload.challenge_id, "mfa_login")
    user = db.get(User, challenge.user_id)
    if not user or not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled.")
    if not verify_totp(user.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code.")

    challenge.consumed_at = utcnow()
    raw_session = create_request_session(db, user, request)
    record_security_event(db, user.id, "login_success", request)
    db.commit()
    set_session_cookie(response, raw_session)
    return LoginResponse(user=user_out(user))


@router.post("/mfa/setup", response_model=MfaSetupOut)
def start_mfa_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MfaSetupOut:
    secret = make_totp_secret()
    setup = make_mfa_setup(db, current_user, secret, metadata={"pending_secret": secret})
    db.commit()
    return setup


@router.post("/mfa/setup/verify", response_model=LoginResponse)
def verify_mfa_setup(
    payload: MfaVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    challenge = get_active_challenge(db, payload.challenge_id, "mfa_setup")
    user = db.get(User, challenge.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid challenge.")

    secret = (challenge.metadata_json or {}).get("pending_secret") or user.mfa_secret
    if not secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA setup is missing a secret.")
    if not verify_totp(secret, payload.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code.")

    user.mfa_secret = secret
    user.mfa_enabled = True
    if user.mfa_enrolled_at is None:
        user.mfa_enrolled_at = utcnow()
    challenge.consumed_at = utcnow()

    raw_session = create_request_session(db, user, request)
    record_security_event(db, user.id, "mfa_enabled", request)
    record_security_event(db, user.id, "login_success", request)
    db.commit()
    set_session_cookie(response, raw_session)
    return LoginResponse(user=user_out(user))


@router.post("/mfa/disable", response_model=UserOut)
def disable_mfa(
    payload: DisableMfaRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    if not current_user.mfa_enabled or not current_user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is already disabled.")
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password.")
    if not verify_totp(current_user.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code.")

    current_user.mfa_enabled = False
    record_security_event(db, current_user.id, "mfa_disabled", request)
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


# ###############################################
# Account Routes
# ###############################################

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return user_out(current_user)


@router.post("/password/change", response_model=MessageOut)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid current password.")
    current_user.password_hash = hash_password(payload.new_password)
    record_security_event(db, current_user.id, "password_changed", request)
    db.commit()
    return MessageOut(message="Password changed.")


# ###############################################
# Logout Routes
# ###############################################

def clear_current_session(request: Request, response: Response, db: Session) -> None:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token:
        session = db.scalar(select(SessionToken).where(SessionToken.token_hash == hash_token(raw_token)))
        if session:
            record_security_event(db, session.user_id, "logout", request, session=session)
            db.delete(session)
            db.commit()
    response.delete_cookie(key=settings.session_cookie_name, secure=settings.session_cookie_secure, samesite="lax")


@router.post("/logout", response_model=MessageOut)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> MessageOut:
    clear_current_session(request, response, db)
    return MessageOut(message="Logged out.")


@router.post("/sessions/logout", response_model=MessageOut)
def logout_session(request: Request, response: Response, db: Session = Depends(get_db)) -> MessageOut:
    clear_current_session(request, response, db)
    return MessageOut(message="Logged out.")


# ###############################################
# Session And Security Event Routes
# ###############################################

@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    current_user: User = Depends(get_current_user),
    current_session: SessionToken = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> list[SessionOut]:
    now = utcnow()
    sessions = db.scalars(
        select(SessionToken)
        .where(SessionToken.user_id == current_user.id)
        .order_by(SessionToken.last_seen_at.desc())
    ).all()

    active_sessions = []
    removed_expired = False
    for session in sessions:
        if ensure_aware(session.expires_at) <= now:
            db.delete(session)
            removed_expired = True
            continue
        active_sessions.append(session)

    if removed_expired:
        db.commit()

    return [session_out(session, current_session.id) for session in active_sessions]


@router.delete("/sessions/{session_id}", response_model=MessageOut)
def revoke_session(
    session_id: str,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    current_session: SessionToken = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> MessageOut:
    session = db.get(SessionToken, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    is_current = session.id == current_session.id
    record_security_event(
        db,
        current_user.id,
        "session_revoked",
        request,
        session=session,
        metadata={"session_id": session.id, "current_session": is_current},
    )
    db.delete(session)
    db.commit()

    if is_current:
        response.delete_cookie(key=settings.session_cookie_name, secure=settings.session_cookie_secure, samesite="lax")
    return MessageOut(message="Session revoked.")


@router.post("/sessions/logout-others", response_model=MessageOut)
def logout_other_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    current_session: SessionToken = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> MessageOut:
    sessions = db.scalars(
        select(SessionToken).where(
            SessionToken.user_id == current_user.id,
            SessionToken.id != current_session.id,
        )
    ).all()

    revoked_count = len(sessions)
    for session in sessions:
        db.delete(session)

    record_security_event(
        db,
        current_user.id,
        "session_revoked",
        request,
        session=current_session,
        metadata={"revoked_count": revoked_count, "kept_session_id": current_session.id},
    )
    db.commit()
    return MessageOut(message="Other sessions logged out.")


@router.get("/security-events", response_model=list[SecurityEventOut])
def list_security_events(
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SecurityEventOut]:
    events = db.scalars(
        select(SecurityEvent)
        .where(SecurityEvent.user_id == current_user.id)
        .order_by(SecurityEvent.created_at.desc())
        .limit(limit)
    ).all()
    return [security_event_out(event) for event in events]
