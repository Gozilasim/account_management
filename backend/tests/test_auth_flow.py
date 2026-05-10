# Created at: 2026-05-11 01:17
# Updated at: 2026-05-11 01:17
# Description: Backend tests for MFA, OIDC, and avatar flows.

from __future__ import annotations

import base64
import hashlib
from urllib.parse import parse_qs, urlparse

import pyotp
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import create_app
from app.models import Base, OidcClient
from app.security import verify_totp


def make_client():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    def override_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = override_db
    return TestClient(app), TestingSessionLocal


def enroll_user(client: TestClient, email: str = "john@example.com", password: str = "password123"):
    setup = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": "John"},
    ).json()["mfa_setup"]
    code = pyotp.TOTP(setup["manual_entry_key"]).now()
    response = client.post("/api/auth/mfa/setup/verify", json={"challenge_id": setup["challenge_id"], "code": code})
    assert response.status_code == 200
    return response.json()["user"]


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def test_register_requires_mfa_setup():
    client, _ = make_client()

    response = client.post(
        "/api/auth/register",
        json={"email": "john@example.com", "password": "password123", "display_name": "John"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["mfa_setup_required"] is True
    assert payload["mfa_setup"]["challenge_id"]
    assert payload["mfa_setup"]["manual_entry_key"]
    assert payload["user"]["mfa_enabled"] is False


def test_password_login_requires_mfa_after_registration():
    client, _ = make_client()
    user = enroll_user(client)
    assert user["mfa_enabled"] is True

    client.post("/api/auth/sessions/logout")
    login = client.post("/api/auth/login", json={"email": "john@example.com", "password": "password123"})
    assert login.status_code == 200
    assert login.json()["mfa_required"] is True


def test_totp_rejects_bad_code():
    assert verify_totp("JBSWY3DPEHPK3PXP", "000000") is False


def test_oidc_authorization_code_flow_with_pkce_and_userinfo():
    client, SessionLocal = make_client()
    user = enroll_user(client)
    with SessionLocal() as db:
        db.add(
            OidcClient(
                client_id="media-editor-dev",
                name="Media Editor Dev",
                redirect_uris=["http://client.example/callback"],
                allowed_scopes=["openid", "email", "profile"],
                is_confidential=False,
            )
        )
        db.commit()

    verifier = "a" * 64
    response = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": "media-editor-dev",
            "redirect_uri": "http://client.example/callback",
            "scope": "openid email profile",
            "state": "state-123",
            "nonce": "nonce-123",
            "code_challenge": pkce_challenge(verifier),
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == "http://client.example/callback"
    params = parse_qs(parsed.query)
    assert params["state"] == ["state-123"]
    code = params["code"][0]

    token = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "http://client.example/callback",
            "client_id": "media-editor-dev",
            "code_verifier": verifier,
        },
    )
    assert token.status_code == 200
    token_payload = token.json()
    assert token_payload["access_token"]
    assert token_payload["id_token"]

    reuse = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "http://client.example/callback",
            "client_id": "media-editor-dev",
            "code_verifier": verifier,
        },
    )
    assert reuse.status_code == 400

    userinfo = client.get("/oauth/userinfo", headers={"Authorization": f"Bearer {token_payload['access_token']}"})
    assert userinfo.status_code == 200
    assert userinfo.json()["sub"] == user["id"]
    assert userinfo.json()["email"] == "john@example.com"


def test_avatar_upload_rejects_non_image():
    client, _ = make_client()
    enroll_user(client)

    response = client.post(
        "/api/profile/avatar",
        files={"avatar": ("avatar.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


def test_avatar_upload_replaces_previous_cloudinary_asset(monkeypatch):
    client, _ = make_client()
    enroll_user(client)
    uploads = iter([("avatar/one", "https://cdn.example/one.png"), ("avatar/two", "https://cdn.example/two.png")])
    deleted: list[str] = []

    def fake_upload_avatar(user, content):
        assert user.id
        assert content
        return next(uploads)

    def fake_delete_avatar(public_id):
        deleted.append(public_id)

    monkeypatch.setattr("app.routers.profile.upload_avatar", fake_upload_avatar)
    monkeypatch.setattr("app.routers.profile.delete_avatar", fake_delete_avatar)

    first = client.post(
        "/api/profile/avatar",
        files={"avatar": ("avatar.png", b"first-image", "image/png")},
    )
    second = client.post(
        "/api/profile/avatar",
        files={"avatar": ("avatar.png", b"second-image", "image/png")},
    )

    assert first.status_code == 200
    assert first.json()["avatar_url"] == "https://cdn.example/one.png"
    assert second.status_code == 200
    assert second.json()["avatar_url"] == "https://cdn.example/two.png"
    assert deleted == ["avatar/one"]
