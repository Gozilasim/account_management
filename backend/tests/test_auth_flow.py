# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 02:42
# Description: Backend tests for MFA, OIDC, and avatar flows.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import base64
import hashlib
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pyotp
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import create_app
from app.models import Base, OidcClient, SessionToken, User, utcnow
from app.security import hash_token, verify_totp


# ###############################################
# Test Helpers
# ###############################################

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

    app = create_app(sync_oidc_clients_on_startup=False)
    app.dependency_overrides[get_db] = override_db
    return TestClient(app), TestingSessionLocal


def enroll_user(
    client: TestClient,
    email: str = "john@example.com",
    password: str = "password123",
    with_secret: bool = False,
    headers: dict | None = None,
):
    setup = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": "John"},
    ).json()["mfa_setup"]
    code = pyotp.TOTP(setup["manual_entry_key"]).now()
    response = client.post(
        "/api/auth/mfa/setup/verify",
        json={"challenge_id": setup["challenge_id"], "code": code},
        headers=headers,
    )
    assert response.status_code == 200
    user = response.json()["user"]
    if with_secret:
        return user, setup["manual_entry_key"]
    return user


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def seed_oidc_client(SessionLocal) -> None:
    with SessionLocal() as db:
        db.add(
            OidcClient(
                client_id="media-editor-dev",
                name="Media Editor Dev",
                redirect_uris=["http://client.example/callback"],
                allowed_scopes=["openid", "email", "profile", "phone"],
                is_confidential=False,
            )
        )
        db.commit()


def issue_oidc_token(client: TestClient, scope: str = "openid email profile") -> tuple[dict, str]:
    verifier = "a" * 64
    response = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": "media-editor-dev",
            "redirect_uri": "http://client.example/callback",
            "scope": scope,
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
    return token.json(), code


def reset_token_from_response(response):
    assert response.status_code == 200
    reset_link = response.json()["reset_link"]
    assert reset_link
    return parse_qs(urlparse(reset_link).query)["token"][0]


# ###############################################
# Auth And Password Tests
# ###############################################

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


def test_forgot_password_unknown_email_returns_generic_success():
    client, _ = make_client()

    response = client.post("/api/auth/password/forgot", json={"email": "missing@example.com"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"]
    assert payload["reset_link"] is None


def test_password_reset_for_mfa_user_does_not_require_verification_code():
    client, SessionLocal = make_client()
    user, _ = enroll_user(client, with_secret=True)
    seed_oidc_client(SessionLocal)
    token_payload, _ = issue_oidc_token(client)

    forgot = client.post("/api/auth/password/forgot", json={"email": user["email"]})
    reset_token = reset_token_from_response(forgot)

    inspect = client.post("/api/auth/password/reset/inspect", json={"token": reset_token})
    assert inspect.status_code == 200
    assert inspect.json() == {"valid": True, "mfa_required": False}

    complete = client.post(
        "/api/auth/password/reset/complete",
        json={"token": reset_token, "new_password": "newpassword123"},
    )
    assert complete.status_code == 200
    assert client.get("/api/auth/me").status_code == 401

    userinfo = client.get("/oauth/userinfo", headers={"Authorization": f"Bearer {token_payload['access_token']}"})
    assert userinfo.status_code == 401

    reused = client.post(
        "/api/auth/password/reset/complete",
        json={"token": reset_token, "new_password": "anotherpassword123"},
    )
    assert reused.status_code == 400

    old_password_login = client.post("/api/auth/login", json={"email": user["email"], "password": "password123"})
    new_password_login = client.post("/api/auth/login", json={"email": user["email"], "password": "newpassword123"})
    assert old_password_login.status_code == 401
    assert new_password_login.status_code == 200
    assert new_password_login.json()["mfa_required"] is True


def test_password_reset_rejects_invalid_token():
    client, _ = make_client()

    inspect = client.post("/api/auth/password/reset/inspect", json={"token": "not-a-token"})
    complete = client.post(
        "/api/auth/password/reset/complete",
        json={"token": "not-a-token", "new_password": "newpassword123"},
    )

    assert inspect.status_code == 200
    assert inspect.json() == {"valid": False, "mfa_required": False}
    assert complete.status_code == 400


# ###############################################
# Profile, Session, And Audit Tests
# ###############################################

def test_profile_update_onboarding_and_validation():
    client, SessionLocal = make_client()
    user = enroll_user(client)

    initial = client.get("/api/auth/me")
    assert initial.status_code == 200
    assert initial.json()["profile_completion"]["next_prompt_field"] == "phone_number"

    update = client.patch(
        "/api/profile",
        json={
            "first_name": "John",
            "last_name": "Portal",
            "phone_number": "+15551234567",
            "gender": "custom",
            "gender_custom": "Self described",
            "date_of_birth": "1990-01-02",
            "locale": "en-US",
            "timezone": "Asia/Kuala_Lumpur",
        },
    )
    assert update.status_code == 200
    payload = update.json()
    assert payload["first_name"] == "John"
    assert payload["last_name"] == "Portal"
    assert payload["phone_number"] == "+15551234567"
    assert payload["phone_verified"] is False
    assert payload["gender"] == "custom"
    assert payload["gender_custom"] == "Self described"
    assert payload["profile_completion"]["next_prompt_field"] is None

    partial = client.patch("/api/profile", json={"first_name": "Johnny"})
    assert partial.status_code == 200
    assert partial.json()["first_name"] == "Johnny"
    assert partial.json()["last_name"] == "Portal"

    with SessionLocal() as db:
        db_user = db.get(User, user["id"])
        db_user.phone_verified = True
        db.commit()

    changed_phone = client.patch("/api/profile", json={"phone_number": "+15557654321"})
    assert changed_phone.status_code == 200
    assert changed_phone.json()["phone_verified"] is False

    invalid_gender = client.patch("/api/profile", json={"gender": "robot"})
    missing_custom = client.patch("/api/profile", json={"gender": "custom"})
    invalid_timezone = client.patch("/api/profile", json={"timezone": "Mars/Base"})
    assert invalid_gender.status_code == 422
    assert missing_custom.status_code == 422
    assert invalid_timezone.status_code == 422


def test_profile_onboarding_skip_and_complete():
    client, _ = make_client()
    enroll_user(client)

    skipped = client.post("/api/profile/onboarding/skip", json={"field": "phone_number"})
    assert skipped.status_code == 200
    assert skipped.json()["profile_completion"]["skipped_fields"] == ["phone_number"]
    assert skipped.json()["profile_completion"]["next_prompt_field"] == "gender"

    completed = client.post("/api/profile/onboarding/complete")
    assert completed.status_code == 200
    assert completed.json()["profile_completion"]["onboarding_completed"] is True
    assert completed.json()["profile_completion"]["next_prompt_field"] is None


def test_sessions_capture_device_ip_and_logout_others():
    client, SessionLocal = make_client()
    user = enroll_user(
        client,
        email="session@example.com",
        with_secret=False,
        headers={"user-agent": "Mozilla/5.0 (Windows NT 10.0)"},
    )
    with SessionLocal() as db:
        db.add(
            SessionToken(
                user_id=user["id"],
                token_hash=hash_token("other-session-token"),
                expires_at=utcnow() + timedelta(days=1),
                login_ip_address="198.51.100.20",
                last_seen_ip_address="198.51.100.21",
                user_agent="Other Browser",
                device_label="Other device",
            )
        )
        db.commit()

    sessions = client.get("/api/auth/sessions")
    assert sessions.status_code == 200
    payload = sessions.json()
    assert len(payload) == 2
    assert "token_hash" not in payload[0]
    current = next(item for item in payload if item["is_current"])
    assert current["device_label"] == "Windows device"
    assert current["last_seen_ip_address"] == "testclient"

    logout_others = client.post("/api/auth/sessions/logout-others")
    assert logout_others.status_code == 200
    remaining = client.get("/api/auth/sessions").json()
    assert len(remaining) == 1
    assert remaining[0]["is_current"] is True


def test_delete_foreign_session_is_not_allowed():
    client, SessionLocal = make_client()
    enroll_user(client, email="owner@example.com")
    other = enroll_user(TestClient(client.app), email="other@example.com")

    with SessionLocal() as db:
        foreign = SessionToken(
            user_id=other["id"],
            token_hash=hash_token("foreign-session-token"),
            expires_at=utcnow() + timedelta(days=1),
        )
        db.add(foreign)
        db.commit()
        foreign_id = foreign.id

    response = client.delete(f"/api/auth/sessions/{foreign_id}")
    assert response.status_code == 404


def test_proxy_header_ip_is_only_used_when_enabled(monkeypatch):
    from app.audit import settings as audit_settings

    client, _ = make_client()
    monkeypatch.setattr(audit_settings, "trust_proxy_headers", False)
    enroll_user(
        client,
        email="proxy@example.com",
        with_secret=False,
    )

    client.get("/api/auth/me", headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1"})
    session = client.get("/api/auth/sessions").json()[0]
    assert session["last_seen_ip_address"] == "testclient"

    monkeypatch.setattr(audit_settings, "trust_proxy_headers", True)
    client.get("/api/auth/me", headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1"})
    session = client.get("/api/auth/sessions", headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1"}).json()[0]
    assert session["last_seen_ip_address"] == "203.0.113.7"


def test_security_events_are_scoped_to_current_user():
    client, _ = make_client()
    enroll_user(client, email="events@example.com")
    client.patch("/api/profile", json={"first_name": "Event"})

    events = client.get("/api/auth/security-events")
    assert events.status_code == 200
    event_types = [event["event_type"] for event in events.json()]
    assert "login_success" in event_types
    assert "mfa_enabled" in event_types
    assert "profile_updated" in event_types


def test_totp_rejects_bad_code():
    assert verify_totp("JBSWY3DPEHPK3PXP", "000000") is False


# ###############################################
# OIDC And Avatar Tests
# ###############################################

def test_oidc_authorize_redirects_unauthenticated_user_to_popup_authorize_page():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)

    response = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": "media-editor-dev",
            "redirect_uri": "http://client.example/callback",
            "scope": "openid email profile",
            "state": "state-123",
            "nonce": "nonce-123",
            "code_challenge": pkce_challenge("a" * 64),
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )

    assert response.status_code == 302
    location = response.headers["location"]
    parsed = urlparse(location)
    assert parsed.path == "/authorize"
    next_url = parse_qs(parsed.query)["next"][0]
    next_parsed = urlparse(next_url)
    next_params = parse_qs(next_parsed.query)
    assert next_parsed.path == "/oauth/authorize"
    assert next_params["client_id"] == ["media-editor-dev"]
    assert next_params["redirect_uri"] == ["http://client.example/callback"]


def test_oidc_authorize_context_returns_public_client_details_and_validates_request():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)

    context = client.get(
        "/oauth/authorize/context",
        params={
            "client_id": "media-editor-dev",
            "redirect_uri": "http://client.example/callback",
            "scope": "openid email profile phone",
        },
    )
    bad_redirect = client.get(
        "/oauth/authorize/context",
        params={
            "client_id": "media-editor-dev",
            "redirect_uri": "http://evil.example/callback",
            "scope": "openid email profile",
        },
    )
    bad_scope = client.get(
        "/oauth/authorize/context",
        params={
            "client_id": "media-editor-dev",
            "redirect_uri": "http://client.example/callback",
            "scope": "openid admin",
        },
    )

    assert context.status_code == 200
    payload = context.json()
    assert payload["client_id"] == "media-editor-dev"
    assert payload["client_name"] == "Media Editor Dev"
    assert payload["scopes"] == ["openid", "email", "profile", "phone"]
    assert bad_redirect.status_code == 400
    assert bad_scope.status_code == 400


def test_oidc_authorization_code_flow_with_pkce_and_userinfo():
    client, SessionLocal = make_client()
    user = enroll_user(client)
    profile = client.patch(
        "/api/profile",
        json={
            "first_name": "John",
            "last_name": "Portal",
            "phone_number": "+15551234567",
            "gender": "male",
            "date_of_birth": "1990-01-02",
            "locale": "en-US",
            "timezone": "Asia/Kuala_Lumpur",
        },
    )
    assert profile.status_code == 200
    seed_oidc_client(SessionLocal)
    verifier = "a" * 64
    token_payload, code = issue_oidc_token(client, scope="openid email profile phone")
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
    assert userinfo.json()["given_name"] == "John"
    assert userinfo.json()["family_name"] == "Portal"
    assert userinfo.json()["phone_number"] == "+15551234567"
    assert userinfo.json()["phone_number_verified"] is False
    assert userinfo.json()["zoneinfo"] == "Asia/Kuala_Lumpur"

    token_payload_without_phone, _ = issue_oidc_token(client)
    userinfo_without_phone = client.get(
        "/oauth/userinfo",
        headers={"Authorization": f"Bearer {token_payload_without_phone['access_token']}"},
    )
    assert userinfo_without_phone.status_code == 200
    assert "phone_number" not in userinfo_without_phone.json()


def test_avatar_upload_rejects_non_image():
    client, _ = make_client()
    enroll_user(client)

    response = client.post(
        "/api/profile/avatar",
        files={"avatar": ("avatar.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


def test_avatar_upload_preserves_previous_assets_in_history(monkeypatch):
    client, _ = make_client()
    enroll_user(client)
    uploads = iter(
        [
            ("avatar/one", "https://cdn.example/one.png"),
            ("avatar/two", "https://cdn.example/two.png"),
            ("avatar/three", "https://cdn.example/three.png"),
        ]
    )
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
    third = client.post(
        "/api/profile/avatar",
        files={"avatar": ("avatar.png", b"third-image", "image/png")},
    )

    assert first.status_code == 200
    assert first.json()["avatar_url"] == "https://cdn.example/one.png"
    assert first.json()["avatar_history"] == []
    assert second.status_code == 200
    assert second.json()["avatar_url"] == "https://cdn.example/two.png"
    assert [item["public_id"] for item in second.json()["avatar_history"]] == ["avatar/one"]
    assert third.status_code == 200
    assert third.json()["avatar_url"] == "https://cdn.example/three.png"
    assert [item["public_id"] for item in third.json()["avatar_history"]] == ["avatar/one", "avatar/two"]
    assert deleted == []

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert [item["public_id"] for item in me.json()["avatar_history"]] == ["avatar/one", "avatar/two"]

    history = client.get("/api/profile/avatar/history")
    assert history.status_code == 200
    assert [item["public_id"] for item in history.json()] == ["avatar/one", "avatar/two"]

    restored = client.post("/api/profile/avatar/restore", json={"public_id": "avatar/one"})
    assert restored.status_code == 200
    assert restored.json()["avatar_url"] == "https://cdn.example/one.png"
    assert [item["public_id"] for item in restored.json()["avatar_history"]] == ["avatar/two", "avatar/three"]

    delete_current = client.delete("/api/profile/avatar/history/avatar/one")
    assert delete_current.status_code == 400

    deleted_history = client.delete("/api/profile/avatar/history/avatar/two")
    assert deleted_history.status_code == 200
    assert deleted == ["avatar/two"]
    remaining = client.get("/api/profile/avatar/history")
    assert [item["public_id"] for item in remaining.json()] == ["avatar/three"]
