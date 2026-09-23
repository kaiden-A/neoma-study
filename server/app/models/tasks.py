import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from .enums import TaskPriority, TaskStatus, enum_values
from .users import utcnow


class Task(Base):
    """A task belongs either to a person (owner_id, no group) or to a group.

    Personal tasks are the prototype's to-dos: `groupId: null`. Group tasks are
    reachable by every member; `created_by` is attribution only.
    """

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "(owner_id IS NULL) <> (group_id IS NULL)",
            name="ck_tasks_owner_xor_group",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status", values_callable=enum_values),
        default=TaskStatus.todo,
        nullable=False,
        index=True,
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, name="task_priority", values_callable=enum_values),
        default=TaskPriority.med,
        nullable=False,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Google twin for two-way sync; the account is the organizer that owns it.
    google_event_id: Mapped[str | None] = mapped_column(String(200), unique=True, index=True)
    google_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("google_accounts.id", ondelete="SET NULL")
    )
    reminder_minutes: Mapped[int] = mapped_column(Integer, default=60, server_default="60", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    assignees: Mapped[list["TaskAssignee"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )
    subtasks: Mapped[list["TaskSubtask"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )
    links: Mapped[list["TaskLink"]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )


class TaskAssignee(Base):
    __tablename__ = "task_assignees"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_task_assignees_task_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    task: Mapped[Task] = relationship(back_populates="assignees")


class TaskSubtask(Base):
    __tablename__ = "task_subtasks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    task: Mapped[Task] = relationship(back_populates="subtasks")


class TaskLink(Base):
    __tablename__ = "task_links"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    task: Mapped[Task] = relationship(back_populates="links")
