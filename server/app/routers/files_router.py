import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session as DbSession

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import get_storage, require_user
from ..models import FileObject, User
from ..schemas.notes import FileOut, FileUrlOut
from ..services import access, file_services
from ..services.errors import InvalidError
from ..services.storage_services import Storage

router = APIRouter(prefix="/api/files", tags=["files"])


def _target_group(db: DbSession, user: User, group_id: str | None) -> uuid.UUID | None:
    if not group_id:
        return None
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError as exc:
        raise InvalidError("That group id is not valid.") from exc
    access.require_group(db, group_uuid, user)
    return group_uuid


@router.post("", response_model=FileOut, status_code=201)
def upload(
    file: UploadFile = File(...),
    thumb: UploadFile | None = File(default=None),
    groupId: str | None = Form(default=None),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> FileOut:
    data = file.file.read()
    if not data:
        raise InvalidError("Choose a file first.")
    if len(data) > settings.max_upload_bytes:
        raise InvalidError("That file is over 15 MB")

    group_uuid = _target_group(db, user, groupId)
    record = FileObject(
        owner_id=user.id,
        group_id=group_uuid,
        key="",
        name=(file.filename or "file")[:300],
        content_type=(file.content_type or "application/octet-stream")[:160],
        size=len(data),
    )
    db.add(record)
    db.flush()

    prefix = (
        f"groups/{group_uuid}/{record.id}" if group_uuid is not None else f"users/{user.id}/{record.id}"
    )
    record.key = prefix
    storage.put(prefix, data, record.content_type)

    if thumb is not None:
        thumb_data = thumb.file.read()
        if thumb_data:
            thumb_key = f"{prefix}-thumb"
            record.thumb_key = thumb_key
            storage.put(thumb_key, thumb_data, "image/jpeg")

    db.commit()
    return FileOut(id=str(record.id), name=record.name, contentType=record.content_type, size=record.size)


@router.get("/{file_id}/url", response_model=FileUrlOut)
def file_url(
    file_id: uuid.UUID,
    thumb: bool = False,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> FileUrlOut:
    record = file_services.require_visible_file(db, user, file_id)
    key = record.thumb_key if thumb and record.thumb_key else record.key
    return FileUrlOut(url=storage.presigned_get(key))


@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> None:
    record = file_services.require_deletable_file(db, user, file_id)
    file_services.purge_file(db, storage, record)
    db.commit()
