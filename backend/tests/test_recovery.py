# Created at: 2026-10-11 11:37
# Updated at: 2026-10-11 11:37
# Description: Backend tests for backup codes, the recovery email, and email verification.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import re

import pyotp

from app.config import settings
from test_auth_flow import enroll_user, make_client, reset_token_from_response

PASSWORD = "password123"


# ###############################################
# Test Helpers
# ###############################################

def capture_emails(monkeypatch) -> list:
    """Turns on email delivery and collects every message instead of contacting an SMTP server."""
    sent: list = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "email_from", "GozilaSim ID <no-reply@example.test>")
    monkeypatch.setattr("app.emailer.deliver", sent.append)
    return sent


def emailed_code(message) -> str:
    body = message.get_body(preferencelist=("plain",)).get_content()
    return re.search(r"\b(\d{6})\b", body).group(1)


def generate_codes(client) -> list[str]:
    response = client.post("/api/auth/backup-codes", json={"current_password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["codes"]


def start_sign_in(client, email: str) -> dict:
    client.post("/api/auth/sessions/logout")
    login = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return login.json()


def add_recovery_email(client, address: str = "backup@example.com") -> None:
    started = client.post("/api/auth/recovery-email", json={"email": address, "current_password": PASSWORD})
    assert started.status_code == 200, started.text
    verified = client.post("/api/auth/recovery-email/verify", json={"code": started.json()["dev_code"]})
    assert verified.status_code == 200, verified.text


# ###############################################
# Backup Code Tests
# ###############################################

def test_backup_codes_are_generated_once_and_counted():
    client, _ = make_client()
    enroll_user(client)

    wrong_password = client.post("/api/auth/backup-codes", json={"current_password": "not-the-password"})
    assert wrong_password.status_code == 401

    codes = generate_codes(client)
    assert len(codes) == 10
    assert len(set(codes)) == 10
    assert all(re.fullmatch(r"\d{4} \d{4}", code) for code in codes)

    me = client.get("/api/auth/me").json()
    assert me["backup_codes_remaining"] == 10
    assert me["backup_codes_generated_at"]


def test_backup_code_signs_in_once():
    client, _ = make_client()
    user = enroll_user(client)
    codes = generate_codes(client)

    login = start_sign_in(client, user["email"])
    assert login["mfa_methods"] == ["totp", "backup_code"]
    used = client.post(
        "/api/auth/mfa/login/verify",
        json={"challenge_id": login["challenge_id"], "code": codes[0], "method": "backup_code"},
    )
    assert used.status_code == 200
    assert used.json()["user"]["backup_codes_remaining"] == 9
    assert "backup_code_used" in [event["event_type"] for event in client.get("/api/auth/security-events").json()]

    login = start_sign_in(client, user["email"])
    reused = client.post(
        "/api/auth/mfa/login/verify",
        json={"challenge_id": login["challenge_id"], "code": codes[0], "method": "backup_code"},
    )
    assert reused.status_code == 401


def test_new_backup_codes_replace_the_old_ones():
    client, _ = make_client()
    user = enroll_user(client)
    old_codes = generate_codes(client)
    new_codes = generate_codes(client)
    assert client.get("/api/auth/me").json()["backup_codes_remaining"] == 10

    login = start_sign_in(client, user["email"])
    old = client.post(
        "/api/auth/mfa/login/verify",
        json={"challenge_id": login["challenge_id"], "code": old_codes[0], "method": "backup_code"},
    )
    assert old.status_code == 401
    new = client.post(
        "/api/auth/mfa/login/verify",
        json={"challenge_id": login["challenge_id"], "code": new_codes[0], "method": "backup_code"},
    )
    assert new.status_code == 200


def test_backup_code_completes_a_password_reset():
    client, _ = make_client()
    user = enroll_user(client)
    codes = generate_codes(client)
    client.post("/api/auth/sessions/logout")

    token = reset_token_from_response(client.post("/api/auth/password/forgot", json={"email": user["email"]}))
    reset = client.post(
        "/api/auth/password/reset/complete",
        json={"token": token, "new_password": "newpassword123", "mfa_code": codes[3]},
    )

    assert reset.status_code == 200
    assert client.post("/api/auth/login", json={"email": user["email"], "password": "newpassword123"}).status_code == 200


def test_turning_off_verification_removes_backup_codes():
    client, _ = make_client()
    _user, secret = enroll_user(client, with_secret=True)
    generate_codes(client)

    disabled = client.post(
        "/api/auth/mfa/disable",
        json={"current_password": PASSWORD, "code": pyotp.TOTP(secret).now()},
    )

    assert disabled.status_code == 200
    assert disabled.json()["backup_codes_remaining"] == 0
    assert client.post("/api/auth/backup-codes", json={"current_password": PASSWORD}).status_code == 400


# ###############################################
# Recovery Email Tests
# ###############################################

def test_recovery_email_is_saved_only_after_the_code_is_confirmed():
    client, _ = make_client()
    user = enroll_user(client)

    same = client.post("/api/auth/recovery-email", json={"email": user["email"], "current_password": PASSWORD})
    assert same.status_code == 400
    wrong_password = client.post(
        "/api/auth/recovery-email",
        json={"email": "backup@example.com", "current_password": "not-the-password"},
    )
    assert wrong_password.status_code == 401

    started = client.post("/api/auth/recovery-email", json={"email": "Backup@Example.com", "current_password": PASSWORD})
    assert started.status_code == 200
    assert started.json()["delivery"] == "log"
    assert client.get("/api/auth/me").json()["recovery_email"] is None

    wrong_code = client.post("/api/auth/recovery-email/verify", json={"code": "000000"})
    assert wrong_code.status_code == 401
    verified = client.post("/api/auth/recovery-email/verify", json={"code": started.json()["dev_code"]})
    assert verified.status_code == 200
    assert verified.json()["recovery_email"] == "backup@example.com"
    assert verified.json()["recovery_email_verified"] is True

    removed = client.post("/api/auth/recovery-email/remove", json={"current_password": PASSWORD})
    assert removed.status_code == 200
    assert removed.json()["recovery_email"] is None


def test_recovery_email_code_signs_in():
    client, _ = make_client()
    user = enroll_user(client)
    add_recovery_email(client)

    login = start_sign_in(client, user["email"])
    assert login["mfa_methods"] == ["totp", "recovery_email"]
    assert login["recovery_email_hint"] == "b•••@example.com"

    sent = client.post("/api/auth/mfa/login/recovery-email", json={"challenge_id": login["challenge_id"]})
    assert sent.status_code == 200
    signed_in = client.post(
        "/api/auth/mfa/login/verify",
        json={"challenge_id": login["challenge_id"], "code": sent.json()["dev_code"], "method": "recovery_email"},
    )
    assert signed_in.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_recovery_sign_in_needs_a_recovery_email():
    client, _ = make_client()
    user = enroll_user(client)

    login = start_sign_in(client, user["email"])
    assert login["mfa_methods"] == ["totp"]
    assert login["recovery_email_hint"] is None
    sent = client.post("/api/auth/mfa/login/recovery-email", json={"challenge_id": login["challenge_id"]})
    assert sent.status_code == 400


# ###############################################
# Email Verification Tests
# ###############################################

def test_email_is_verified_with_an_emailed_code(monkeypatch):
    client, _ = make_client()
    user = enroll_user(client)
    assert user["email_verified"] is False
    sent = capture_emails(monkeypatch)

    started = client.post("/api/auth/email/verification")
    assert started.status_code == 200
    assert started.json() == {"message": "A verification code has been sent.", "delivery": "email", "dev_code": None}
    assert len(sent) == 1
    assert sent[0]["To"] == user["email"]

    wrong = client.post("/api/auth/email/verification/confirm", json={"code": "000000"})
    assert wrong.status_code == 401
    confirmed = client.post("/api/auth/email/verification/confirm", json={"code": emailed_code(sent[0])})
    assert confirmed.status_code == 200
    assert confirmed.json()["email_verified"] is True
    assert client.post("/api/auth/email/verification").status_code == 400


def test_a_newer_code_cancels_the_earlier_one():
    client, _ = make_client()
    enroll_user(client)

    first = client.post("/api/auth/email/verification").json()["dev_code"]
    second = client.post("/api/auth/email/verification").json()["dev_code"]

    if first != second:
        assert client.post("/api/auth/email/verification/confirm", json={"code": first}).status_code == 401
    assert client.post("/api/auth/email/verification/confirm", json={"code": second}).status_code == 200


def test_codes_are_refused_on_a_deployed_site_without_email(monkeypatch):
    client, _ = make_client()
    enroll_user(client)
    monkeypatch.setattr(settings, "frontend_url", "https://id.example.com")

    response = client.post("/api/auth/email/verification")

    assert response.status_code == 503
