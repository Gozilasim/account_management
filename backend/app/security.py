# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 00:31
# Description: Password hashing, token helpers, PKCE, TOTP, QR, and OIDC signing utilities.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import base64
import hashlib
import io
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import jwt
import pyotp
import qrcode
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SessionToken, User, utcnow

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ###############################################
# Passwords And Session Tokens
# ###############################################

def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def random_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    db: Session,
    user: User,
    ip_address: str | None = None,
    user_agent: str | None = None,
    device_label: str | None = None,
) -> str:
    raw_token = random_token()
    expires_at = utcnow() + timedelta(minutes=settings.session_ttl_minutes)
    db.add(
        SessionToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
            login_ip_address=ip_address,
            last_seen_ip_address=ip_address,
            user_agent=user_agent,
            device_label=device_label,
        )
    )
    return raw_token


# ###############################################
# PKCE And URL Helpers
# ###############################################

def base64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def base64url_bytes(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def verify_pkce(code_verifier: str, code_challenge: str, method: str) -> bool:
    if method != "S256":
        return False
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    expected = base64url_bytes(digest)
    return secrets.compare_digest(expected, code_challenge)


# ###############################################
# MFA Helpers
# ###############################################

def make_totp_secret() -> str:
    return pyotp.random_base32()


def make_totp_uri(email: str, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.mfa_issuer)


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def make_qr_data_url(value: str) -> str:
    image = qrcode.make(value)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def add_query_params(url: str, params: dict[str, str]) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update(params)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


# ###############################################
# OIDC Signing
# ###############################################

@lru_cache(maxsize=1)
def load_oidc_private_key() -> rsa.RSAPrivateKey:
    if settings.oidc_private_key_pem:
        key_data = settings.oidc_private_key_pem.encode("utf-8").replace(b"\\n", b"\n")
        return serialization.load_pem_private_key(key_data, password=None)
    if settings.oidc_private_key_path:
        key_data = Path(settings.oidc_private_key_path).read_bytes()
        return serialization.load_pem_private_key(key_data, password=None)

    # Dev fallback only. Production should configure a stable private key.
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def public_jwk() -> dict[str, str]:
    public_key = load_oidc_private_key().public_key()
    numbers = public_key.public_numbers()
    return {
        "kty": "RSA",
        "use": "sig",
        "kid": settings.oidc_key_id,
        "alg": "RS256",
        "n": base64url_uint(numbers.n),
        "e": base64url_uint(numbers.e),
    }


def sign_id_token(claims: dict) -> str:
    private_key = load_oidc_private_key()
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": settings.oidc_key_id})


def epoch_seconds(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp())
