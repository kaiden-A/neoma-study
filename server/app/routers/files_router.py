import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session as DbSession

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import get_storage, require_user
from ..models import FileObject, User
from ..schemas.notes import FileOut, FileUrlOut
from ..services import storage_services
from ..services.errors import InvalidError, NotFoundError

router = APIRouter(prefix="/api/files", tags=["files"])

MISSING_FILE = "That file is gone."


def _owned(db: DbSession, user: User, file_id: uuid.UUID) -> FileObject:
    file = db.get(FileObject, file_id)
    if file is None or file.owner_id != user.id:
        raise NotFoundError(MISSING_FILE)
    return file


@router.post("", response_model=FileOut, status_code=201)
def upload(
    file: UploadFile = File(...),
    thumb: UploadFile | None = File(default=None),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: storage_services.Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> FileOut:
    data = file.file.read()
    if not data:
        raise InvalidError("Choose a file first.")
    if len(data) > settings.max_upload_bytes:
        raise InvalidError("That file is over 15 MB")

    record = FileObject(
        owner_id=user.id,
        key="",
        name=(file.filename or "file")[:300],
        content_type=(file.content_type or "application/octet-stream")[:160],
        size=len(data),
    )
    db.add(record)
    db.flush()

    prefix = f"users/{user.id}/{record.id}"
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
    storage: storage_services.Storage = Depends(get_storage),
) -> FileUrlOut:
    record = _owned(db, user, file_id)
    key = record.thumb_key if thumb and record.thumb_key else record.key
    return FileUrlOut(url=storage.presigned_get(key))


@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: storage_services.Storage = Depends(get_storage),
) -> None:
    record = _owned(db, user, file_id)
    storage.delete(record.key)
    storage.delete(record.thumb_key)
    db.delete(record)
    db.commit()
