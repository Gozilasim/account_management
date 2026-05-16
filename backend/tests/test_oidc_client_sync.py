# Created at: 2026-05-12 02:42
# Updated at: 2026-05-17 02:58
# Description: Tests for OIDC integrated app synchronization and launcher visibility.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import json

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import create_app
from app.models import Base, OidcClient
from app.oidc_clients import OidcClientConfigError, parse_oidc_clients_json, sync_oidc_clients_from_json


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


def media_editor_client_json(redirect_uri: str = "http://localhost:3001/auth/callback") -> str:
    return json.dumps(
        [
            {
                "client_id": "media-editor-dev",
                "name": "Media Editor Dev",
                "home_url": "http://localhost:3001",
                "launch_url": "http://localhost:3001/auth/portal/start",
                "icon_url": "http://localhost:3001/favicon.png",
                "redirect_uris": [redirect_uri],
                "allowed_scopes": ["openid", "email", "profile", "phone"],
                "public": True,
                "launcher_visible": True,
            }
        ]
    )


def enroll_user(client: TestClient) -> None:
    setup = client.post(
        "/api/auth/register",
        json={"email": "launcher@example.com", "password": "password123", "display_name": "Launcher"},
    ).json()["mfa_setup"]
    code = pyotp.TOTP(setup["manual_entry_key"]).now()
    response = client.post(
        "/api/auth/mfa/setup/verify",
        json={"challenge_id": setup["challenge_id"], "code": code},
    )
    assert response.status_code == 200


# ###############################################
# Sync Tests
# ###############################################

def test_oidc_clients_json_sync_creates_public_client_and_allows_context_request():
    client, SessionLocal = make_client()

    with SessionLocal() as db:
        synced_count = sync_oidc_clients_from_json(db, media_editor_client_json())
        db.commit()
        oidc_client = db.scalar(select(OidcClient).where(OidcClient.client_id == "media-editor-dev"))

    assert synced_count == 1
    assert oidc_client is not None
    assert oidc_client.home_url == "http://localhost:3001"
    assert oidc_client.launch_url == "http://localhost:3001/auth/portal/start"
    assert oidc_client.icon_url == "http://localhost:3001/favicon.png"
    assert oidc_client.redirect_uris == ["http://localhost:3001/auth/callback"]
    assert oidc_client.allowed_scopes == ["openid", "email", "profile", "phone"]
    assert oidc_client.launcher_visible is True
    assert oidc_client.is_confidential is False
    assert oidc_client.client_secret_hash is None

    context = client.get(
        "/oauth/authorize/context",
        params={
            "client_id": "media-editor-dev",
            "redirect_uri": "http://localhost:3001/auth/callback",
            "scope": "openid email profile phone",
        },
    )
    bad_redirect = client.get(
        "/oauth/authorize/context",
        params={
            "client_id": "media-editor-dev",
            "redirect_uri": "http://localhost:3000/auth/callback",
            "scope": "openid email profile",
        },
    )
    bad_scope = client.get(
        "/oauth/authorize/context",
        params={
            "client_id": "media-editor-dev",
            "redirect_uri": "http://localhost:3001/auth/callback",
            "scope": "openid admin",
        },
    )

    assert context.status_code == 200
    assert context.json()["client_name"] == "Media Editor Dev"
    assert bad_redirect.status_code == 400
    assert bad_scope.status_code == 400


def test_oidc_clients_json_sync_updates_existing_client():
    _, SessionLocal = make_client()

    with SessionLocal() as db:
        sync_oidc_clients_from_json(db, media_editor_client_json("http://localhost:3000/auth/callback"))
        sync_oidc_clients_from_json(db, media_editor_client_json("http://localhost:3001/auth/callback"))
        db.commit()
        oidc_client = db.scalar(select(OidcClient).where(OidcClient.client_id == "media-editor-dev"))

    assert oidc_client is not None
    assert oidc_client.redirect_uris == ["http://localhost:3001/auth/callback"]


def test_oidc_clients_json_parse_supports_launcher_metadata():
    definitions = parse_oidc_clients_json(
        json.dumps(
            [
                {
                    "client_id": "hidden-app",
                    "name": "Hidden App",
                    "home_url": "https://hidden.example",
                    "launch_url": "https://hidden.example/auth/portal/start",
                    "icon_url": "https://hidden.example/icon.png",
                    "redirect_uris": ["https://hidden.example/auth/callback"],
                    "allowed_scopes": ["openid", "email"],
                    "public": True,
                    "launcher_visible": False,
                }
            ]
        )
    )

    assert definitions[0].home_url == "https://hidden.example"
    assert definitions[0].launch_url == "https://hidden.example/auth/portal/start"
    assert definitions[0].icon_url == "https://hidden.example/icon.png"
    assert definitions[0].launcher_visible is False


def test_launcher_apps_requires_login_and_returns_visible_active_apps():
    client, SessionLocal = make_client()

    with SessionLocal() as db:
        sync_oidc_clients_from_json(
            db,
            json.dumps(
                [
                    {
                        "client_id": "media-editor-dev",
                        "name": "Media Editor Dev",
                        "home_url": "http://localhost:3001",
                        "launch_url": "http://localhost:3001/auth/portal/start",
                        "icon_url": "http://localhost:3001/favicon.png",
                        "redirect_uris": ["http://localhost:3001/auth/callback"],
                        "allowed_scopes": ["openid", "email"],
                        "public": True,
                    },
                    {
                        "client_id": "hidden-app",
                        "name": "Hidden App",
                        "home_url": "http://localhost:3002",
                        "redirect_uris": ["http://localhost:3002/auth/callback"],
                        "allowed_scopes": ["openid"],
                        "public": True,
                        "launcher_visible": False,
                    },
                    {
                        "client_id": "no-home-app",
                        "name": "No Home App",
                        "redirect_uris": ["http://localhost:3003/auth/callback"],
                        "allowed_scopes": ["openid"],
                        "public": True,
                    },
                ]
            ),
        )
        inactive = OidcClient(
            client_id="inactive-app",
            name="Inactive App",
            home_url="http://localhost:3004",
            redirect_uris=["http://localhost:3004/auth/callback"],
            allowed_scopes=["openid"],
            is_active=False,
        )
        db.add(inactive)
        db.commit()

    unauthenticated = client.get("/api/apps/launcher")
    assert unauthenticated.status_code == 401

    enroll_user(client)
    response = client.get("/api/apps/launcher")

    assert response.status_code == 200
    assert response.json() == [
        {
            "client_id": "media-editor-dev",
            "name": "Media Editor Dev",
            "home_url": "http://localhost:3001",
            "launch_url": "http://localhost:3001/auth/portal/start",
            "icon_url": "http://localhost:3001/favicon.png",
        }
    ]


def test_oidc_clients_json_empty_config_is_noop():
    _, SessionLocal = make_client()

    with SessionLocal() as db:
        synced_count = sync_oidc_clients_from_json(db, "")
        clients = db.scalars(select(OidcClient)).all()

    assert synced_count == 0
    assert clients == []


def test_oidc_clients_json_invalid_config_fails_clearly():
    with pytest.raises(OidcClientConfigError, match="not valid JSON"):
        parse_oidc_clients_json("{bad-json")

    with pytest.raises(OidcClientConfigError, match="public must be true"):
        parse_oidc_clients_json(
            json.dumps(
                [
                    {
                        "client_id": "media-editor-dev",
                        "name": "Media Editor Dev",
                        "redirect_uris": ["http://localhost:3001/auth/callback"],
                        "allowed_scopes": ["openid", "email"],
                        "public": False,
                    }
                ]
            )
        )

    with pytest.raises(OidcClientConfigError, match="launcher_visible must be a boolean"):
        parse_oidc_clients_json(
            json.dumps(
                [
                    {
                        "client_id": "media-editor-dev",
                        "name": "Media Editor Dev",
                        "redirect_uris": ["http://localhost:3001/auth/callback"],
                        "allowed_scopes": ["openid", "email"],
                        "public": True,
                        "launcher_visible": "yes",
                    }
                ]
            )
        )
