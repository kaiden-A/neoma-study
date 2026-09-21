import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from .enums import NoteScope, NoteType, enum_values
from .users import utcnow


class Subject(Base):
    """A personal note folder ("subject" in the vault sidebar)."""

    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="amber", nullable=False)
    position: Mapped[int] = mapped_column(default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class FileObject(Base):
    """An uploaded blob in R2. Only the keys live in the database.

    A file is personal (owner only) or group-scoped: group_id set means every
    member of that group can preview it. Shared copies are separate rows and
    keys, so deleting either copy never affects the other.
    """

    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(512), nullable=False)
    thumb_key: Mapped[str | None] = mapped_column(String(512))
    name: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    content_type: Mapped[str] = mapped_column(String(160), default="application/octet-stream", nullable=False)
    size: Mapped[int] = mapped_column(default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Note(Base):
    """A personal note, or a note shared into a group (scope='group').

    Requests are group notes with type='request' and the request_* columns
    carrying the answer state; answering creates the answer note and closes
    the request in one service call.
    """

    __tablename__ = "notes"
    __table_args__ = (
        CheckConstraint(
            "(scope = 'personal' AND owner_id IS NOT NULL AND group_id IS NULL)"
            " OR (scope = 'group' AND group_id IS NOT NULL AND owner_id IS NULL)",
            name="ck_notes_scope_owner_group",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    scope: Mapped[NoteScope] = mapped_column(
        Enum(NoteScope, name="note_scope", values_callable=enum_values),
        default=NoteScope.personal,
        nullable=False,
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("subjects.id", ondelete="SET NULL"), index=True
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("group_topics.id", ondelete="SET NULL"), index=True
    )
    type: Mapped[NoteType] = mapped_column(
        Enum(NoteType, name="note_type", values_callable=enum_values),
        default=NoteType.note,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(300), default="Untitled", nullable=False)
    body: Mapped[str] = mapped_column(String(20000), default="", nullable=False)
    url: Mapped[str | None] = mapped_column(String(1000))
    file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("files.id", ondelete="SET NULL"))
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Request state (group notes with type='request' only).
    request_open: Mapped[bool | None] = mapped_column(Boolean, default=None)
    request_answered_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    request_answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    request_answer_note_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("notes.id", ondelete="SET NULL")
    )

    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
