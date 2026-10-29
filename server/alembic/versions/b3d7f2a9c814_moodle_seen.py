"""italeem notification seen state

Revision ID: b3d7f2a9c814
Revises: f1a9c3d5e720
Create Date: 2026-10-29 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b3d7f2a9c814"
down_revision: str | Sequence[str] | None = "f1a9c3d5e720"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "moodle_accounts",
        sa.Column(
            "seen",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("moodle_accounts", "seen", schema="public")
