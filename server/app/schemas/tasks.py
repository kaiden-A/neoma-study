from pydantic import BaseModel, Field

from ..models.enums import TaskPriority, TaskStatus


class SubtaskOut(BaseModel):
    id: str
    title: str
    done: bool


class TaskLinkOut(BaseModel):
    id: str
    label: str
    url: str


class TaskOut(BaseModel):
    id: str
    groupId: str | None
    title: str
    description: str
    dueAt: int | None
    status: TaskStatus
    priority: TaskPriority
    createdBy: str | None
    completedAt: int | None
    createdAt: int
    updatedAt: int
    assigneeIds: list[str]
    subtasks: list[SubtaskOut]
    links: list[TaskLinkOut]


class SubtaskIn(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=300)
    done: bool = False


class TaskLinkIn(BaseModel):
    id: str | None = None
    label: str = Field(default="", max_length=160)
    url: str = Field(min_length=1, max_length=1000)


class TaskCreate(BaseModel):
    groupId: str | None = None
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=20000)
    dueAt: int | None = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.med
    assigneeIds: list[str] = Field(default_factory=list, max_length=100)
    subtasks: list[SubtaskIn] = Field(default_factory=list, max_length=100)
    links: list[TaskLinkIn] = Field(default_factory=list, max_length=50)


class TaskPatch(BaseModel):
    groupId: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=20000)
    dueAt: int | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    assigneeIds: list[str] | None = Field(default=None, max_length=100)
    subtasks: list[SubtaskIn] | None = Field(default=None, max_length=100)
    links: list[TaskLinkIn] | None = Field(default=None, max_length=50)


class PostponeRequest(BaseModel):
    # The client sends its UTC offset so "tomorrow 09:00" means local morning.
    timezoneOffsetMinutes: int = 0
