"""group files

Revision ID: e448efef134b
Revises: ffac2f085936
Create Date: 2026-09-21 20:12:01.451146

Files become personal (owner only) or group-scoped: group_id set means every
member of that group can preview the blob. Hand-written: autogenerate wanted to
drop and recreate every schema-qualified foreign key in the database.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e448efef134b"
down_revision: str | Sequence[str] | None = "ffac2f085936"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("files", sa.Column("group_id", sa.Uuid(), nullable=True), schema="public")
    op.create_index(op.f("ix_public_files_group_id"), "files", ["group_id"], unique=False, schema="public")
    op.create_foreign_key(
        "files_group_id_fkey",
        "files",
        "groups",
        ["group_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("files_group_id_fkey", "files", schema="public", type_="foreignkey")
    op.drop_index(op.f("ix_public_files_group_id"), table_name="files", schema="public")
    op.drop_column("files", "group_id", schema="public")
