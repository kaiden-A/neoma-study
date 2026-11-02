import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models.enums import TaskPriority


class AiStatusOut(BaseModel):
    """What the client may know about the Elpis connection.

    No URL, key or agent id leaves the server; the client only needs to know
    which capabilities to show.
    """

    configured: bool
    refine: bool
    chat: bool


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatContextIn(BaseModel):
    noteId: str | None = None
    courseId: str | None = None
    scope: Literal["courses"] | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=20)
    context: ChatContextIn | None = None


class _PlanRef(BaseModel):
    """An optional pointer to a task the user already has."""

    taskId: str | None = None

    @field_validator("taskId", mode="before")
    @classmethod
    def _task_id(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip().strip('"').strip("'")
        for prefix in ("taskid=", "task_id=", "id="):
            if text.lower().startswith(prefix):
                text = text[len(prefix) :].strip()
                break
        if not text or text.lower() in {"null", "none"}:
            return None
        try:
            return str(uuid.UUID(text))
        except ValueError:
            # A model-written id that is not a UUID cannot point at a real row;
            # treat the item as a new task the user can uncheck.
            return None


class WeekPlanItem(_PlanRef):
    title: str = Field(min_length=1, max_length=300)
    dueAt: int | None = None
    time: str | None = None
    priority: TaskPriority = TaskPriority.med
    minutes: int = Field(default=30, ge=5, le=480)
    reason: str = Field(default="", max_length=500)
    tip: str = Field(default="", max_length=500)
    subtasks: list[Annotated[str, Field(min_length=1, max_length=300)]] = Field(
        default_factory=list, max_length=8
    )

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, value: object) -> str:
        return " ".join(str(value or "").split())[:300] or "Untitled block"

    @field_validator("time", mode="before")
    @classmethod
    def _time(cls, value: object) -> str | None:
        if value is None:
            return None
        match = re.match(r"^(\d{1,2}):(\d{2})$", str(value).strip())
        if match is None:
            return None
        hour, minute = int(match.group(1)), int(match.group(2))
        if not (0 <= hour < 24 and 0 <= minute < 60):
            return None
        return f"{hour:02d}:{minute:02d}"

    @field_validator("reason", "tip", mode="before")
    @classmethod
    def _clip(cls, value: object) -> str:
        return " ".join(str(value or "").split())[:500]

    @field_validator("subtasks", mode="before")
    @classmethod
    def _clip_subtasks(cls, value: object) -> list[str]:
        if not isinstance(value, (list, tuple)):
            return []
        return [" ".join(str(item).split())[:300] for item in value if str(item).strip()][:8]

    @field_validator("minutes", mode="before")
    @classmethod
    def _minutes(cls, value: object) -> int:
        try:
            minutes = int(float(str(value)))
        except (TypeError, ValueError):
            return 30
        return max(5, min(480, minutes))

    @field_validator("dueAt", mode="before")
    @classmethod
    def _due_at(cls, value: object) -> int | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return int(value)
        text = str(value).strip()
        if not text or text.lower() in {"null", "none"}:
            return None
        try:
            return int(float(text))
        except ValueError:
            pass
        try:
            return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            return None

    @field_validator("priority", mode="before")
    @classmethod
    def _priority(cls, value: object) -> str:
        text = str(value or "").strip().lower()
        if text not in {"low", "medium", "normal", "med", "high", "urgent"}:
            return "med"
        return {"medium": "med", "normal": "med", "urgent": "high"}.get(text, text)


class WeekPlanDay(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    label: str = Field(default="", max_length=40)
    items: list[WeekPlanItem] = Field(default_factory=list, max_length=20)

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, value: object) -> str:
        return " ".join(str(value or "").split())[:40]


class WeekPlanDeferred(_PlanRef):
    title: str = Field(min_length=1, max_length=300)
    reason: str = Field(default="", max_length=300)

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, value: object) -> str:
        return " ".join(str(value or "").split())[:300] or "Something to defer"

    @field_validator("reason", mode="before")
    @classmethod
    def _reason(cls, value: object) -> str:
        return " ".join(str(value or "").split())[:300]


class WeekPlan(BaseModel):
    """The model's proposed week; Neoma validates it before the dock renders it."""

    title: str = Field(default="This week", max_length=120)
    summary: str = Field(default="", max_length=800)
    days: list[WeekPlanDay] = Field(default_factory=list, max_length=7)
    deferred: list[WeekPlanDeferred] = Field(default_factory=list, max_length=10)

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, value: object) -> str:
        return " ".join(str(value or "").split())[:120] or "This week"

    @field_validator("summary", mode="before")
    @classmethod
    def _summary(cls, value: object) -> str:
        return " ".join(str(value or "").split())[:800]

    @model_validator(mode="after")
    def _limit_items(self) -> "WeekPlan":
        if sum(len(day.items) for day in self.days) > 20:
            raise ValueError("a week plan can carry at most 20 items")
        return self
