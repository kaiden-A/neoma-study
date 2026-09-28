from pydantic import BaseModel, Field


class LinkPreviewIn(BaseModel):
    url: str = Field(max_length=1000)


class LinkPreviewOut(BaseModel):
    """Provider metadata for a link note; every field may be absent."""

    title: str | None
    author: str | None
    thumbnailUrl: str | None
