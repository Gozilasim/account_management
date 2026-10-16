# Created at: 2026-05-11 01:17
# Updated at: 2026-10-11 12:13
# Description: Authentication, session, password, and MFA API routes.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import record_security_event, request_device_label, request_ip_address, request_user_agent
from app.avatar_history import normalized_avatar_history
from app.config import settings
from app.database import get_db
from app.deps import get_current_session, get_current_user
from app.emailer import send_new_sign_in_email, send_password_reset_email
from app.models import AccessToken, AuthChallenge, SecurityEvent, SessionToken, User, utcnow
from app.profile_completion import profile_completion
from app.recovery import (
    EMAIL_VERIFICATION,
    RECOVERY_EMAIL_SETUP,
    RECOVERY_SIGN_IN,
    BACKUP_CODE_LENGTH,
    delete_backup_codes,
    deliver_email_code,
    digits_only,
    email_code_matches,
    email_codes_available,
    generate_backup_codes,
    mask_email,
    pending_email_code,
    start_email_code,
    unused_backup_codes,
    use_backup_code,
)
from app.schemas import (
    BackupCodesOut,
    ChallengeRequest,
    ChangePasswordRequest,
    CodeSentResponse,
    DisableMfaRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MessageOut,
    MfaSetupOut,
    MfaVerifyRequest,
    OneTimeCodeRequest,
    PasswordConfirmRequest,
    RecoveryEmailRequest,
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
from app.throttle import (
    CODE_REQUEST_SCOPE,
    RESET_REQUEST_SCOPE,
    clear_failures,
    ensure_not_locked,
    record_failure,
    reject_attempt,
    throttle_subjects,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)
PASSWORD_RESET_GENERIC_MESSAGE = "If an account exists for that email, a reset link has been prepared."
CODE_SENT_MESSAGE = "A verification code has been sent."


# ###############################################
# Response And Challenge Helpers
# ###############################################

def user_out(user: User) -> UserOut:
    unused_codes = [code for code in user.backup_codes if code.used_at is None]
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
        backup_codes_remaining=len(unused_codes),
        backup_codes_generated_at=max((code.created_at for code in user.backup_codes), default=None),
        recovery_email=user.recovery_email if user.recovery_email_verified_at else None,
        recovery_email_verified=bool(user.recovery_email and user.recovery_email_verified_at),
        # Accounts created before this was tracked have had the same password since they were made.
        password_changed_at=user.password_changed_at or user.created_at,
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


def available_mfa_methods(db: Session, user: User) -> list[str]:
    methods = ["totp"]
    if unused_backup_codes(db, user):
        methods.append("backup_code")
    if user.recovery_email and user.recovery_email_verified_at and email_codes_available():
        methods.append("recovery_email")
    return methods


def limit_code_requests(db: Session, request: Request, user: User) -> None:
    """Caps how many one-time codes one account or address can ask for, so inboxes cannot be flooded."""
    if not email_codes_available():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email is not available right now.")
    subjects = throttle_subjects(request, user.email, scope=CODE_REQUEST_SCOPE)
    ensure_not_locked(db, subjects)
    record_failure(db, subjects)


def second_factor_is_valid(db: Session, user: User, code: str, method: str = "totp") -> bool:
    """Checks an authenticator code, a backup code, or a code emailed to the recovery address."""
    if method == "backup_code":
        return use_backup_code(db, user, code)
    if method == "recovery_email":
        challenge = pending_email_code(db, user, RECOVERY_SIGN_IN)
        if not email_code_matches(challenge, user, code):
            return False
        challenge.consumed_at = utcnow()
        return True
    return bool(user.mfa_secret) and verify_totp(user.mfa_secret, code)


def password_reset_delivery() -> str:
    """Returns "email" when reset links can be emailed, otherwise "log"."""
    if settings.password_reset_delivery.lower() != "email":
        return "log"
    if not settings.email_configured:
        logger.warning("PASSWORD_RESET_DELIVERY is email but SMTP is not configured, so reset links are only logged.")
        return "log"
    return "email"


def is_new_device(db: Session, user: User, request: Request) -> bool:
    earlier_sign_ins = db.scalars(
        select(SecurityEvent)
        .where(SecurityEvent.user_id == user.id, SecurityEvent.event_type == "login_success")
        .order_by(SecurityEvent.created_at.desc())
        .limit(50)
    ).all()
    # The very first sign-in comes from the device the account was created on, so it is not announced.
    if not earlier_sign_ins:
        return False
    user_agent = request_user_agent(request)
    return all(event.user_agent != user_agent for event in earlier_sign_ins)


def complete_sign_in(
    db: Session,
    user: User,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    subjects: list[str],
) -> LoginResponse:
    """Creates the session, records the sign-in, and emails the owner when the device has not been seen before."""
    new_device = is_new_device(db, user, request)
    raw_session = create_request_session(db, user, request)
    record_security_event(db, user.id, "login_success", request, metadata={"new_device": True} if new_device else None)
    clear_failures(db, subjects)
    db.commit()
    set_session_cookie(response, raw_session)
    if new_device and settings.email_configured:
        background_tasks.add_task(
            send_new_sign_in_email,
            user.email,
            request_device_label(request),
            request_ip_address(request),
            utcnow(),
            user.timezone,
            user.locale,
        )
    return LoginResponse(user=user_out(user))


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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> LoginResponse:
    email = normalize_email(payload.email)
    # Counted per email whether or not the account exists, so a lockout reveals nothing about it.
    subjects = throttle_subjects(request, email)
    ensure_not_locked(db, subjects)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        reject_attempt(db, subjects, "Invalid email or password.")

    if user.mfa_enabled:
        challenge = AuthChallenge(
            user_id=user.id,
            purpose="mfa_login",
            expires_at=utcnow() + timedelta(minutes=10),
        )
        db.add(challenge)
        db.commit()
        methods = available_mfa_methods(db, user)
        return LoginResponse(
            mfa_required=True,
            challenge_id=challenge.id,
            mfa_methods=methods,
            recovery_email_hint=mask_email(user.recovery_email) if "recovery_email" in methods and user.recovery_email else None,
        )

    if user.mfa_enrolled_at is None:
        if not user.mfa_secret:
            user.mfa_secret = make_totp_secret()
        setup = make_mfa_setup(db, user, user.mfa_secret)
        db.commit()
        return LoginResponse(mfa_setup_required=True, mfa_setup=setup)

    return complete_sign_in(db, user, request, response, background_tasks, subjects)


# ###############################################
# Password Reset Routes
# ###############################################

@router.post("/password/forgot", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    email = normalize_email(payload.email)
    # Every request counts, whether or not the account exists, so nobody can flood an inbox or probe for accounts.
    request_subjects = throttle_subjects(request, email, scope=RESET_REQUEST_SCOPE)
    ensure_not_locked(db, request_subjects)
    record_failure(db, request_subjects)

    user = db.scalar(select(User).where(User.email == email))
    delivery = password_reset_delivery()
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
        link = reset_link_for_token(reset_token)
        if delivery == "email":
            background_tasks.add_task(send_password_reset_email, user.email, link, user.locale)
        else:
            logger.info("Password reset link generated for user_id=%s link=%s", user.id, link)
            # The link is handed back to the browser only for a locally served frontend. A deployed
            # site must never return it, or anyone who knows an email could reset that account.
            if settings.frontend_is_local:
                reset_link = link
        db.commit()

    return ForgotPasswordResponse(message=PASSWORD_RESET_GENERIC_MESSAGE, delivery=delivery, reset_link=reset_link)


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
    address_subjects = throttle_subjects(request)
    ensure_not_locked(db, address_subjects)
    challenge = find_active_password_reset_challenge(db, payload.token.strip())
    if not challenge:
        reject_attempt(db, address_subjects, "Invalid or expired reset token.", status.HTTP_400_BAD_REQUEST)

    user = db.get(User, challenge.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token.")

    subjects = throttle_subjects(request, user.email)
    ensure_not_locked(db, subjects)
    if user.mfa_enabled:
        if not user.mfa_secret:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA setup is incomplete.")
        if not payload.mfa_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA code is required.")
        method = "backup_code" if len(digits_only(payload.mfa_code)) == BACKUP_CODE_LENGTH else "totp"
        if not second_factor_is_valid(db, user, payload.mfa_code, method):
            reject_attempt(db, subjects, "Invalid MFA code.")
        if method == "backup_code":
            record_security_event(db, user.id, "backup_code_used", request)

    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = utcnow()
    challenge.consumed_at = utcnow()
    record_security_event(db, user.id, "password_reset", request)
    revoke_user_auth_state(db, user.id)
    clear_failures(db, subjects)
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> LoginResponse:
    challenge = get_active_challenge(db, payload.challenge_id, "mfa_login")
    user = db.get(User, challenge.user_id)
    if not user or not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled.")
    subjects = throttle_subjects(request, user.email)
    ensure_not_locked(db, subjects)
    if not second_factor_is_valid(db, user, payload.code, payload.method):
        reject_attempt(db, subjects, "Invalid MFA code.")
    if payload.method == "backup_code":
        record_security_event(db, user.id, "backup_code_used", request)
    elif payload.method == "recovery_email":
        record_security_event(db, user.id, "recovery_email_used", request)

    challenge.consumed_at = utcnow()
    return complete_sign_in(db, user, request, response, background_tasks, subjects)


@router.post("/mfa/login/recovery-email", response_model=CodeSentResponse)
def send_recovery_sign_in_code(
    payload: ChallengeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> CodeSentResponse:
    challenge = get_active_challenge(db, payload.challenge_id, "mfa_login")
    user = db.get(User, challenge.user_id)
    if not user or not user.recovery_email or not user.recovery_email_verified_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No recovery email is set for this account.")

    limit_code_requests(db, request, user)
    code = start_email_code(db, user, RECOVERY_SIGN_IN, user.recovery_email)
    db.commit()
    delivery, dev_code = deliver_email_code(background_tasks, user.recovery_email, code, RECOVERY_SIGN_IN, user.locale)
    return CodeSentResponse(message=CODE_SENT_MESSAGE, delivery=delivery, dev_code=dev_code)


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
    subjects = throttle_subjects(request, user.email)
    ensure_not_locked(db, subjects)
    if not verify_totp(secret, payload.code):
        reject_attempt(db, subjects, "Invalid MFA code.")

    user.mfa_secret = secret
    user.mfa_enabled = True
    if user.mfa_enrolled_at is None:
        user.mfa_enrolled_at = utcnow()
    challenge.consumed_at = utcnow()

    raw_session = create_request_session(db, user, request)
    record_security_event(db, user.id, "mfa_enabled", request)
    record_security_event(db, user.id, "login_success", request)
    clear_failures(db, subjects)
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
    # A signed-in session must not become a way to guess the password or the code without limit.
    subjects = throttle_subjects(request, current_user.email)
    ensure_not_locked(db, subjects)
    if not verify_password(payload.current_password, current_user.password_hash):
        reject_attempt(db, subjects, "Invalid password.")
    if not verify_totp(current_user.mfa_secret, payload.code):
        reject_attempt(db, subjects, "Invalid MFA code.")

    current_user.mfa_enabled = False
    # Backup codes only stand in for the authenticator, so they go when it does.
    delete_backup_codes(db, current_user)
    record_security_event(db, current_user.id, "mfa_disabled", request)
    clear_failures(db, subjects)
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


# ###############################################
# Recovery Routes
# ###############################################

def confirm_current_password(db: Session, request: Request, user: User, password: str) -> list[str]:
    """Re-checks the password before a sensitive change and returns the throttle subjects to clear on success."""
    subjects = throttle_subjects(request, user.email)
    ensure_not_locked(db, subjects)
    if not verify_password(password, user.password_hash):
        reject_attempt(db, subjects, "Invalid password.")
    return subjects


@router.post("/backup-codes", response_model=BackupCodesOut)
def create_backup_codes(
    payload: PasswordConfirmRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BackupCodesOut:
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Turn on extra verification first.")
    subjects = confirm_current_password(db, request, current_user, payload.current_password)

    codes = generate_backup_codes(db, current_user)
    record_security_event(db, current_user.id, "backup_codes_generated", request)
    clear_failures(db, subjects)
    db.commit()
    return BackupCodesOut(codes=codes, generated_at=utcnow())


@router.post("/recovery-email", response_model=CodeSentResponse)
def start_recovery_email(
    payload: RecoveryEmailRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CodeSentResponse:
    email = normalize_email(payload.email)
    if email == current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recovery email must be different from your sign-in email.",
        )
    subjects = confirm_current_password(db, request, current_user, payload.current_password)
    limit_code_requests(db, request, current_user)

    # The address is kept on the pending code and saved to the account only once it is confirmed.
    code = start_email_code(db, current_user, RECOVERY_EMAIL_SETUP, email)
    clear_failures(db, subjects)
    db.commit()
    delivery, dev_code = deliver_email_code(background_tasks, email, code, RECOVERY_EMAIL_SETUP, current_user.locale)
    return CodeSentResponse(message=CODE_SENT_MESSAGE, delivery=delivery, dev_code=dev_code)


@router.post("/recovery-email/verify", response_model=UserOut)
def verify_recovery_email(
    payload: OneTimeCodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    subjects = throttle_subjects(request, current_user.email)
    ensure_not_locked(db, subjects)
    challenge = pending_email_code(db, current_user, RECOVERY_EMAIL_SETUP)
    if not email_code_matches(challenge, current_user, payload.code):
        reject_attempt(db, subjects, "That code is not right.")

    challenge.consumed_at = utcnow()
    current_user.recovery_email = (challenge.metadata_json or {}).get("email")
    current_user.recovery_email_verified_at = utcnow()
    record_security_event(db, current_user.id, "recovery_email_added", request)
    clear_failures(db, subjects)
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


@router.post("/recovery-email/remove", response_model=UserOut)
def remove_recovery_email(
    payload: PasswordConfirmRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    subjects = confirm_current_password(db, request, current_user, payload.current_password)

    current_user.recovery_email = None
    current_user.recovery_email_verified_at = None
    record_security_event(db, current_user.id, "recovery_email_removed", request)
    clear_failures(db, subjects)
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


# ###############################################
# Email Verification Routes
# ###############################################

@router.post("/email/verification", response_model=CodeSentResponse)
def start_email_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CodeSentResponse:
    if current_user.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your email is already verified.")
    limit_code_requests(db, request, current_user)

    code = start_email_code(db, current_user, EMAIL_VERIFICATION, current_user.email)
    db.commit()
    delivery, dev_code = deliver_email_code(background_tasks, current_user.email, code, EMAIL_VERIFICATION, current_user.locale)
    return CodeSentResponse(message=CODE_SENT_MESSAGE, delivery=delivery, dev_code=dev_code)


@router.post("/email/verification/confirm", response_model=UserOut)
def confirm_email_verification(
    payload: OneTimeCodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    subjects = throttle_subjects(request, current_user.email)
    ensure_not_locked(db, subjects)
    challenge = pending_email_code(db, current_user, EMAIL_VERIFICATION)
    if not email_code_matches(challenge, current_user, payload.code):
        reject_attempt(db, subjects, "That code is not right.")

    challenge.consumed_at = utcnow()
    current_user.email_verified = True
    record_security_event(db, current_user.id, "email_verified", request)
    clear_failures(db, subjects)
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
    subjects = throttle_subjects(request, current_user.email)
    ensure_not_locked(db, subjects)
    if not verify_password(payload.current_password, current_user.password_hash):
        reject_attempt(db, subjects, "Invalid current password.")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.password_changed_at = utcnow()
    record_security_event(db, current_user.id, "password_changed", request)
    clear_failures(db, subjects)
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
