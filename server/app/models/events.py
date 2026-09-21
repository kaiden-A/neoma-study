import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from .enums import EventType, enum_values
from .users import utcnow


class Event(Base):
    """A calendar entry. Group events (group_id set) are visible to members."""

    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("groups.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    type: Mapped[EventType] = mapped_column(
        Enum(EventType, name="event_type", values_callable=enum_values),
        default=EventType.personal,
        nullable=False,
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    reminder_minutes: Mapped[int] = mapped_column(default=60, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
