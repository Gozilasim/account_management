# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 01:23
# Description: Minimal OIDC provider endpoints for Login via Portal.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_user_from_request
from app.models import AccessToken, AuthorizationCode, OidcClient, User, utcnow
from app.security import (
    add_query_params,
    epoch_seconds,
    hash_token,
    public_jwk,
    sign_id_token,
    verify_password,
    verify_pkce,
)

router = APIRouter(tags=["oidc"])


# ###############################################
# OIDC Helpers
# ###############################################

def client_by_id(db: Session, client_id: str) -> OidcClient:
    client = db.scalar(select(OidcClient).where(OidcClient.client_id == client_id, OidcClient.is_active.is_(True)))
    if not client:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown OIDC client.")
    return client


def validate_scopes(client: OidcClient, scope: str) -> str:
    requested = [item for item in scope.split() if item]
    if "openid" not in requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC scope must include openid.")
    allowed = set(client.allowed_scopes)
    if not set(requested).issubset(allowed):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC scope is not allowed.")
    return " ".join(requested)


def authorize_context_payload(client: OidcClient, redirect_uri: str, normalized_scope: str) -> dict:
    return {
        "client_id": client.client_id,
        "client_name": client.name,
        "redirect_uri": redirect_uri,
        "scope": normalized_scope,
        "scopes": normalized_scope.split(),
    }


def oidc_claims(user: User, scope: str) -> dict:
    claims: dict[str, object] = {
        "sub": user.id,
        "mfa_enabled": user.mfa_enabled,
    }
    scopes = set(scope.split())
    if "email" in scopes:
        claims["email"] = user.email
        claims["email_verified"] = user.email_verified
    if "profile" in scopes:
        claims["name"] = user.display_name
        claims["picture"] = user.avatar_url
        claims["given_name"] = user.first_name
        claims["family_name"] = user.last_name
        claims["gender"] = user.gender_custom if user.gender == "custom" else user.gender
        claims["birthdate"] = user.date_of_birth.isoformat() if user.date_of_birth else None
        claims["locale"] = user.locale
        claims["zoneinfo"] = user.timezone
        claims["updated_at"] = epoch_seconds(user.updated_at)
    if "phone" in scopes:
        claims["phone_number"] = user.phone_number
        claims["phone_number_verified"] = user.phone_verified
    return claims


def ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


# ###############################################
# Discovery
# ###############################################

@router.get("/.well-known/openid-configuration")
def openid_configuration() -> dict:
    issuer = settings.issuer
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/oauth/authorize",
        "token_endpoint": f"{issuer}/oauth/token",
        "userinfo_endpoint": f"{issuer}/oauth/userinfo",
        "jwks_uri": f"{issuer}/oauth/jwks.json",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "scopes_supported": ["openid", "email", "profile", "phone"],
        "claims_supported": [
            "sub",
            "email",
            "email_verified",
            "name",
            "picture",
            "given_name",
            "family_name",
            "gender",
            "birthdate",
            "locale",
            "zoneinfo",
            "updated_at",
            "phone_number",
            "phone_number_verified",
            "mfa_enabled",
        ],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
    }


@router.get("/oauth/jwks.json")
def jwks() -> dict:
    return {"keys": [public_jwk()]}


@router.get("/oauth/authorize/context")
def authorize_context(
    client_id: str,
    redirect_uri: str,
    scope: str,
    db: Session = Depends(get_db),
) -> dict:
    client = client_by_id(db, client_id)
    if redirect_uri not in client.redirect_uris:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid redirect_uri.")
    normalized_scope = validate_scopes(client, scope)
    return authorize_context_payload(client, redirect_uri, normalized_scope)


# ###############################################
# Authorization Code Flow
# ###############################################

@router.get("/oauth/authorize")
def authorize(
    request: Request,
    response_type: str,
    client_id: str,
    redirect_uri: str,
    scope: str,
    state: str | None = None,
    nonce: str | None = None,
    code_challenge: str | None = None,
    code_challenge_method: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if response_type != "code":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only authorization code flow is supported.")
    if not code_challenge or code_challenge_method != "S256":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PKCE S256 is required.")

    client = client_by_id(db, client_id)
    if redirect_uri not in client.redirect_uris:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid redirect_uri.")
    normalized_scope = validate_scopes(client, scope)

    try:
        user = get_user_from_request(request, db)
    except HTTPException:
        next_url = quote(str(request.url), safe="")
        return RedirectResponse(f"{settings.frontend_origin}/authorize?next={next_url}", status_code=status.HTTP_302_FOUND)

    code = secrets.token_urlsafe(32)
    auth_code = AuthorizationCode(
        code_hash=hash_token(code),
        client_id=client.id,
        user_id=user.id,
        redirect_uri=redirect_uri,
        scope=normalized_scope,
        nonce=nonce,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        expires_at=utcnow() + timedelta(minutes=settings.oidc_code_ttl_minutes),
    )
    db.add(auth_code)
    db.commit()

    params = {"code": code}
    if state:
        params["state"] = state
    return RedirectResponse(add_query_params(redirect_uri, params), status_code=status.HTTP_302_FOUND)


@router.post("/oauth/token")
def token(
    grant_type: str = Form(...),
    code: str = Form(...),
    redirect_uri: str = Form(...),
    client_id: str = Form(...),
    code_verifier: str = Form(...),
    client_secret: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> JSONResponse:
    if grant_type != "authorization_code":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported grant_type.")

    client = client_by_id(db, client_id)
    if client.is_confidential:
        if not client_secret or not client.client_secret_hash or not verify_password(client_secret, client.client_secret_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid client secret.")

    auth_code = db.scalar(select(AuthorizationCode).where(AuthorizationCode.code_hash == hash_token(code)))
    if not auth_code or auth_code.client_id != client.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid authorization code.")
    if auth_code.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Authorization code was already used.")
    if auth_code.redirect_uri != redirect_uri:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="redirect_uri does not match.")
    if ensure_aware(auth_code.expires_at) <= utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Authorization code expired.")
    if not verify_pkce(code_verifier, auth_code.code_challenge, auth_code.code_challenge_method):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PKCE verifier.")

    user = db.get(User, auth_code.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is inactive.")

    now = utcnow()
    access_token = secrets.token_urlsafe(48)
    expires_at = now + timedelta(minutes=settings.oidc_access_token_ttl_minutes)
    db.add(
        AccessToken(
            token_hash=hash_token(access_token),
            client_id=client.id,
            user_id=user.id,
            scope=auth_code.scope,
            expires_at=expires_at,
        )
    )
    auth_code.used_at = now

    id_claims = {
        "iss": settings.issuer,
        "sub": user.id,
        "aud": client.client_id,
        "iat": epoch_seconds(now),
        "exp": epoch_seconds(expires_at),
        "auth_time": epoch_seconds(auth_code.created_at),
    }
    if auth_code.nonce:
        id_claims["nonce"] = auth_code.nonce
    id_claims.update(oidc_claims(user, auth_code.scope))
    id_token = sign_id_token(id_claims)

    db.commit()
    return JSONResponse(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": settings.oidc_access_token_ttl_minutes * 60,
            "id_token": id_token,
            "scope": auth_code.scope,
        }
    )


# ###############################################
# Userinfo
# ###############################################

@router.get("/oauth/userinfo")
def userinfo(request: Request, db: Session = Depends(get_db)) -> dict:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required.")

    access_token = db.scalar(select(AccessToken).where(AccessToken.token_hash == hash_token(token)))
    if not access_token or access_token.revoked_at is not None or ensure_aware(access_token.expires_at) <= utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token.")

    return oidc_claims(access_token.user, access_token.scope)
