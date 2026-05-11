# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 00:31
# Description: CLI helper to create or update OIDC clients.

from __future__ import annotations

import argparse
import secrets

from sqlalchemy import select

from app.database import SessionLocal
from app.models import OidcClient
from app.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update an OIDC client.")
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--redirect-uri", action="append", required=True)
    parser.add_argument("--scope", action="append", default=["openid", "email", "profile", "phone"])
    parser.add_argument("--public", action="store_true", help="Create a public PKCE client without client_secret.")
    args = parser.parse_args()

    client_secret = None if args.public else secrets.token_urlsafe(32)
    with SessionLocal() as db:
        client = db.scalar(select(OidcClient).where(OidcClient.client_id == args.client_id))
        if client is None:
            client = OidcClient(client_id=args.client_id, name=args.name)
            db.add(client)

        client.name = args.name
        client.redirect_uris = args.redirect_uri
        client.allowed_scopes = args.scope
        client.is_confidential = not args.public
        if client_secret:
            client.client_secret_hash = hash_password(client_secret)
        elif args.public:
            client.client_secret_hash = None
        db.commit()

    print(f"client_id={args.client_id}")
    if client_secret:
        print(f"client_secret={client_secret}")
    else:
        print("public_client=true")


if __name__ == "__main__":
    main()
