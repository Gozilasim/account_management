# Created at: 2026-05-11 01:17
# Updated at: 2026-05-11 01:17
# Description: Authentication, session, password, and MFA API routes.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import AuthChallenge, SessionToken, User, utcnow
from app.schemas import (
    ChangePasswordRequest,
    DisableMfaRequest,
    LoginRequest,
    LoginResponse,
    MessageOut,
    MfaSetupOut,
    MfaVerifyRequest,
    RegisterRequest,
    RegisterResponse,
    UserOut,
)
from app.security import (
    create_session,
    hash_password,
    hash_token,
    make_qr_data_url,
    make_totp_secret,
    make_totp_uri,
    normalize_email,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ###############################################
# Response And Challenge Helpers
# ###############################################

def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        mfa_enabled=user.mfa_enabled,
        mfa_enrolled=user.mfa_enrolled_at is not None,
        email_verified=user.email_verified,
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
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
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

    raw_session = create_session(db, user)
    db.commit()
    set_session_cookie(response, raw_session)
    return LoginResponse(user=user_out(user))


# ###############################################
# MFA Routes
# ###############################################

@router.post("/mfa/login/verify", response_model=LoginResponse)
def verify_mfa_login(payload: MfaVerifyRequest, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    challenge = get_active_challenge(db, payload.challenge_id, "mfa_login")
    user = db.get(User, challenge.user_id)
    if not user or not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled.")
    if not verify_totp(user.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code.")

    challenge.consumed_at = utcnow()
    raw_session = create_session(db, user)
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
def verify_mfa_setup(payload: MfaVerifyRequest, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
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

    raw_session = create_session(db, user)
    db.commit()
    set_session_cookie(response, raw_session)
    return LoginResponse(user=user_out(user))


@router.post("/mfa/disable", response_model=UserOut)
def disable_mfa(
    payload: DisableMfaRequest,
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid current password.")
    current_user.password_hash = hash_password(payload.new_password)
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
