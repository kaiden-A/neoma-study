from typing import Literal

from pydantic import BaseModel, Field

NotificationGroup = Literal["overdue", "due", "sessions", "assigned", "exams", "notes"]
NotificationTone = Literal["danger", "today", "muted"]


class NotificationOut(BaseModel):
    id: str
    group: NotificationGroup
    title: str
    body: str
    tone: NotificationTone
    icon: str
    at: int
    route: str
    read: bool
    snoozedUntil: int | None


class MarkReadRequest(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=500)


class SnoozeRequest(BaseModel):
    id: str
    minutes: int = Field(default=60, ge=5, le=10080)
