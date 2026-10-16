# Created at: 2026-10-11 12:15
# Updated at: 2026-10-11 12:15
# Description: Add app consent records and the time each password was last set.

"""app consents and password age

Revision ID: 0008_app_consents
Revises: 0007_account_recovery
Create Date: 2026-10-11
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


# ###############################################
# Alembic Identifiers
# ###############################################

revision = "0008_app_consents"
down_revision = "0007_account_recovery"
branch_labels = None
depends_on = None

PASSWORD_EVENTS = ("password_changed", "password_reset")


# ###############################################
# Upgrade
# ###############################################

def upgrade() -> None:
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "app_consents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(length=36), sa.ForeignKey("oidc_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "client_id", name="uq_app_consents_user_client"),
    )
    op.create_index("ix_app_consents_user_id", "app_consents", ["user_id"])

    connection = op.get_bind()
    backfill_password_changed_at(connection)
    backfill_consents(connection)


def backfill_password_changed_at(connection: sa.Connection) -> None:
    """A password was last set when it was last changed or reset, or else when the account was created."""
    users = sa.table("users", sa.column("id"), sa.column("created_at"), sa.column("password_changed_at"))
    events = sa.table("security_events", sa.column("user_id"), sa.column("event_type"), sa.column("created_at"))

    latest_change = dict(
        connection.execute(
            sa.select(events.c.user_id, sa.func.max(events.c.created_at))
            .where(events.c.event_type.in_(PASSWORD_EVENTS))
            .group_by(events.c.user_id)
        ).all()
    )
    for user_id, created_at in connection.execute(sa.select(users.c.id, users.c.created_at)).all():
        connection.execute(
            users.update().where(users.c.id == user_id).values(password_changed_at=latest_change.get(user_id) or created_at)
        )


def backfill_consents(connection: sa.Connection) -> None:
    """People who already signed in to an app keep that access instead of being asked again."""
    codes = sa.table(
        "authorization_codes",
        sa.column("user_id"),
        sa.column("client_id"),
        sa.column("scope"),
        sa.column("created_at"),
        sa.column("used_at"),
    )
    consents = sa.table(
        "app_consents",
        sa.column("id"),
        sa.column("user_id"),
        sa.column("client_id"),
        sa.column("scopes", sa.JSON()),
        sa.column("granted_at"),
        sa.column("last_used_at"),
    )

    grants: dict[tuple[str, str], dict] = {}
    rows = connection.execute(
        sa.select(codes.c.user_id, codes.c.client_id, codes.c.scope, codes.c.created_at)
        .where(codes.c.used_at.is_not(None))
        .order_by(codes.c.created_at.asc())
    ).all()
    for user_id, client_id, scope, created_at in rows:
        grant = grants.setdefault((user_id, client_id), {"scopes": [], "granted_at": created_at, "last_used_at": created_at})
        for item in (scope or "").split():
            if item not in grant["scopes"]:
                grant["scopes"].append(item)
        grant["last_used_at"] = created_at

    for (user_id, client_id), grant in grants.items():
        connection.execute(
            consents.insert().values(
                id=str(uuid.uuid4()),
                user_id=user_id,
                client_id=client_id,
                scopes=grant["scopes"],
                granted_at=grant["granted_at"],
                last_used_at=grant["last_used_at"],
            )
        )


# ###############################################
# Downgrade
# ###############################################

def downgrade() -> None:
    op.drop_index("ix_app_consents_user_id", table_name="app_consents")
    op.drop_table("app_consents")
    op.drop_column("users", "password_changed_at")
