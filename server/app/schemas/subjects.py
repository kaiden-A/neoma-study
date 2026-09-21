from pydantic import BaseModel


class SubjectOut(BaseModel):
    id: str
    name: str
    color: str


class SubjectCreate(BaseModel):
    name: str = ""


class SubjectPatch(BaseModel):
    name: str | None = None
    color: str | None = None
