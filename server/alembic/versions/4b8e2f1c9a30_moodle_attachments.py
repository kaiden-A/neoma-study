"""italeem assignment attachments and forum post ids

Revision ID: 4b8e2f1c9a30
Revises: 7a4c2e9b1f30
Create Date: 2026-11-03 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "4b8e2f1c9a30"
down_revision: str | Sequence[str] | None = "7a4c2e9b1f30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "moodle_assignments",
        sa.Column(
            "attachments",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        schema="public",
    )
    # The mirror stored a first-post id under `discussion_id`; post_id is the
    # stable identity, discussion_id becomes the real thread id.
    op.alter_column(
        "moodle_announcements",
        "discussion_id",
        new_column_name="post_id",
        schema="public",
    )
    op.add_column(
        "moodle_announcements",
        sa.Column("discussion_id", sa.BigInteger(), nullable=True),
        schema="public",
    )
    op.execute(
        "ALTER TABLE public.moodle_announcements "
        "RENAME CONSTRAINT uq_moodle_announcements_user_discussion "
        "TO uq_moodle_announcements_user_post"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE public.moodle_announcements "
        "RENAME CONSTRAINT uq_moodle_announcements_user_post "
        "TO uq_moodle_announcements_user_discussion"
    )
    op.drop_column("moodle_announcements", "discussion_id", schema="public")
    op.alter_column(
        "moodle_announcements",
        "post_id",
        new_column_name="discussion_id",
        schema="public",
    )
    op.drop_column("moodle_assignments", "attachments", schema="public")
