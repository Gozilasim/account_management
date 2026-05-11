# Created at: 2026-05-12 02:42
# Updated at: 2026-05-12 02:42
# Description: OIDC integrated app parsing and database synchronization helpers.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import json
from dataclasses import dataclass
from json import JSONDecodeError
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OidcClient
from app.security import hash_password


# ###############################################
# Types And Constants
# ###############################################

DEFAULT_ALLOWED_SCOPES = ["openid", "email", "profile", "phone"]


class OidcClientConfigError(ValueError):
    """Raised when OIDC_CLIENTS_JSON cannot be parsed into valid clients."""


@dataclass(frozen=True)
class OidcClientDefinition:
    client_id: str
    name: str
    redirect_uris: list[str]
    allowed_scopes: list[str]
    public: bool


# ###############################################
# Parsing
# ###############################################

def parse_oidc_clients_json(raw_json: str | None) -> list[OidcClientDefinition]:
    if not raw_json or not raw_json.strip():
        return []

    try:
        payload = json.loads(raw_json)
    except JSONDecodeError as exc:
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON is not valid JSON: {exc.msg}") from exc

    if not isinstance(payload, list):
        raise OidcClientConfigError("OIDC_CLIENTS_JSON must be a JSON array.")

    return [_parse_client_item(item, index) for index, item in enumerate(payload)]


def _parse_client_item(item: Any, index: int) -> OidcClientDefinition:
    if not isinstance(item, dict):
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON[{index}] must be an object.")

    client_id = _required_string(item, "client_id", index, max_length=120)
    name = _required_string(item, "name", index, max_length=120)
    redirect_uris = _string_list(item.get("redirect_uris"), "redirect_uris", index, required=True)
    allowed_scopes = _string_list(
        item.get("allowed_scopes", DEFAULT_ALLOWED_SCOPES),
        "allowed_scopes",
        index,
        required=True,
    )
    if "openid" not in allowed_scopes:
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON[{index}].allowed_scopes must include openid.")

    public = item.get("public", True)
    if public is not True:
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON[{index}].public must be true for env-configured clients.")

    return OidcClientDefinition(
        client_id=client_id,
        name=name,
        redirect_uris=redirect_uris,
        allowed_scopes=allowed_scopes,
        public=True,
    )


def _required_string(item: dict[str, Any], field: str, index: int, max_length: int) -> str:
    value = item.get(field)
    if not isinstance(value, str) or not value.strip():
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON[{index}].{field} must be a non-empty string.")

    normalized = value.strip()
    if len(normalized) > max_length:
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON[{index}].{field} is too long.")
    return normalized


def _string_list(value: Any, field: str, index: int, required: bool) -> list[str]:
    if not isinstance(value, list):
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON[{index}].{field} must be a list of strings.")

    normalized: list[str] = []
    for item_index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            raise OidcClientConfigError(
                f"OIDC_CLIENTS_JSON[{index}].{field}[{item_index}] must be a non-empty string."
            )
        normalized.append(item.strip())

    if required and not normalized:
        raise OidcClientConfigError(f"OIDC_CLIENTS_JSON[{index}].{field} must not be empty.")
    return list(dict.fromkeys(normalized))


# ###############################################
# Database Synchronization
# ###############################################

def upsert_oidc_client(
    db: Session,
    *,
    client_id: str,
    name: str,
    redirect_uris: list[str],
    allowed_scopes: list[str],
    public: bool,
    client_secret: str | None = None,
) -> OidcClient:
    client = next(
        (
            item
            for item in db.new
            if isinstance(item, OidcClient) and item.client_id == client_id
        ),
        None,
    )
    if client is None:
        client = db.scalar(select(OidcClient).where(OidcClient.client_id == client_id))

    existing_secret_hash = client.client_secret_hash if client else None
    if client is None:
        client = OidcClient(client_id=client_id, name=name)
        db.add(client)

    if not public and not client_secret and not existing_secret_hash:
        raise OidcClientConfigError("Confidential OIDC clients require a client secret.")

    client.name = name
    client.redirect_uris = redirect_uris
    client.allowed_scopes = allowed_scopes
    client.is_confidential = not public
    client.is_active = True
    if public:
        client.client_secret_hash = None
    elif client_secret:
        client.client_secret_hash = hash_password(client_secret)

    return client


def sync_oidc_clients_from_json(db: Session, raw_json: str | None) -> int:
    definitions = parse_oidc_clients_json(raw_json)
    for definition in definitions:
        upsert_oidc_client(
            db,
            client_id=definition.client_id,
            name=definition.name,
            redirect_uris=definition.redirect_uris,
            allowed_scopes=definition.allowed_scopes,
            public=definition.public,
        )
    return len(definitions)


def sync_configured_oidc_clients() -> int:
    from app.config import settings
    from app.database import SessionLocal

    with SessionLocal() as db:
        synced_count = sync_oidc_clients_from_json(db, settings.oidc_clients_json)
        if synced_count:
            db.commit()
        return synced_count
