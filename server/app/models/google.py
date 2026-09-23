import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from .users import utcnow


class GoogleAccount(Base):
    """One connected Google Calendar per user. Tokens are encrypted at rest."""

    __tablename__ = "google_accounts"
    __table_args__ = (UniqueConstraint("user_id", name="uq_google_accounts_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    google_sub: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    access_token: Mapped[str | None] = mapped_column(Text)
    access_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Incremental pull cursor from events.list; null means "full sync next time".
    sync_token: Mapped[str | None] = mapped_column(Text)
    calendar_id: Mapped[str] = mapped_column(String(200), default="primary", nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
