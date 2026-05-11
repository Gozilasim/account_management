# Created at: 2026-05-12 00:31
# Updated at: 2026-05-12 00:31
# Description: Add extended profile, session device/IP, and security event schema.

"""profile sessions security events

Revision ID: 0002_profile_sessions_security_events
Revises: 0001_initial
Create Date: 2026-05-12
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# ###############################################
# Alembic Identifiers
# ###############################################

revision = "0002_profile_sessions_security_events"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


# ###############################################
# Upgrade
# ###############################################

def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(length=80), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=80), nullable=True))
    op.add_column("users", sa.Column("phone_number", sa.String(length=40), nullable=True))
    op.add_column("users", sa.Column("phone_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("gender", sa.String(length=30), nullable=True))
    op.add_column("users", sa.Column("gender_custom", sa.String(length=80), nullable=True))
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("locale", sa.String(length=35), nullable=True))
    op.add_column("users", sa.Column("timezone", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("profile_onboarding_skipped_fields", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("profile_onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("sessions", sa.Column("login_ip_address", sa.String(length=45), nullable=True))
    op.add_column("sessions", sa.Column("last_seen_ip_address", sa.String(length=45), nullable=True))
    op.add_column("sessions", sa.Column("user_agent", sa.Text(), nullable=True))
    op.add_column("sessions", sa.Column("device_label", sa.String(length=120), nullable=True))

    op.create_table(
        "security_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_label", sa.String(length=120), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_security_events_user_id", "security_events", ["user_id"])


# ###############################################
# Downgrade
# ###############################################

def downgrade() -> None:
    op.drop_index("ix_security_events_user_id", table_name="security_events")
    op.drop_table("security_events")

    op.drop_column("sessions", "device_label")
    op.drop_column("sessions", "user_agent")
    op.drop_column("sessions", "last_seen_ip_address")
    op.drop_column("sessions", "login_ip_address")

    op.drop_column("users", "profile_onboarding_completed_at")
    op.drop_column("users", "profile_onboarding_skipped_fields")
    op.drop_column("users", "timezone")
    op.drop_column("users", "locale")
    op.drop_column("users", "date_of_birth")
    op.drop_column("users", "gender_custom")
    op.drop_column("users", "gender")
    op.drop_column("users", "phone_verified")
    op.drop_column("users", "phone_number")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
