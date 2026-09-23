"""google calendar

Revision ID: 3f9d2c4b7a10
Revises: e448efef134b
Create Date: 2026-09-23 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f9d2c4b7a10"
down_revision: str | Sequence[str] | None = "e448efef134b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "google_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("google_sub", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_token", sa.Text(), nullable=True),
        sa.Column("calendar_id", sa.String(length=200), nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["public.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_google_accounts_user_id"),
        schema="public",
    )
    op.create_index(
        op.f("ix_public_google_accounts_user_id"),
        "google_accounts",
        ["user_id"],
        unique=False,
        schema="public",
    )
    # Hand-reviewed: autogenerate churns the schema-qualified FKs above/below;
    # only these two real changes are kept.
    op.add_column("events", sa.Column("google_event_id", sa.String(length=200), nullable=True))
    op.create_index(
        op.f("ix_public_events_google_event_id"),
        "events",
        ["google_event_id"],
        unique=True,
        schema="public",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_public_events_google_event_id"), table_name="events", schema="public")
    op.drop_column("events", "google_event_id")
    op.drop_index(op.f("ix_public_google_accounts_user_id"), table_name="google_accounts", schema="public")
    op.drop_table("google_accounts", schema="public")
