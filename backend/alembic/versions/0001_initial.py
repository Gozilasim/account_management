# Created at: 2026-05-11 01:17
# Updated at: 2026-05-11 01:17
# Description: Initial database schema for users, sessions, OIDC, and MFA.

"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-11
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("avatar_public_id", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("mfa_secret", sa.String(length=64), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("mfa_enrolled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"], unique=True)

    op.create_table(
        "auth_challenges",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_challenges_user_id", "auth_challenges", ["user_id"])

    op.create_table(
        "oidc_clients",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("client_id", sa.String(length=120), nullable=False),
        sa.Column("client_secret_hash", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("redirect_uris", sa.JSON(), nullable=False),
        sa.Column("allowed_scopes", sa.JSON(), nullable=False),
        sa.Column("is_confidential", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_oidc_clients_client_id", "oidc_clients", ["client_id"], unique=True)

    op.create_table(
        "authorization_codes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=36), sa.ForeignKey("oidc_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("redirect_uri", sa.Text(), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("nonce", sa.String(length=255), nullable=True),
        sa.Column("code_challenge", sa.String(length=255), nullable=False),
        sa.Column("code_challenge_method", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_authorization_codes_code_hash", "authorization_codes", ["code_hash"], unique=True)

    op.create_table(
        "access_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=36), sa.ForeignKey("oidc_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_access_tokens_token_hash", "access_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_table("access_tokens")
    op.drop_table("authorization_codes")
    op.drop_table("oidc_clients")
    op.drop_table("auth_challenges")
    op.drop_table("sessions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
