"""note shares

Revision ID: a4f6b8c0d2e4
Revises: d1e6f3a2c447
Create Date: 2026-10-05 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4f6b8c0d2e4"
down_revision: str | Sequence[str] | None = "d1e6f3a2c447"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "note_shares",
        sa.Column("note_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["public.notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["public.users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("note_id"),
        schema="public",
    )
    op.create_index(
        op.f("ix_public_note_shares_token"), "note_shares", ["token"], unique=True, schema="public"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_public_note_shares_token"), table_name="note_shares", schema="public")
    op.drop_table("note_shares", schema="public")
