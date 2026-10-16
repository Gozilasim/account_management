# Created at: 2026-10-11 12:17
# Updated at: 2026-10-11 12:17
# Description: Backend tests for app consent, the connected apps list, and removing an app's access.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from urllib.parse import parse_qs, urlparse

from app.config import settings
from test_auth_flow import allow_app, enroll_user, issue_oidc_token, make_client, pkce_challenge, seed_oidc_client

CLIENT_ID = "media-editor-dev"
REDIRECT_URI = "http://client.example/callback"
VERIFIER = "a" * 64


# ###############################################
# Test Helpers
# ###############################################

def authorize(client, scope: str = "openid email profile"):
    return client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "scope": scope,
            "state": "state-123",
            "code_challenge": pkce_challenge(VERIFIER),
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )


def sent_to_consent_page(response) -> bool:
    return response.status_code == 302 and response.headers["location"].startswith(f"{settings.frontend_origin}/authorize?next=")


def issued_code(response) -> str | None:
    if response.status_code != 302 or not response.headers["location"].startswith(REDIRECT_URI):
        return None
    return parse_qs(urlparse(response.headers["location"]).query).get("code", [None])[0]


def consent_required(client, scope: str = "openid email profile") -> bool:
    context = client.get(
        "/oauth/authorize/context",
        params={"client_id": CLIENT_ID, "redirect_uri": REDIRECT_URI, "scope": scope},
    )
    assert context.status_code == 200, context.text
    return context.json()["consent_required"]


def event_types(client) -> list[str]:
    return [event["event_type"] for event in client.get("/api/auth/security-events").json()]


# ###############################################
# Consent Tests
# ###############################################

def test_first_sign_in_to_an_app_goes_through_the_consent_page():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    enroll_user(client)

    assert consent_required(client) is True
    assert sent_to_consent_page(authorize(client))

    assert allow_app(client).status_code == 200
    assert consent_required(client) is False
    assert issued_code(authorize(client))
    assert event_types(client).count("app_access_granted") == 1

    # Agreeing again to the same access changes nothing and is not logged twice.
    assert allow_app(client).status_code == 200
    assert event_types(client).count("app_access_granted") == 1


def test_signed_out_visitors_are_always_shown_the_consent_step():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    enroll_user(client)
    allow_app(client)
    client.post("/api/auth/sessions/logout")

    assert consent_required(client) is True
    assert sent_to_consent_page(authorize(client))


def test_consent_request_is_validated():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)

    signed_out = allow_app(client)
    assert signed_out.status_code == 401

    enroll_user(client)
    unknown_app = client.post(
        "/oauth/authorize/consent",
        json={"client_id": "nobody", "redirect_uri": REDIRECT_URI, "scope": "openid"},
    )
    assert unknown_app.status_code == 400
    foreign_redirect = client.post(
        "/oauth/authorize/consent",
        json={"client_id": CLIENT_ID, "redirect_uri": "http://evil.example/callback", "scope": "openid"},
    )
    assert foreign_redirect.status_code == 400
    assert allow_app(client, "openid offline_access").status_code == 400
    assert allow_app(client, "email").status_code == 400
    assert client.get("/api/apps/connected").json() == []


def test_asking_for_more_than_was_agreed_asks_again():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    enroll_user(client)

    allow_app(client, "openid email")
    assert issued_code(authorize(client, "openid email"))
    assert issued_code(authorize(client, "openid"))
    assert consent_required(client, "openid email phone") is True
    assert sent_to_consent_page(authorize(client, "openid email phone"))

    allow_app(client, "openid email phone")
    assert issued_code(authorize(client, "openid email phone"))
    assert client.get("/api/apps/connected").json()[0]["scopes"] == ["openid", "email", "phone"]


def test_consent_belongs_to_one_account():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    enroll_user(client)
    allow_app(client)
    client.post("/api/auth/sessions/logout")

    enroll_user(client, email="second@example.com")
    assert client.get("/api/apps/connected").json() == []
    assert sent_to_consent_page(authorize(client))


# ###############################################
# Connected App Tests
# ###############################################

def test_connected_apps_lists_what_each_app_can_see():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    enroll_user(client)
    assert client.get("/api/apps/connected").json() == []

    allow_app(client)
    listed = client.get("/api/apps/connected").json()
    assert len(listed) == 1
    assert listed[0]["client_id"] == CLIENT_ID
    assert listed[0]["name"] == "Media Editor Dev"
    assert listed[0]["scopes"] == ["openid", "email", "profile"]
    assert listed[0]["granted_at"]
    # Agreed to, but the app has not been opened yet.
    assert listed[0]["last_used_at"] is None

    issue_oidc_token(client)
    assert client.get("/api/apps/connected").json()[0]["last_used_at"]


def test_connected_apps_requires_a_session():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)

    assert client.get("/api/apps/connected").status_code == 401
    assert client.delete(f"/api/apps/connected/{CLIENT_ID}").status_code == 401


def test_removing_access_cuts_the_app_off_and_asks_again_next_time():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    enroll_user(client)
    token, _ = issue_oidc_token(client)
    bearer = {"Authorization": f"Bearer {token['access_token']}"}
    assert client.get("/oauth/userinfo", headers=bearer).status_code == 200

    removed = client.delete(f"/api/apps/connected/{CLIENT_ID}")
    assert removed.status_code == 200
    assert client.get("/api/apps/connected").json() == []
    assert client.get("/oauth/userinfo", headers=bearer).status_code == 401
    assert sent_to_consent_page(authorize(client))
    assert "app_access_removed" in event_types(client)

    assert client.delete(f"/api/apps/connected/{CLIENT_ID}").status_code == 404
    assert client.delete("/api/apps/connected/nobody").status_code == 404


def test_a_code_issued_before_removal_cannot_be_exchanged():
    client, SessionLocal = make_client()
    seed_oidc_client(SessionLocal)
    enroll_user(client)
    allow_app(client)
    code = issued_code(authorize(client))
    assert code

    assert client.delete(f"/api/apps/connected/{CLIENT_ID}").status_code == 200
    exchange = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": CLIENT_ID,
            "code_verifier": VERIFIER,
        },
    )
    assert exchange.status_code == 400
