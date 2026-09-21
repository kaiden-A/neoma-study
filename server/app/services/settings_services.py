"""User preferences. Stored as JSONB on users; validated here on every touch."""

from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..models import User
from .errors import InvalidError

LEAD_TIME_OPTIONS = (6, 12, 24, 48, 96, 168)


class NotificationKinds(BaseModel):
    overdue: bool = True
    dueSoon: bool = True
    assigned: bool = True
    sessions: bool = True
    exams: bool = True
    notes: bool = True


class GoogleSettings(BaseModel):
    status: Literal["connected", "disconnected"] = "disconnected"
    email: str | None = None
    lastSyncAt: int | None = None
    calendar: str = ""


class ElpisSettings(BaseModel):
    url: str = "http://localhost:8000/mcp"
    enabled: bool = False
    token: str = ""


class UserSettings(BaseModel):
    theme: Literal["light", "dark"] = "light"
    leadTimeHours: int = 48
    browserNotifications: bool = False
    kinds: NotificationKinds = Field(default_factory=NotificationKinds)
    google: GoogleSettings = Field(default_factory=GoogleSettings)
    elpis: ElpisSettings = Field(default_factory=ElpisSettings)
    syncLog: list[str] = Field(default_factory=list)


class UserSettingsPatch(BaseModel):
    """Every field optional; only what the client sent is applied."""

    theme: Literal["light", "dark"] | None = None
    leadTimeHours: int | None = None
    browserNotifications: bool | None = None
    kinds: NotificationKinds | None = None
    google: GoogleSettings | None = None
    elpis: ElpisSettings | None = None
    syncLog: list[str] | None = None


def read_settings(user: User) -> UserSettings:
    return UserSettings.model_validate(user.settings or {})


def write_settings(db: DbSession, user: User, settings: UserSettings) -> UserSettings:
    user.settings = settings.model_dump(mode="json")
    db.commit()
    return settings


def update_settings(db: DbSession, user: User, patch: UserSettingsPatch) -> UserSettings:
    current = read_settings(user).model_dump(mode="json")
    incoming = patch.model_dump(mode="json", exclude_unset=True, exclude_none=True)
    for key, value in incoming.items():
        if isinstance(value, dict):
            current[key] = {**current.get(key, {}), **value}
        else:
            current[key] = value
    try:
        settings = UserSettings.model_validate(current)
    except ValueError as exc:
        raise InvalidError("Those settings are not valid.") from exc
    if settings.leadTimeHours not in LEAD_TIME_OPTIONS:
        raise InvalidError("Pick a reminder window from the list.")
    return write_settings(db, user, settings)
