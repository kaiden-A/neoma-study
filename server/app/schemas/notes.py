from pydantic import BaseModel, Field

from ..models.enums import NoteType


class RequestOut(BaseModel):
    open: bool
    answeredBy: str | None
    answeredAt: int | None
    answerNoteId: str | None


class StudyPosition(BaseModel):
    page: int = Field(default=1, ge=1)
    scroll: float = 0


class StudyHighlight(BaseModel):
    """A text selection in a PDF, with rects normalized to the page."""

    id: str = Field(max_length=64)
    page: int = Field(ge=1)
    rects: list[list[float]] = Field(default_factory=list)
    quote: str = Field(default="", max_length=2000)
    color: str = Field(default="amber", max_length=16)
    createdAt: int = 0
    tag: str | None = Field(default=None, max_length=40)


class NoteStudy(BaseModel):
    position: StudyPosition = Field(default_factory=StudyPosition)
    highlights: list[StudyHighlight] = Field(default_factory=list)
    # Video resume marks in seconds; the last one is where the player opens.
    timestamps: list[float] = Field(default_factory=list)


class NoteOut(BaseModel):
    id: str
    scope: str
    groupId: str | None
    subjectId: str | None
    topicId: str | None
    type: NoteType
    title: str
    body: str
    url: str | None
    fileId: str | None
    fileName: str | None
    fileType: str | None
    fileSize: int | None
    pinned: bool
    tags: list[str]
    study: NoteStudy
    matchSnippet: str | None = None
    createdBy: str | None
    createdAt: int
    updatedAt: int
    request: RequestOut | None


class NoteShareOut(BaseModel):
    """The owner's view of a note's public link."""

    enabled: bool
    url: str | None = None


class PublicFileMeta(BaseModel):
    name: str
    contentType: str
    size: int


class PublicNoteOut(BaseModel):
    """What an anonymous visitor sees. Deliberately redacted: no ids, no
    subject/topic, no study state, no request internals."""

    title: str
    body: str
    type: NoteType
    url: str | None
    tags: list[str]
    file: PublicFileMeta | None
    sharedBy: str
    sharedAt: int
    createdAt: int
    updatedAt: int


class NoteCreate(BaseModel):
    type: NoteType = NoteType.note
    title: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=20000)
    url: str | None = Field(default=None, max_length=1000)
    subjectId: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=30)
    fileId: str | None = None
    pinned: bool = False


class NotePatch(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    body: str | None = Field(default=None, max_length=20000)
    url: str | None = Field(default=None, max_length=1000)
    subjectId: str | None = None
    topicId: str | None = None
    type: NoteType | None = None
    tags: list[str] | None = Field(default=None, max_length=30)
    pinned: bool | None = None
    study: NoteStudy | None = None


class ShareRequest(BaseModel):
    groupId: str
    topicId: str | None = None
    includeFile: bool = True


class AnswerRequest(BaseModel):
    url: str | None = Field(default=None, max_length=1000)
    title: str | None = Field(default=None, max_length=300)
    body: str = Field(default="", max_length=20000)


class GroupNoteCreate(BaseModel):
    type: NoteType = NoteType.note
    title: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=20000)
    url: str | None = Field(default=None, max_length=1000)
    topicId: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=30)
    fileId: str | None = None


class FileOut(BaseModel):
    id: str
    name: str
    contentType: str
    size: int


class FilePresignIn(BaseModel):
    name: str = Field(default="file", max_length=300)
    contentType: str = Field(default="application/octet-stream", max_length=160)
    size: int = Field(default=0, ge=0)
    groupId: str | None = None
    thumb: bool = False


class FilePresignOut(BaseModel):
    id: str
    name: str
    contentType: str
    size: int
    uploadUrl: str
    thumbUploadUrl: str | None


class FileUrlOut(BaseModel):
    url: str


class FileTextOut(BaseModel):
    text: str
    truncated: bool
