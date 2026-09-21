from pydantic import BaseModel, Field

from ..models.enums import GroupKind


class MemberOut(BaseModel):
    id: str
    name: str
    email: str
    color: str
    program: str
    invited: bool


class TopicOut(BaseModel):
    id: str
    name: str
    color: str


class GroupLinkOut(BaseModel):
    id: str
    label: str
    url: str


class GroupOut(BaseModel):
    id: str
    kind: GroupKind
    name: str
    subject: str
    color: str
    description: str
    inviteCode: str
    ownerId: str
    topics: list[TopicOut]
    links: list[GroupLinkOut]
    members: list[MemberOut]
    createdAt: int
    updatedAt: int


class GroupPreviewOut(BaseModel):
    id: str
    kind: GroupKind
    name: str
    subject: str
    color: str
    description: str
    inviteCode: str
    ownerName: str
    topics: list[TopicOut]
    memberCount: int
    isMember: bool


class GroupCreate(BaseModel):
    kind: GroupKind = GroupKind.project
    name: str = Field(min_length=1, max_length=160)
    subject: str = Field(default="", max_length=80)
    color: str = Field(default="sky", max_length=16)
    description: str = Field(default="", max_length=2000)
    topics: list[str] = Field(default_factory=list, max_length=50)


class GroupPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    subject: str | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=2000)


class InviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class RemoveMemberRequest(BaseModel):
    reassignTo: str | None = None


class TopicCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class TopicPatch(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class GroupLinkCreate(BaseModel):
    label: str = Field(default="", max_length=160)
    url: str = Field(min_length=1, max_length=1000)
