from pydantic import BaseModel, Field

from ..models.enums import UserKind


class PublicUser(BaseModel):
    id: str
    name: str
    email: str
    kind: UserKind
    program: str = ""
    color: str = "amber"


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    program: str | None = Field(default=None, max_length=160)
    color: str | None = Field(default=None, max_length=16)
