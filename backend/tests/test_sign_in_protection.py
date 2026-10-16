# Created at: 2026-10-11 11:25
# Updated at: 2026-10-11 11:25
# Description: Backend tests for sign-in lockouts, password reset delivery, and new-device sign-in alerts.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pyotp
from sqlalchemy import select

from app.config import settings
from app.models import AuthThrottle, SecurityEvent, utcnow
from test_auth_flow import enroll_user, make_client

PASSWORD = "password123"


# ###############################################
# Test Helpers
# ###############################################

def sign_in(client, email: str, secret: str, headers: dict | None = None):
    """Completes password plus verification code sign-in and returns the final response."""
    login = client.post("/api/auth/login", json={"email": email, "password": PASSWORD}, headers=headers)
    assert login.status_code == 200, login.text
    return client.post(
        "/api/auth/mfa/login/verify",
        json={"challenge_id": login.json()["challenge_id"], "code": pyotp.TOTP(secret).now()},
        headers=headers,
    )


def wrong_password(client, email: str):
    return client.post("/api/auth/login", json={"email": email, "password": "not-the-password"})


def capture_emails(monkeypatch) -> list:
    """Turns on email delivery and collects every message instead of contacting an SMTP server."""
    sent: list = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "email_from", "GozilaSim ID <no-reply@example.test>")
    monkeypatch.setattr("app.emailer.deliver", sent.append)
    return sent


def plain_text(message) -> str:
    return message.get_body(preferencelist=("plain",)).get_content()


# ###############################################
# Lockout Tests
# ###############################################

def test_sign_in_locks_after_repeated_wrong_passwords():
    client, SessionLocal = make_client()
    user, secret = enroll_user(client, with_secret=True)
    client.post("/api/auth/sessions/logout")

    for _ in range(settings.auth_max_failed_attempts - 1):
        assert wrong_password(client, user["email"]).status_code == 401

    locking_attempt = wrong_password(client, user["email"])
    assert locking_attempt.status_code == 429
    assert 0 < int(locking_attempt.headers["retry-after"]) <= settings.auth_lockout_minutes * 60

    # The right password is refused too while the lock is active.
    locked = client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert locked.status_code == 429

    with SessionLocal() as db:
        for throttle in db.scalars(select(AuthThrottle)):
            throttle.locked_until = utcnow() - timedelta(seconds=1)
        db.commit()

    assert sign_in(client, user["email"], secret).status_code == 200
    with SessionLocal() as db:
        assert db.scalars(select(AuthThrottle)).all() == []


def test_unknown_email_is_locked_the_same_way():
    client, _ = make_client()

    statuses = [wrong_password(client, "nobody@example.com").status_code for _ in range(settings.auth_max_failed_attempts)]

    assert statuses == [401] * (settings.auth_max_failed_attempts - 1) + [429]


def test_wrong_verification_codes_count_toward_the_lockout():
    client, _ = make_client()
    user, _secret = enroll_user(client, with_secret=True)
    client.post("/api/auth/sessions/logout")
    challenge_id = client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).json()["challenge_id"]

    statuses = [
        client.post("/api/auth/mfa/login/verify", json={"challenge_id": challenge_id, "code": "000000"}).status_code
        for _ in range(settings.auth_max_failed_attempts)
    ]

    assert statuses == [401] * (settings.auth_max_failed_attempts - 1) + [429]
    assert client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).status_code == 429


def test_successful_sign_in_resets_the_failure_count():
    client, _ = make_client()
    user, secret = enroll_user(client, with_secret=True)
    client.post("/api/auth/sessions/logout")

    for _ in range(settings.auth_max_failed_attempts - 1):
        assert wrong_password(client, user["email"]).status_code == 401
    assert sign_in(client, user["email"], secret).status_code == 200
    client.post("/api/auth/sessions/logout")

    # Without the reset, the first of these would already trigger the lock.
    for _ in range(settings.auth_max_failed_attempts - 1):
        assert wrong_password(client, user["email"]).status_code == 401


def test_wrong_current_password_is_limited_for_signed_in_users():
    client, _ = make_client()
    enroll_user(client)

    statuses = [
        client.post(
            "/api/auth/password/change",
            json={"current_password": "not-the-password", "new_password": "newpassword123"},
        ).status_code
        for _ in range(settings.auth_max_failed_attempts)
    ]

    assert statuses == [401] * (settings.auth_max_failed_attempts - 1) + [429]


# ###############################################
# Password Reset Delivery Tests
# ###############################################

def test_reset_link_is_never_returned_on_a_deployed_frontend(monkeypatch):
    client, _ = make_client()
    user = enroll_user(client)
    monkeypatch.setattr(settings, "frontend_url", "https://id.example.com")

    response = client.post("/api/auth/password/forgot", json={"email": user["email"]})

    assert response.status_code == 200
    assert response.json()["reset_link"] is None
    assert response.json()["delivery"] == "log"


def test_reset_link_is_emailed_when_email_delivery_is_on(monkeypatch):
    client, _ = make_client()
    user = enroll_user(client)
    sent = capture_emails(monkeypatch)
    monkeypatch.setattr(settings, "password_reset_delivery", "email")

    response = client.post("/api/auth/password/forgot", json={"email": user["email"]})

    assert response.json()["reset_link"] is None
    assert response.json()["delivery"] == "email"
    assert len(sent) == 1
    assert sent[0]["To"] == user["email"]
    link = next(line for line in plain_text(sent[0]).splitlines() if "/reset-password?token=" in line)
    token = parse_qs(urlparse(link.strip()).query)["token"][0]
    inspect = client.post("/api/auth/password/reset/inspect", json={"token": token})
    assert inspect.json() == {"valid": True, "mfa_required": True}


def test_no_email_is_sent_for_an_unknown_address(monkeypatch):
    client, _ = make_client()
    sent = capture_emails(monkeypatch)
    monkeypatch.setattr(settings, "password_reset_delivery", "email")

    response = client.post("/api/auth/password/forgot", json={"email": "nobody@example.com"})

    assert response.status_code == 200
    assert response.json()["delivery"] == "email"
    assert sent == []


def test_email_delivery_falls_back_to_the_log_without_smtp(monkeypatch):
    client, _ = make_client()
    user = enroll_user(client)
    monkeypatch.setattr(settings, "password_reset_delivery", "email")
    monkeypatch.setattr(settings, "smtp_host", None)

    response = client.post("/api/auth/password/forgot", json={"email": user["email"]})

    assert response.json()["delivery"] == "log"


def test_reset_requests_are_limited(monkeypatch):
    client, _ = make_client()
    sent = capture_emails(monkeypatch)
    monkeypatch.setattr(settings, "password_reset_delivery", "email")
    user = enroll_user(client)

    statuses = [
        client.post("/api/auth/password/forgot", json={"email": user["email"]}).status_code
        for _ in range(settings.auth_max_failed_attempts + 1)
    ]

    assert statuses == [200] * settings.auth_max_failed_attempts + [429]
    assert len(sent) == settings.auth_max_failed_attempts


# ###############################################
# New Sign-In Alert Tests
# ###############################################

def test_new_device_sign_in_sends_one_alert(monkeypatch):
    client, SessionLocal = make_client()
    sent = capture_emails(monkeypatch)
    user, secret = enroll_user(client, with_secret=True)
    client.post("/api/auth/sessions/logout")
    phone = {"user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Safari/604.1"}

    # Enrolling was the first sign-in, and signing in again from the same browser is not news.
    assert sign_in(client, user["email"], secret).status_code == 200
    assert sent == []
    client.post("/api/auth/sessions/logout")

    assert sign_in(client, user["email"], secret, headers=phone).status_code == 200
    assert len(sent) == 1
    assert sent[0]["To"] == user["email"]
    assert "iPhone" in plain_text(sent[0])
    client.post("/api/auth/sessions/logout", headers=phone)

    assert sign_in(client, user["email"], secret, headers=phone).status_code == 200
    assert len(sent) == 1

    with SessionLocal() as db:
        flagged = [
            event
            for event in db.scalars(select(SecurityEvent).where(SecurityEvent.event_type == "login_success"))
            if (event.metadata_json or {}).get("new_device")
        ]
    assert len(flagged) == 1
