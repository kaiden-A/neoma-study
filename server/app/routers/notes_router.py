import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import get_storage, require_user
from ..models import User
from ..models.enums import NoteScope, NoteType
from ..schemas.notes import AnswerRequest, NoteCreate, NoteOut, NotePatch, ShareRequest
from ..services import note_services
from ..services.storage_services import Storage

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("", response_model=list[NoteOut])
def list_notes(
    scope: NoteScope | None = Query(default=None),
    groupId: str | None = Query(default=None),
    subjectId: str | None = Query(default=None),
    type: NoteType | None = Query(default=None),
    q: str | None = Query(default=None),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[NoteOut]:
    return note_services.list_notes(
        db,
        user,
        scope=scope,
        group_id=uuid.UUID(groupId) if groupId else None,
        subject_id=uuid.UUID(subjectId) if subjectId else None,
        type_filter=type,
        query=q,
    )


@router.post("", response_model=NoteOut, status_code=201)
def create_note(
    data: NoteCreate, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> NoteOut:
    return note_services.create_personal_note(db, user, data)


@router.get("/{note_id}", response_model=NoteOut)
def get_note(
    note_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> NoteOut:
    return note_services.note_out(db, note_services.require_note(db, user, note_id))


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: uuid.UUID,
    patch: NotePatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> NoteOut:
    return note_services.update_note(db, user, note_id, patch)


@router.delete("/{note_id}", status_code=204)
def delete_note(
    note_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> None:
    note_services.delete_note(db, user, note_id, storage)


@router.post("/{note_id}/share", response_model=NoteOut, status_code=201)
def share_note(
    note_id: uuid.UUID,
    data: ShareRequest,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> NoteOut:
    return note_services.share_to_group(
        db, user, note_id, data.groupId, data.topicId, storage=storage, include_file=data.includeFile
    )


@router.post("/{note_id}/answer", response_model=NoteOut, status_code=201)
def answer_request(
    note_id: uuid.UUID,
    data: AnswerRequest,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> NoteOut:
    return note_services.answer_request(db, user, note_id, data)
