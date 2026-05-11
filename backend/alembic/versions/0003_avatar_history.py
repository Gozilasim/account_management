# Created at: 2026-05-12 02:17
# Updated at: 2026-05-12 02:17
# Description: Add JSON avatar history storage to users.

"""avatar history

Revision ID: 0003_avatar_history
Revises: 0002_profile_sessions_security_events
Create Date: 2026-05-12
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# ###############################################
# Alembic Identifiers
# ###############################################

revision = "0003_avatar_history"
down_revision = "0002_profile_sessions_security_events"
branch_labels = None
depends_on = None


# ###############################################
# Upgrade
# ###############################################

def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_history", sa.JSON(), nullable=True))


# ###############################################
# Downgrade
# ###############################################

def downgrade() -> None:
    op.drop_column("users", "avatar_history")
