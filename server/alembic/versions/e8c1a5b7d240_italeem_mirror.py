"""italeem mirror

Revision ID: e8c1a5b7d240
Revises: a4f6b8c0d2e4
Create Date: 2026-10-28 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e8c1a5b7d240"
down_revision: str | Sequence[str] | None = "a4f6b8c0d2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "moodle_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("wwwroot", sa.String(length=200), nullable=False),
        sa.Column("token_enc", sa.Text(), nullable=False),
        sa.Column("moodle_user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("release", sa.String(length=80), nullable=False),
        sa.Column(
            "functions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "ignored_uids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_moodle_accounts_user_id"),
        schema="public",
    )
    op.create_index("ix_moodle_accounts_user_id", "moodle_accounts", ["user_id"], schema="public")

    op.create_table(
        "moodle_courses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("shortname", sa.String(length=120), nullable=False),
        sa.Column("fullname", sa.String(length=300), nullable=False),
        sa.Column("category", sa.Integer(), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column("folder_created", sa.Boolean(), nullable=False),
        sa.Column(
            "outline",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("outline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "grades",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("grades_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "course_id", name="uq_moodle_courses_user_course"),
        schema="public",
    )
    op.create_index("ix_moodle_courses_user_id", "moodle_courses", ["user_id"], schema="public")
    op.create_index("ix_moodle_courses_course_id", "moodle_courses", ["course_id"], schema="public")
    op.create_index("ix_moodle_courses_subject_id", "moodle_courses", ["subject_id"], schema="public")

    op.add_column("tasks", sa.Column("external_uid", sa.String(length=200), nullable=True))
    op.add_column("tasks", sa.Column("course_id", sa.Uuid(), nullable=True))
    op.create_index("ix_tasks_external_uid", "tasks", ["external_uid"], schema="public")
    op.create_index("ix_tasks_course_id", "tasks", ["course_id"], schema="public")
    op.create_foreign_key(
        "fk_tasks_course_id_moodle_courses",
        "tasks",
        "moodle_courses",
        ["course_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_tasks_owner_external_uid", "tasks", ["owner_id", "external_uid"], schema="public"
    )

    op.create_table(
        "moodle_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("assign_id", sa.Integer(), nullable=False),
        sa.Column("cmid", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cutoff_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("intro", sa.Text(), nullable=False),
        sa.Column("submission_status", sa.String(length=40), nullable=False),
        sa.Column("grade", sa.String(length=50), nullable=False),
        sa.Column("grade_max", sa.String(length=50), nullable=False),
        sa.Column("timemodified", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["moodle_courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "assign_id", name="uq_moodle_assignments_user_assign"),
        schema="public",
    )
    op.create_index("ix_moodle_assignments_user_id", "moodle_assignments", ["user_id"], schema="public")
    op.create_index(
        "ix_moodle_assignments_course_id", "moodle_assignments", ["course_id"], schema="public"
    )
    op.create_index("ix_moodle_assignments_task_id", "moodle_assignments", ["task_id"], schema="public")

    op.add_column("notes", sa.Column("external_uid", sa.String(length=200), nullable=True))
    op.create_index("ix_notes_external_uid", "notes", ["external_uid"], schema="public")
    op.create_unique_constraint(
        "uq_notes_owner_external_uid", "notes", ["owner_id", "external_uid"], schema="public"
    )


def downgrade() -> None:
    op.drop_constraint("uq_notes_owner_external_uid", "notes", type_="unique", schema="public")
    op.drop_index("ix_notes_external_uid", table_name="notes", schema="public")
    op.drop_column("notes", "external_uid")

    op.drop_index("ix_moodle_assignments_task_id", table_name="moodle_assignments", schema="public")
    op.drop_index("ix_moodle_assignments_course_id", table_name="moodle_assignments", schema="public")
    op.drop_index("ix_moodle_assignments_user_id", table_name="moodle_assignments", schema="public")
    op.drop_table("moodle_assignments", schema="public")

    op.drop_constraint("uq_tasks_owner_external_uid", "tasks", type_="unique", schema="public")
    op.drop_constraint("fk_tasks_course_id_moodle_courses", "tasks", type_="foreignkey", schema="public")
    op.drop_index("ix_tasks_course_id", table_name="tasks", schema="public")
    op.drop_index("ix_tasks_external_uid", table_name="tasks", schema="public")
    op.drop_column("tasks", "course_id")
    op.drop_column("tasks", "external_uid")

    op.drop_index("ix_moodle_courses_subject_id", table_name="moodle_courses", schema="public")
    op.drop_index("ix_moodle_courses_course_id", table_name="moodle_courses", schema="public")
    op.drop_index("ix_moodle_courses_user_id", table_name="moodle_courses", schema="public")
    op.drop_table("moodle_courses", schema="public")

    op.drop_index("ix_moodle_accounts_user_id", table_name="moodle_accounts", schema="public")
    op.drop_table("moodle_accounts", schema="public")
