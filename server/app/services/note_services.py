"""Notes, subjects, file objects and the request/answer flow.

Personal notes belong to a person; group notes belong to a group and are
visible to its members. Sharing copies the text into a new group note (files
never leave personal scope, exactly like the prototype). Answering a request
creates the answer note and closes the request in one service call.
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from ..models import FileObject, GroupMember, GroupTopic, Note, NoteScope, NoteType, Subject, User, utcnow
from ..schemas.notes import AnswerRequest, GroupNoteCreate, NoteCreate, NoteOut, NotePatch, RequestOut
from ..utils import domain_of, to_ms
from . import access, storage_services
from .errors import InvalidError, NotFoundError

MISSING_NOTE = "That item is gone."
MISSING_SUBJECT = "That subject is gone."
MAX_TAGS = 30


def _clean_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    for tag in tags:
        value = tag.strip().lstrip("#")[:40]
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned[:MAX_TAGS]


def _visible_group_ids(db: DbSession, user: User) -> list[uuid.UUID]:
    return list(db.scalars(select(GroupMember.group_id).where(GroupMember.user_id == user.id)).all())


def note_out(db: DbSession, note: Note) -> NoteOut:
    file = db.get(FileObject, note.file_id) if note.file_id else None
    request = None
    if note.type is NoteType.request:
        request = RequestOut(
            open=bool(note.request_open),
            answeredBy=str(note.request_answered_by) if note.request_answered_by else None,
            answeredAt=to_ms(note.request_answered_at),
            answerNoteId=str(note.request_answer_note_id) if note.request_answer_note_id else None,
        )
    return NoteOut(
        id=str(note.id),
        scope=note.scope,
        groupId=str(note.group_id) if note.group_id else None,
        subjectId=str(note.subject_id) if note.subject_id else None,
        topicId=str(note.topic_id) if note.topic_id else None,
        type=note.type,
        title=note.title,
        body=note.body,
        url=note.url,
        fileId=str(note.file_id) if note.file_id else None,
        fileName=file.name if file else None,
        fileType=file.content_type if file else None,
        fileSize=file.size if file else None,
        pinned=note.pinned,
        tags=list(note.tags or []),
        createdBy=str(note.created_by) if note.created_by else None,
        createdAt=to_ms(note.created_at) or 0,
        updatedAt=to_ms(note.updated_at) or 0,
        request=request,
    )


def require_note(db: DbSession, user: User, note_id: uuid.UUID) -> Note:
    note = db.get(Note, note_id)
    if note is None:
        raise NotFoundError(MISSING_NOTE)
    if note.owner_id is not None:
        if note.owner_id != user.id:
            raise NotFoundError(MISSING_NOTE)
    elif note.group_id is None or not access.is_member(db, note.group_id, user.id):
        raise NotFoundError(MISSING_NOTE)
    return note


def list_notes(
    db: DbSession,
    user: User,
    *,
    scope: NoteScope | None = None,
    group_id: uuid.UUID | None = None,
    subject_id: uuid.UUID | None = None,
    type_filter: NoteType | None = None,
    query: str | None = None,
) -> list[NoteOut]:
    group_ids = _visible_group_ids(db, user)
    condition = Note.owner_id == user.id
    if group_ids:
        condition = or_(condition, Note.group_id.in_(group_ids))
    statement = select(Note).where(condition)
    if scope is not None:
        statement = statement.where(Note.scope == scope)
    if group_id is not None:
        access.require_group(db, group_id, user)
        statement = statement.where(Note.group_id == group_id)
    if subject_id is not None:
        statement = statement.where(Note.subject_id == subject_id)
    if type_filter is not None:
        statement = statement.where(Note.type == type_filter)
    notes = list(db.scalars(statement.order_by(Note.updated_at.desc())).all())
    if query:
        # Search title, body, URL and tags in one pass; the vault loads every
        # note anyway, so a Python filter keeps the SQL (and the array search)
        # simple.
        needle = query.strip().lower()
        notes = [
            note
            for note in notes
            if needle in note.title.lower()
            or needle in note.body.lower()
            or needle in (note.url or "").lower()
            or any(needle in tag.lower() for tag in (note.tags or []))
        ]
    return [note_out(db, note) for note in notes]


def _require_subject(db: DbSession, user: User, subject_id: str | None) -> uuid.UUID | None:
    if not subject_id:
        return None
    try:
        subject_uuid = uuid.UUID(subject_id)
    except ValueError as exc:
        raise InvalidError("That subject id is not valid.") from exc
    subject = db.get(Subject, subject_uuid)
    if subject is None or subject.owner_id != user.id:
        raise NotFoundError(MISSING_SUBJECT)
    return subject_uuid


def _require_topic(db: DbSession, group_id: uuid.UUID | None, topic_id: str | None) -> uuid.UUID | None:
    if not topic_id:
        return None
    try:
        topic_uuid = uuid.UUID(topic_id)
    except ValueError as exc:
        raise InvalidError("That topic id is not valid.") from exc
    topic = db.get(GroupTopic, topic_uuid)
    if topic is None or topic.group_id != group_id:
        raise NotFoundError("That topic is gone.")
    return topic_uuid


def _require_file(db: DbSession, user: User, file_id: str | None) -> uuid.UUID | None:
    if not file_id:
        return None
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError as exc:
        raise InvalidError("That file id is not valid.") from exc
    file = db.get(FileObject, file_uuid)
    if file is None or file.owner_id != user.id:
        raise NotFoundError("That file is gone.")
    return file_uuid


def _validate_link(url: str | None) -> str | None:
    if not url:
        return None
    clean = url.strip()
    if not clean.lower().startswith(("http://", "https://")):
        raise InvalidError("Links need to start with http:// or https://")
    return clean[:1000]


def create_personal_note(db: DbSession, user: User, data: NoteCreate) -> NoteOut:
    url = _validate_link(data.url)
    title = data.title.strip() or (data.body.strip()[:48] if data.body.strip() else "Untitled")
    note = Note(
        owner_id=user.id,
        scope=NoteScope.personal,
        subject_id=_require_subject(db, user, data.subjectId),
        type=data.type,
        title=title[:300],
        body=data.body,
        url=url,
        file_id=_require_file(db, user, data.fileId),
        pinned=data.pinned,
        tags=_clean_tags(data.tags),
        created_by=user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note_out(db, note)


def create_group_note(db: DbSession, user: User, group_id: uuid.UUID, data: GroupNoteCreate) -> NoteOut:
    group = access.require_group(db, group_id, user)
    url = _validate_link(data.url)
    is_request = data.type is NoteType.request
    if is_request and not (data.title.strip() or data.body.strip()):
        raise InvalidError("Say what you are looking for.")
    title = data.title.strip() or (data.body.strip()[:48] if data.body.strip() else "Untitled")
    note = Note(
        group_id=group.id,
        scope=NoteScope.group,
        topic_id=_require_topic(db, group.id, data.topicId),
        type=data.type,
        title=title[:300],
        body=data.body,
        url=url,
        tags=_clean_tags(data.tags),
        request_open=True if is_request else None,
        created_by=user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note_out(db, note)


def update_note(db: DbSession, user: User, note_id: uuid.UUID, patch: NotePatch) -> NoteOut:
    note = require_note(db, user, note_id)
    fields = patch.model_fields_set
    if "title" in fields and patch.title is not None:
        note.title = (patch.title.strip() or "Untitled")[:300]
    if "body" in fields and patch.body is not None:
        note.body = patch.body
    if "url" in fields:
        note.url = _validate_link(patch.url)
    if "subjectId" in fields and note.scope is NoteScope.personal:
        note.subject_id = _require_subject(db, user, patch.subjectId)
    if "topicId" in fields and note.scope is NoteScope.group:
        note.topic_id = _require_topic(db, note.group_id, patch.topicId)
    if "type" in fields and patch.type is not None and note.type is not NoteType.request:
        note.type = patch.type
    if "tags" in fields and patch.tags is not None:
        note.tags = _clean_tags(patch.tags)
    if "pinned" in fields and patch.pinned is not None:
        note.pinned = patch.pinned
    db.commit()
    db.refresh(note)
    return note_out(db, note)


def delete_note(db: DbSession, user: User, note_id: uuid.UUID, storage: storage_services.Storage) -> None:
    note = require_note(db, user, note_id)
    if note.file_id:
        file = db.get(FileObject, note.file_id)
        if file is not None and file.owner_id == user.id:
            storage.delete(file.key)
            storage.delete(file.thumb_key)
            db.delete(file)
    db.delete(note)
    db.commit()


def share_to_group(
    db: DbSession, user: User, note_id: uuid.UUID, group_id: str, topic_id: str | None
) -> NoteOut:
    note = require_note(db, user, note_id)
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError as exc:
        raise InvalidError("That group id is not valid.") from exc
    group = access.require_group(db, group_uuid, user)

    body = note.body
    if note.type is NoteType.link and note.url:
        body = f"{body}\n\nLink: {note.url}".strip()
    copy = Note(
        group_id=group.id,
        scope=NoteScope.group,
        topic_id=_require_topic(db, group.id, topic_id),
        type=NoteType.note,
        title=note.title,
        body=body,
        tags=list(note.tags or []),
        created_by=user.id,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return note_out(db, copy)


def answer_request(db: DbSession, user: User, note_id: uuid.UUID, answer: AnswerRequest) -> NoteOut:
    request = require_note(db, user, note_id)
    if request.type is not NoteType.request:
        raise InvalidError("That is not a request.")
    if not request.request_open:
        raise InvalidError("That request is already answered.")
    url = _validate_link(answer.url)
    body = answer.body.strip()
    if not url and not body:
        raise InvalidError("Add a link or a short note first.")
    if request.group_id is None:
        raise InvalidError("That request is gone.")

    title = (answer.title or "").strip() or (domain_of(url) if url else "Answer")
    answer_note = Note(
        group_id=request.group_id,
        scope=NoteScope.group,
        topic_id=request.topic_id,
        type=NoteType.link if url else NoteType.note,
        title=title[:300],
        body=body,
        url=url,
        tags=list(request.tags or []),
        created_by=user.id,
    )
    db.add(answer_note)
    db.flush()

    request.request_open = False
    request.request_answered_by = user.id
    request.request_answered_at = utcnow()
    request.request_answer_note_id = answer_note.id
    db.commit()
    db.refresh(answer_note)
    return note_out(db, answer_note)


def notes_for_group(db: DbSession, user: User, group_id: uuid.UUID) -> list[NoteOut]:
    access.require_group(db, group_id, user)
    return list_notes(db, user, scope=NoteScope.group, group_id=group_id)
