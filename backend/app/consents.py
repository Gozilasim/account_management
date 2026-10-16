# Created at: 2026-10-11 12:12
# Updated at: 2026-10-11 12:12
# Description: Records which apps a person has allowed to use their account, and removes that access again.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AccessToken, AppConsent, AuthorizationCode, OidcClient, User, utcnow


# ###############################################
# Lookups
# ###############################################

def find_consent(db: Session, user: User, client: OidcClient) -> AppConsent | None:
    return db.scalar(select(AppConsent).where(AppConsent.user_id == user.id, AppConsent.client_id == client.id))


def consent_covers(consent: AppConsent | None, scope: str) -> bool:
    """True when every requested scope was already agreed to. A wider request has to be asked again."""
    return consent is not None and set(scope.split()).issubset(set(consent.scopes or []))


def list_consents(db: Session, user: User) -> list[AppConsent]:
    return list(db.scalars(select(AppConsent).where(AppConsent.user_id == user.id)))


# ###############################################
# Changes
# ###############################################

def grant_consent(db: Session, user: User, client: OidcClient, scope: str) -> bool:
    """Saves the agreement and returns True when it gave the app something new. The caller commits."""
    requested = [item for item in scope.split() if item]
    consent = find_consent(db, user, client)
    if consent is None:
        db.add(AppConsent(user_id=user.id, client_id=client.id, scopes=requested))
        return True

    known = list(consent.scopes or [])
    added = [item for item in requested if item not in known]
    if added:
        # A new list is assigned so the JSON column is seen as changed.
        consent.scopes = known + added
    return bool(added)


def mark_consent_used(consent: AppConsent) -> None:
    consent.last_used_at = utcnow()


def revoke_consent(db: Session, user: User, client: OidcClient) -> bool:
    """Forgets the agreement and cuts off what the app already holds. The caller commits."""
    consent = find_consent(db, user, client)
    if consent is None:
        return False
    db.delete(consent)

    now = utcnow()
    tokens = db.scalars(
        select(AccessToken).where(
            AccessToken.user_id == user.id,
            AccessToken.client_id == client.id,
            AccessToken.revoked_at.is_(None),
        )
    )
    for token in tokens:
        token.revoked_at = now

    # A code that was handed out but not yet exchanged must not turn into a new token.
    pending_codes = db.scalars(
        select(AuthorizationCode).where(
            AuthorizationCode.user_id == user.id,
            AuthorizationCode.client_id == client.id,
            AuthorizationCode.used_at.is_(None),
        )
    )
    for code in pending_codes:
        code.used_at = now
    return True
