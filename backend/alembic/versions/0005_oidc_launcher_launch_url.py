# Created at: 2026-05-17 02:58
# Updated at: 2026-05-17 02:58
# Description: Add launch URL metadata to OIDC clients for app launcher auto-login.

"""oidc launcher launch url

Revision ID: 0005_oidc_launcher_launch_url
Revises: 0004_oidc_launcher_fields
Create Date: 2026-05-17
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# ###############################################
# Alembic Identifiers
# ###############################################

revision = "0005_oidc_launcher_launch_url"
down_revision = "0004_oidc_launcher_fields"
branch_labels = None
depends_on = None


# ###############################################
# Upgrade
# ###############################################

def upgrade() -> None:
    op.add_column("oidc_clients", sa.Column("launch_url", sa.Text(), nullable=True))


# ###############################################
# Downgrade
# ###############################################

def downgrade() -> None:
    op.drop_column("oidc_clients", "launch_url")
