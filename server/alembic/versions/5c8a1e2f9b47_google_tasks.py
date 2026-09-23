"""google tasks

Revision ID: 5c8a1e2f9b47
Revises: 3f9d2c4b7a10
Create Date: 2026-09-23 13:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5c8a1e2f9b47"
down_revision: str | Sequence[str] | None = "3f9d2c4b7a10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("tasks", sa.Column("google_event_id", sa.String(length=200), nullable=True))
    op.add_column("tasks", sa.Column("google_account_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_google_account_id_google_accounts",
        "tasks",
        "google_accounts",
        ["google_account_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
        ondelete="SET NULL",
    )
    # server_default keeps the NOT NULL column safe on populated tables.
    op.add_column(
        "tasks",
        sa.Column("reminder_minutes", sa.Integer(), nullable=False, server_default="60"),
    )
    op.create_index(
        op.f("ix_public_tasks_google_event_id"),
        "tasks",
        ["google_event_id"],
        unique=True,
        schema="public",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_public_tasks_google_event_id"), table_name="tasks", schema="public")
    op.drop_column("tasks", "reminder_minutes")
    op.drop_constraint("fk_tasks_google_account_id_google_accounts", "tasks", type_="foreignkey")
    op.drop_column("tasks", "google_account_id")
    op.drop_column("tasks", "google_event_id")
