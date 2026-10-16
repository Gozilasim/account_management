# Created at: 2026-10-11 11:37
# Updated at: 2026-10-11 11:37
# Description: Add backup codes and the recovery email columns used for account recovery.

"""account recovery

Revision ID: 0007_account_recovery
Revises: 0006_auth_throttles
Create Date: 2026-10-11
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# ###############################################
# Alembic Identifiers
# ###############################################

revision = "0007_account_recovery"
down_revision = "0006_auth_throttles"
branch_labels = None
depends_on = None


# ###############################################
# Upgrade
# ###############################################

def upgrade() -> None:
    op.add_column("users", sa.Column("recovery_email", sa.String(length=320), nullable=True))
    op.add_column("users", sa.Column("recovery_email_verified_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "backup_codes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_backup_codes_user_id", "backup_codes", ["user_id"])


# ###############################################
# Downgrade
# ###############################################

def downgrade() -> None:
    op.drop_index("ix_backup_codes_user_id", table_name="backup_codes")
    op.drop_table("backup_codes")
    op.drop_column("users", "recovery_email_verified_at")
    op.drop_column("users", "recovery_email")
