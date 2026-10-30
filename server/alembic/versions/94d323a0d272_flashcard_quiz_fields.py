"""flashcard quiz fields

Revision ID: 94d323a0d272
Revises: c8f4a1d7e920
Create Date: 2026-10-30 15:04:50.976400

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "94d323a0d272"
down_revision: str | Sequence[str] | None = "c8f4a1d7e920"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "flashcards",
        sa.Column("kind", sa.String(length=16), server_default="basic", nullable=False),
        schema="public",
    )
    op.add_column(
        "flashcards",
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        schema="public",
    )
    op.add_column(
        "flashcards",
        sa.Column("answer_index", sa.Integer(), nullable=True),
        schema="public",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("flashcards", "answer_index", schema="public")
    op.drop_column("flashcards", "options", schema="public")
    op.drop_column("flashcards", "kind", schema="public")
