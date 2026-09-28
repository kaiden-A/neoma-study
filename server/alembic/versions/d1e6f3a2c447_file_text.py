"""file text extraction

Revision ID: d1e6f3a2c447
Revises: c9d5e2f1b331
Create Date: 2026-09-28 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e6f3a2c447"
down_revision: str | Sequence[str] | None = "c9d5e2f1b331"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("files", sa.Column("extracted_text", sa.Text(), nullable=True), schema="public")
    op.add_column(
        "files", sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=True), schema="public"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("files", "extracted_at", schema="public")
    op.drop_column("files", "extracted_text", schema="public")
