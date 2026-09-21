from enum import StrEnum


class UserKind(StrEnum):
    member = "member"
    guest = "guest"


class GroupKind(StrEnum):
    project = "project"
    study = "study"


class GroupRole(StrEnum):
    owner = "owner"
    member = "member"


class TaskStatus(StrEnum):
    todo = "todo"
    doing = "doing"
    done = "done"


class TaskPriority(StrEnum):
    low = "low"
    med = "med"
    high = "high"


class NoteScope(StrEnum):
    personal = "personal"
    group = "group"


class NoteType(StrEnum):
    note = "note"
    handwritten = "handwritten"
    slides = "slides"
    paper = "paper"
    link = "link"
    request = "request"


class EventType(StrEnum):
    exam = "exam"
    session = "session"
    meeting = "meeting"
    personal = "personal"


def enum_values(enum_class: type[StrEnum]) -> list[str]:
    """SQLAlchemy values_callable: store the lowercase value, not the name."""
    return [member.value for member in enum_class]
