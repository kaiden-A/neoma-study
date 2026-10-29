"""iTa'leem API shapes (camelCase fields, ms timestamps)."""

import uuid

from pydantic import BaseModel, Field


class MoodleStatusOut(BaseModel):
    connected: bool
    username: str | None = None
    release: str | None = None
    lastSyncAt: int | None = None
    error: str | None = None
    courses: int = 0
    upcoming: int = 0


class MoodleConnectIn(BaseModel):
    link: str = Field(min_length=8, max_length=8000)


class MoodleSyncOut(BaseModel):
    courses: int = 0
    deadlines: int = 0
    events: int = 0


class MoodleConnectOut(BaseModel):
    status: MoodleStatusOut
    counts: MoodleSyncOut


class CourseOut(BaseModel):
    id: str
    moodleId: int
    shortname: str
    fullname: str
    color: str
    progress: int | None = None
    subjectId: str | None = None
    openDeadlines: int = 0
    nextDueAt: int | None = None
    unreadAnnouncements: int = 0
    archived: bool = False


class ModuleFileOut(BaseModel):
    filename: str
    mimetype: str
    size: int
    noteId: str | None = None


class ModuleOut(BaseModel):
    cmid: int
    name: str
    modname: str
    url: str | None = None
    description: str = ""
    link: str | None = None
    files: list[ModuleFileOut] = Field(default_factory=list)


class SectionOut(BaseModel):
    id: int
    name: str
    summary: str = ""
    modules: list[ModuleOut] = Field(default_factory=list)


class AssignmentOut(BaseModel):
    taskId: str | None = None
    assignId: int
    cmid: int
    name: str
    dueAt: int | None = None
    cutoffAt: int | None = None
    submissionStatus: str = ""
    grade: str = ""
    gradeMax: str = ""
    url: str


class GradeOut(BaseModel):
    name: str
    grade: str
    max: str
    percentage: str
    feedback: str
    cmid: int | None = None


class AnnouncementOut(BaseModel):
    id: str
    courseId: str
    courseShortname: str
    courseColor: str
    forumName: str
    forumType: str
    discussionId: int
    subject: str
    body: str
    author: str
    postedAt: int | None = None
    modifiedAt: int | None = None
    replies: int = 0
    url: str
    read: bool = False


class AnnouncementsOut(BaseModel):
    items: list[AnnouncementOut] = Field(default_factory=list)
    unread: int = 0
    syncedAt: int | None = None
    warning: str | None = None


class AnnouncementReadIn(BaseModel):
    ids: list[uuid.UUID] = Field(default_factory=list)
    courseId: uuid.UUID | None = None
    all: bool = False


class AnnouncementReadOut(BaseModel):
    updated: int = 0
    unread: int = 0


class CourseDetailOut(BaseModel):
    course: CourseOut
    sections: list[SectionOut]
    assignments: list[AssignmentOut]
    grades: list[GradeOut]
    outlineAt: int | None = None
    outlineError: str | None = None
    truncated: bool = False


class MoodleSaveIn(BaseModel):
    cmid: int = Field(ge=0)
    fileIndex: int = Field(default=0, ge=0, le=50)


class MoodleSaveOut(BaseModel):
    noteId: str
    title: str
    fileId: str
    size: int
