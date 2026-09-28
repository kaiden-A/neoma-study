from typing import Literal

from pydantic import BaseModel, Field

from ..models.enums import NoteType

FlashcardGrade = Literal["again", "hard", "good", "easy"]


class FlashcardOut(BaseModel):
    id: str
    noteId: str
    noteTitle: str | None
    front: str
    back: str
    sourceHighlightId: str | None
    dueAt: int
    intervalDays: float
    ease: float
    reps: int
    lapses: int
    suspended: bool
    createdAt: int
    updatedAt: int


class FlashcardCreate(BaseModel):
    noteId: str
    front: str = Field(min_length=1, max_length=1000)
    back: str = Field(default="", max_length=2000)
    sourceHighlightId: str | None = Field(default=None, max_length=64)


class FlashcardPatch(BaseModel):
    front: str | None = Field(default=None, min_length=1, max_length=1000)
    back: str | None = Field(default=None, max_length=2000)
    suspended: bool | None = None


class GradeRequest(BaseModel):
    grade: FlashcardGrade


class StudySessionOut(BaseModel):
    id: str
    noteId: str | None
    noteTitle: str | None
    subjectId: str | None
    startedAt: int
    endedAt: int | None
    seconds: int
    source: str


class StudySessionCreate(BaseModel):
    noteId: str | None = None
    subjectId: str | None = None
    startedAt: int
    endedAt: int | None = None
    seconds: int = Field(ge=1, le=86400)
    source: Literal["timer", "manual"] = "timer"


class SubjectStudyStats(BaseModel):
    subjectId: str
    name: str
    color: str
    notes: int
    files: int
    cardsDue: int
    minutesThisWeek: int
    lastStudiedAt: int | None


class ContinueStudy(BaseModel):
    noteId: str
    title: str
    subjectId: str | None
    type: NoteType
    page: int
    videoSeconds: float | None
    lastAt: int


class StudyOverview(BaseModel):
    streakDays: int
    minutesThisWeek: int
    subjects: list[SubjectStudyStats]
    continueStudy: ContinueStudy | None
