# Created at: 2026-10-11 11:23
# Updated at: 2026-10-11 11:23
# Description: Add the table that counts failed sign-in attempts and holds temporary lockouts.

"""auth throttles

Revision ID: 0006_auth_throttles
Revises: 0005_oidc_launcher_launch_url
Create Date: 2026-10-11
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# ###############################################
# Alembic Identifiers
# ###############################################

revision = "0006_auth_throttles"
down_revision = "0005_oidc_launcher_launch_url"
branch_labels = None
depends_on = None


# ###############################################
# Upgrade
# ###############################################

def upgrade() -> None:
    op.create_table(
        "auth_throttles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("subject", sa.String(length=64), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_throttles_subject", "auth_throttles", ["subject"], unique=True)


# ###############################################
# Downgrade
# ###############################################

def downgrade() -> None:
    op.drop_index("ix_auth_throttles_subject", table_name="auth_throttles")
    op.drop_table("auth_throttles")
