# Created at: 2026-05-16 17:43
# Updated at: 2026-05-16 17:43
# Description: Add launcher metadata fields to OIDC clients.

"""oidc launcher fields

Revision ID: 0004_oidc_launcher_fields
Revises: 0003_avatar_history
Create Date: 2026-05-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# ###############################################
# Alembic Identifiers
# ###############################################

revision = "0004_oidc_launcher_fields"
down_revision = "0003_avatar_history"
branch_labels = None
depends_on = None


# ###############################################
# Upgrade
# ###############################################

def upgrade() -> None:
    op.add_column("oidc_clients", sa.Column("home_url", sa.Text(), nullable=True))
    op.add_column("oidc_clients", sa.Column("icon_url", sa.Text(), nullable=True))
    op.add_column(
        "oidc_clients",
        sa.Column("launcher_visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


# ###############################################
# Downgrade
# ###############################################

def downgrade() -> None:
    op.drop_column("oidc_clients", "launcher_visible")
    op.drop_column("oidc_clients", "icon_url")
    op.drop_column("oidc_clients", "home_url")
