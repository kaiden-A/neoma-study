"""Public read-only links for personal notes.

One `note_shares` row per note: the token in the URL is the only credential,
and deleting the row revokes it. Only the owner's own personal notes qualify.
The public projection is deliberately redacted - no ids, no study state, no
request internals - and the attached file is served through a short-lived
presigned GET minted per request.
"""

import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from ..config import get_settings
from ..models import FileObject, Note, NoteScope, NoteShare, User
from ..schemas.notes import FileUrlOut, NoteShareOut, PublicFileMeta, PublicNoteOut
from ..utils import to_ms
from . import note_services, storage_services
from .errors import NotFoundError

MISSING_NOTE = "That item is gone."
MISSING_LINK = "That link is not valid."
MISSING_FILE = "That file is gone."
TOKEN_BYTES = 32


def _share_url(token: str) -> str:
    base = get_settings().public_base_url.rstrip("/")
    return f"{base}/s/{token}"


def _share_out(share: NoteShare | None) -> NoteShareOut:
    if share is None:
        return NoteShareOut(enabled=False)
    return NoteShareOut(enabled=True, url=_share_url(share.token))


def _require_owned_note(db: DbSession, user: User, note_id: uuid.UUID) -> Note:
    note = note_services.require_note(db, user, note_id)
    if note.scope is not NoteScope.personal or note.owner_id != user.id:
        raise NotFoundError(MISSING_NOTE)
    return note


def get_share(db: DbSession, user: User, note_id: uuid.UUID) -> NoteShareOut:
    _require_owned_note(db, user, note_id)
    return _share_out(db.get(NoteShare, note_id))


def enable_share(db: DbSession, user: User, note_id: uuid.UUID) -> NoteShareOut:
    _require_owned_note(db, user, note_id)
    share = db.get(NoteShare, note_id)
    if share is not None:
        return _share_out(share)
    share = NoteShare(note_id=note_id, token=secrets.token_urlsafe(TOKEN_BYTES), created_by=user.id)
    db.add(share)
    try:
        db.commit()
    except IntegrityError:
        # A double-click raced us to the same note; the existing link wins.
        db.rollback()
        return _share_out(db.get(NoteShare, note_id))
    return _share_out(share)


def disable_share(db: DbSession, user: User, note_id: uuid.UUID) -> None:
    _require_owned_note(db, user, note_id)
    share = db.get(NoteShare, note_id)
    if share is not None:
        db.delete(share)
        db.commit()


def _share_note(db: DbSession, token: str) -> tuple[NoteShare, Note]:
    share = db.scalar(select(NoteShare).where(NoteShare.token == token.strip()))
    if share is None:
        raise NotFoundError(MISSING_LINK)
    note = db.get(Note, share.note_id)
    if note is None:
        raise NotFoundError(MISSING_LINK)
    return share, note


def public_note(db: DbSession, token: str) -> PublicNoteOut:
    share, note = _share_note(db, token)
    owner = db.get(User, note.owner_id) if note.owner_id else None
    file = db.get(FileObject, note.file_id) if note.file_id else None
    return PublicNoteOut(
        title=note.title,
        body=note.body,
        type=note.type,
        url=note.url,
        tags=list(note.tags or []),
        file=(
            PublicFileMeta(name=file.name, contentType=file.content_type, size=file.size) if file else None
        ),
        sharedBy=(owner.display_name if owner else "") or "Someone",
        sharedAt=to_ms(share.created_at) or 0,
        createdAt=to_ms(note.created_at) or 0,
        updatedAt=to_ms(note.updated_at) or 0,
    )


def public_file(db: DbSession, token: str, storage: storage_services.Storage) -> FileUrlOut:
    _share, note = _share_note(db, token)
    file = db.get(FileObject, note.file_id) if note.file_id else None
    if file is None:
        raise NotFoundError(MISSING_FILE)
    return FileUrlOut(url=storage.presigned_get(file.key))
