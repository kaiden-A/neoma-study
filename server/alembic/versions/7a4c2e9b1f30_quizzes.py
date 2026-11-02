"""quizzes and quiz attempts

Revision ID: 7a4c2e9b1f30
Revises: 94d323a0d272
Create Date: 2026-11-02 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7a4c2e9b1f30"
down_revision: str | Sequence[str] | None = "94d323a0d272"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "quizzes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("note_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("questions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["public.notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["public.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index(
        op.f("ix_public_quizzes_owner_id"), "quizzes", ["owner_id"], unique=False, schema="public"
    )
    op.create_index(op.f("ix_public_quizzes_note_id"), "quizzes", ["note_id"], unique=False, schema="public")
    op.create_index(
        "ix_quizzes_owner_note", "quizzes", ["owner_id", "note_id"], unique=False, schema="public"
    )

    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("quiz_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("objective_correct", sa.Integer(), nullable=False),
        sa.Column("objective_total", sa.Integer(), nullable=False),
        sa.Column("written_covered", sa.Integer(), nullable=False),
        sa.Column("written_total", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["public.users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quiz_id"], ["public.quizzes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index(
        op.f("ix_public_quiz_attempts_quiz_id"),
        "quiz_attempts",
        ["quiz_id"],
        unique=False,
        schema="public",
    )
    op.create_index(
        op.f("ix_public_quiz_attempts_owner_id"),
        "quiz_attempts",
        ["owner_id"],
        unique=False,
        schema="public",
    )
    op.create_index(
        "ix_quiz_attempts_quiz_created",
        "quiz_attempts",
        ["quiz_id", "created_at"],
        unique=False,
        schema="public",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_quiz_attempts_quiz_created", table_name="quiz_attempts", schema="public")
    op.drop_index(op.f("ix_public_quiz_attempts_owner_id"), table_name="quiz_attempts", schema="public")
    op.drop_index(op.f("ix_public_quiz_attempts_quiz_id"), table_name="quiz_attempts", schema="public")
    op.drop_table("quiz_attempts", schema="public")
    op.drop_index("ix_quizzes_owner_note", table_name="quizzes", schema="public")
    op.drop_index(op.f("ix_public_quizzes_note_id"), table_name="quizzes", schema="public")
    op.drop_index(op.f("ix_public_quizzes_owner_id"), table_name="quizzes", schema="public")
    op.drop_table("quizzes", schema="public")
