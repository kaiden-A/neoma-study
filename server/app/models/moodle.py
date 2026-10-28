"""iTa'leem (IIUM Moodle) mirror.

The account row holds the encrypted mobile-service token; courses cache the
Moodle side (including the lazily fetched outline) and assignments link a
Moodle assignment to the Neoma task it produced. Everything is owner-scoped:
the token never leaves the server and the mirror is rebuilt from the user's own
web-service token.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from .users import utcnow


class MoodleAccount(Base):
    """One iTa'leem connection per user. The token is Fernet-encrypted."""

    __tablename__ = "moodle_accounts"
    __table_args__ = (UniqueConstraint("user_id", name="uq_moodle_accounts_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    wwwroot: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    moodle_user_id: Mapped[int | None] = mapped_column(Integer)
    username: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    release: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    # Function names returned by core_webservice_get_site_info, so a missing
    # feature can hide instead of failing mid-sync.
    functions: Mapped[list] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    # UIDs the user deliberately deleted; a sync must not resurrect them.
    ignored_uids: Mapped[list] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class MoodleCourse(Base):
    """A Moodle course, mirrored for one user, with its lazily cached outline."""

    __tablename__ = "moodle_courses"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_moodle_courses_user_course"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    course_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    shortname: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    fullname: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    category: Mapped[int | None] = mapped_column(Integer)
    progress: Mapped[int | None] = mapped_column(Integer)
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("subjects.id", ondelete="SET NULL"), index=True
    )
    # True once a vault folder was made, so deleting it is not undone on sync.
    folder_created: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # core_course_get_contents output, kept as returned (snake_case).
    outline: Mapped[list] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    outline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Compact gradereport_user_get_grade_items rows.
    grades: Mapped[list] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    grades_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class MoodleAssignment(Base):
    """A Moodle assignment and the Neoma task it produced."""

    __tablename__ = "moodle_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "assign_id", name="uq_moodle_assignments_user_assign"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("moodle_courses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    assign_id: Mapped[int] = mapped_column(Integer, nullable=False)
    cmid: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    name: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cutoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    intro: Mapped[str] = mapped_column(Text, default="", nullable=False)
    submission_status: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grade: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    grade_max: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    timemodified: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
