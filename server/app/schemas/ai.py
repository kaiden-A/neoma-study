from typing import Literal

from pydantic import BaseModel, Field


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
