"""italeem submission status timestamp

Revision ID: f1a9c3d5e720
Revises: e8c1a5b7d240
Create Date: 2026-10-28 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1a9c3d5e720"
down_revision: str | Sequence[str] | None = "e8c1a5b7d240"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "moodle_assignments",
        sa.Column("status_at", sa.DateTime(timezone=True), nullable=True),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("moodle_assignments", "status_at", schema="public")
