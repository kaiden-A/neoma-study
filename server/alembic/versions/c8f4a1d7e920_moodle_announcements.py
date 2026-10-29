"""italeem announcements mirror

Revision ID: c8f4a1d7e920
Revises: b3d7f2a9c814
Create Date: 2026-10-29 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c8f4a1d7e920"
down_revision: str | Sequence[str] | None = "b3d7f2a9c814"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "moodle_courses",
        sa.Column("announcements_at", sa.DateTime(timezone=True), nullable=True),
        schema="public",
    )
    op.create_table(
        "moodle_announcements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("forum_id", sa.Integer(), nullable=False),
        sa.Column("discussion_id", sa.BigInteger(), nullable=False),
        sa.Column("forum_name", sa.String(length=200), nullable=False),
        sa.Column("forum_type", sa.String(length=40), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author", sa.String(length=200), nullable=False),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("modified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replies", sa.Integer(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["moodle_courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "discussion_id", name="uq_moodle_announcements_user_discussion"),
        schema="public",
    )
    op.create_index(
        "ix_moodle_announcements_user_id",
        "moodle_announcements",
        ["user_id"],
        schema="public",
    )
    op.create_index(
        "ix_moodle_announcements_course_id",
        "moodle_announcements",
        ["course_id"],
        schema="public",
    )
    op.create_index(
        "ix_moodle_announcements_user_posted",
        "moodle_announcements",
        ["user_id", "posted_at"],
        schema="public",
    )
    op.create_index(
        "ix_moodle_announcements_course_posted",
        "moodle_announcements",
        ["course_id", "posted_at"],
        schema="public",
    )
    op.create_index(
        "ix_moodle_announcements_user_read",
        "moodle_announcements",
        ["user_id", "read_at"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_moodle_announcements_user_read",
        table_name="moodle_announcements",
        schema="public",
    )
    op.drop_index(
        "ix_moodle_announcements_course_posted",
        table_name="moodle_announcements",
        schema="public",
    )
    op.drop_index(
        "ix_moodle_announcements_user_posted",
        table_name="moodle_announcements",
        schema="public",
    )
    op.drop_index(
        "ix_moodle_announcements_course_id",
        table_name="moodle_announcements",
        schema="public",
    )
    op.drop_index(
        "ix_moodle_announcements_user_id",
        table_name="moodle_announcements",
        schema="public",
    )
    op.drop_table("moodle_announcements", schema="public")
    op.drop_column("moodle_courses", "announcements_at", schema="public")
