from pydantic import BaseModel, Field

from ..models.enums import EventType


class EventOut(BaseModel):
    id: str
    title: str
    type: EventType
    groupId: str | None
    startsAt: int
    endsAt: int | None
    location: str
    reminderMinutes: int
    notes: str
    createdBy: str | None
    createdAt: int
    updatedAt: int


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    type: EventType = EventType.personal
    groupId: str | None = None
    startsAt: int
    endsAt: int | None = None
    location: str = Field(default="", max_length=300)
    reminderMinutes: int = Field(default=60, ge=0, le=10080)
    notes: str = Field(default="", max_length=5000)


class EventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    type: EventType | None = None
    groupId: str | None = None
    startsAt: int | None = None
    endsAt: int | None = None
    location: str | None = Field(default=None, max_length=300)
    reminderMinutes: int | None = Field(default=None, ge=0, le=10080)
    notes: str | None = Field(default=None, max_length=5000)
