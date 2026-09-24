from pydantic import BaseModel, Field

from ..models.enums import NoteType


class RequestOut(BaseModel):
    open: bool
    answeredBy: str | None
    answeredAt: int | None
    answerNoteId: str | None


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
    createdBy: str | None
    createdAt: int
    updatedAt: int
    request: RequestOut | None


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
