# Created at: 2026-10-11 12:17
# Updated at: 2026-10-11 12:17
# Description: Backend tests for the data summary, the data export, deleting an account, and the password age.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import re
import time

import pyotp
from sqlalchemy import func, select

from app.config import settings
from app.models import (
    AccessToken,
    AppConsent,
    AuthChallenge,
    AuthorizationCode,
    BackupCode,
    SecurityEvent,
    SessionToken,
    User,
)
from test_auth_flow import enroll_user, issue_oidc_token, make_client, seed_oidc_client
from test_recovery import capture_emails, emailed_code, generate_codes

PASSWORD = "password123"
EMAIL = "john@example.com"
USER_TABLES = (SessionToken, SecurityEvent, AuthChallenge, BackupCode, AuthorizationCode, AccessToken, AppConsent)


# ###############################################
# Test Helpers
# ###############################################

def delete_account(client, email: str = EMAIL, password: str = PASSWORD, code: str | None = None):
    body = {"email": email, "current_password": password}
    if code is not None:
        body["code"] = code
    return client.post("/api/account/delete", json=body)


def turn_off_extra_verification(client, secret: str) -> None:
    response = client.post(
        "/api/auth/mfa/disable",
        json={"current_password": PASSWORD, "code": pyotp.TOTP(secret).now()},
    )
    assert response.status_code == 200, response.text


def rows_left(SessionLocal, user_id: str) -> dict[str, int]:
    """Counts what is still stored for an account, table by table."""
    with SessionLocal() as db:
        counts = {
            model.__tablename__: db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id))
            for model in USER_TABLES
        }
        counts["users"] = db.scalar(select(func.count()).select_from(User).where(User.id == user_id))
    return {table: count for table, count in counts.items() if count}


# ###############################################
# Summary And Export Tests
# ###############################################

def test_data_summary_counts_what_the_account_holds():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)

    assert client.get("/api/account/data-summary").status_code == 401

    enroll_user(client)
    summary = client.get("/api/account/data-summary").json()
    assert summary["sessions"] == 1
    assert summary["security_events"] == len(client.get("/api/auth/security-events").json())
    assert summary["profile_pictures"] == 0
    assert summary["connected_apps"] == 0
    assert summary["delete_confirmation"] == "authenticator"

    issue_oidc_token(client)
    assert client.get("/api/account/data-summary").json()["connected_apps"] == 1


def test_export_holds_the_account_but_never_its_secrets():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    user, secret = enroll_user(client, with_secret=True)
    codes = generate_codes(client)
    token, _ = issue_oidc_token(client)

    assert client.get("/api/account/export").status_code == 200
    response = client.get("/api/account/export")
    assert response.headers["content-disposition"].startswith("attachment;")
    exported = response.json()

    assert exported["account"]["id"] == user["id"]
    assert exported["account"]["email"] == EMAIL
    assert exported["sign_in"]["extra_verification_enabled"] is True
    assert exported["sign_in"]["backup_codes_remaining"] == 10
    assert len(exported["sessions"]) == 1
    assert exported["sessions"][0]["is_current"] is True
    assert exported["connected_apps"][0]["client_id"] == "media-editor-dev"
    exported_events = [event["event_type"] for event in exported["security_events"]]
    assert "login_success" in exported_events
    # The first download is itself part of the history the second one contains.
    assert "data_exported" in exported_events

    text = response.text
    assert secret not in text
    assert token["access_token"] not in text
    assert client.cookies.get(settings.session_cookie_name) not in text
    for forbidden in ("password_hash", "mfa_secret", "token_hash", "code_hash"):
        assert forbidden not in text
    for code in codes:
        assert code not in text
        assert code.replace(" ", "") not in text

    with SessionLocal() as db:
        stored_hash = db.get(User, user["id"]).password_hash
    assert stored_hash not in text


def test_export_requires_a_session():
    client, _ = make_client()

    assert client.get("/api/account/export").status_code == 401


# ###############################################
# Account Deletion Tests
# ###############################################

def test_delete_account_needs_the_email_the_password_and_a_code():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    user, secret = enroll_user(client, with_secret=True)
    generate_codes(client)
    issue_oidc_token(client)
    code = pyotp.TOTP(secret).now()

    assert delete_account(client, email="someone.else@example.com", code=code).status_code == 400
    assert delete_account(client, password="not-the-password", code=code).status_code == 401
    assert delete_account(client, code="000000").status_code == 401
    assert delete_account(client).status_code == 401
    assert client.get("/api/auth/me").status_code == 200

    deleted = delete_account(client, code=pyotp.TOTP(secret).now())
    assert deleted.status_code == 200, deleted.text
    assert client.get("/api/auth/me").status_code == 401
    assert rows_left(SessionLocal, user["id"]) == {}

    sign_in = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert sign_in.status_code == 401


def test_delete_account_accepts_a_backup_code():
    client, SessionLocal = make_client()
    user = enroll_user(client)
    codes = generate_codes(client)

    assert delete_account(client, code=codes[0]).status_code == 200
    assert rows_left(SessionLocal, user["id"]) == {}


def test_deleted_email_address_can_register_again():
    client, _ = make_client()
    _, secret = enroll_user(client, with_secret=True)
    assert delete_account(client, code=pyotp.TOTP(secret).now()).status_code == 200

    again = client.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD, "display_name": "John"})
    assert again.status_code == 201


def test_wrong_delete_attempts_lock_like_sign_in():
    client, _ = make_client()
    enroll_user(client)

    answers = [delete_account(client, password="not-the-password", code="000000").status_code for _ in range(6)]
    assert answers[:4] == [401, 401, 401, 401]
    assert answers[4:] == [429, 429]
    assert client.get("/api/auth/me").status_code == 200


def test_account_without_extra_verification_confirms_with_an_emailed_code(monkeypatch):
    client, SessionLocal = make_client()
    user, secret = enroll_user(client, with_secret=True)
    turn_off_extra_verification(client, secret)
    sent = capture_emails(monkeypatch)
    assert client.get("/api/account/data-summary").json()["delete_confirmation"] == "email_code"

    # No code has been requested yet, so there is nothing to match.
    assert delete_account(client, code="123456").status_code == 400

    requested = client.post("/api/account/delete/code")
    assert requested.status_code == 200
    assert requested.json()["delivery"] == "email"
    assert requested.json()["dev_code"] is None
    assert sent[-1]["To"] == EMAIL
    assert sent[-1]["Subject"] == "Confirm deleting your account"
    code = emailed_code(sent[-1])

    wrong = "000000" if code != "000000" else "111111"
    assert delete_account(client, code=wrong).status_code == 401
    assert delete_account(client, code=code).status_code == 200
    assert rows_left(SessionLocal, user["id"]) == {}
    assert sent[-1]["To"] == EMAIL
    assert sent[-1]["Subject"] == "Your account was deleted"


def test_account_with_extra_verification_cannot_ask_for_an_emailed_code(monkeypatch):
    client, _ = make_client()
    enroll_user(client)
    capture_emails(monkeypatch)

    assert client.post("/api/account/delete/code").status_code == 400


def test_delete_needs_only_the_password_when_no_code_can_be_sent(monkeypatch):
    client, SessionLocal = make_client()
    user, secret = enroll_user(client, with_secret=True)
    turn_off_extra_verification(client, secret)
    # A deployed site with email switched off has no way to deliver a code.
    monkeypatch.setattr(settings, "frontend_url", "https://id.example.com")

    assert client.get("/api/account/data-summary").json()["delete_confirmation"] == "password"
    assert client.post("/api/account/delete/code").status_code == 400
    assert delete_account(client, password="not-the-password").status_code == 401
    assert delete_account(client).status_code == 200
    assert rows_left(SessionLocal, user["id"]) == {}


def test_deleting_an_account_removes_its_stored_pictures(monkeypatch):
    client, SessionLocal = make_client()
    user, secret = enroll_user(client, with_secret=True)
    with SessionLocal() as db:
        stored = db.get(User, user["id"])
        stored.avatar_public_id = "portal/avatars/current"
        stored.avatar_url = "https://images.example/current.png"
        stored.avatar_history = [
            {"public_id": "portal/avatars/old", "url": "https://images.example/old.png", "uploaded_at": "", "replaced_at": ""}
        ]
        db.commit()
    removed: list[str] = []
    monkeypatch.setattr("app.routers.account.delete_avatar", removed.append)

    assert client.get("/api/account/data-summary").json()["profile_pictures"] == 2
    assert delete_account(client, code=pyotp.TOTP(secret).now()).status_code == 200
    assert sorted(removed) == ["portal/avatars/current", "portal/avatars/old"]


# ###############################################
# Password Age Tests
# ###############################################

def test_password_changed_at_follows_the_password():
    client, _ = make_client()
    enroll_user(client)
    first = client.get("/api/auth/me").json()["password_changed_at"]
    assert re.match(r"\d{4}-\d{2}-\d{2}T", first)

    time.sleep(0.05)
    changed = client.post(
        "/api/auth/password/change",
        json={"current_password": PASSWORD, "new_password": "another-password-456"},
    )
    assert changed.status_code == 200
    assert client.get("/api/auth/me").json()["password_changed_at"] > first
