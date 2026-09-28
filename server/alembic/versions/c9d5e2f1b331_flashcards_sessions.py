"""flashcards and study sessions

Revision ID: c9d5e2f1b331
Revises: b7c4d1e8a220
Create Date: 2026-09-28 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d5e2f1b331"
down_revision: str | Sequence[str] | None = "b7c4d1e8a220"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "flashcards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("note_id", sa.Uuid(), nullable=False),
        sa.Column("front", sa.String(length=1000), nullable=False),
        sa.Column("back", sa.String(length=2000), nullable=False),
        sa.Column("source_highlight_id", sa.String(length=64), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval_days", sa.Float(), nullable=False),
        sa.Column("ease", sa.Float(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("lapses", sa.Integer(), nullable=False),
        sa.Column("suspended", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["public.notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["public.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index(
        op.f("ix_public_flashcards_owner_id"), "flashcards", ["owner_id"], unique=False, schema="public"
    )
    op.create_index(
        op.f("ix_public_flashcards_note_id"), "flashcards", ["note_id"], unique=False, schema="public"
    )
    op.create_index(
        "ix_flashcards_owner_due", "flashcards", ["owner_id", "due_at"], unique=False, schema="public"
    )
    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("note_id", sa.Uuid(), nullable=True),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("seconds", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["public.notes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_id"], ["public.subjects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["public.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index(
        op.f("ix_public_study_sessions_user_id"), "study_sessions", ["user_id"], unique=False, schema="public"
    )
    op.create_index(
        op.f("ix_public_study_sessions_note_id"), "study_sessions", ["note_id"], unique=False, schema="public"
    )
    op.create_index(
        op.f("ix_public_study_sessions_subject_id"),
        "study_sessions",
        ["subject_id"],
        unique=False,
        schema="public",
    )
    op.create_index(
        "ix_study_sessions_user_started",
        "study_sessions",
        ["user_id", "started_at"],
        unique=False,
        schema="public",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_study_sessions_user_started", table_name="study_sessions", schema="public")
    op.drop_index(op.f("ix_public_study_sessions_subject_id"), table_name="study_sessions", schema="public")
    op.drop_index(op.f("ix_public_study_sessions_note_id"), table_name="study_sessions", schema="public")
    op.drop_index(op.f("ix_public_study_sessions_user_id"), table_name="study_sessions", schema="public")
    op.drop_table("study_sessions", schema="public")
    op.drop_index("ix_flashcards_owner_due", table_name="flashcards", schema="public")
    op.drop_index(op.f("ix_public_flashcards_note_id"), table_name="flashcards", schema="public")
    op.drop_index(op.f("ix_public_flashcards_owner_id"), table_name="flashcards", schema="public")
    op.drop_table("flashcards", schema="public")
