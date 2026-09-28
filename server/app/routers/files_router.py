import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session as DbSession

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import get_storage, require_user
from ..models import FileObject, User
from ..schemas.notes import FileOut, FilePresignIn, FilePresignOut, FileTextOut, FileUrlOut
from ..services import access, extract_services, file_services
from ..services.errors import InvalidError, NotFoundError
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

    prefix = f"groups/{group_uuid}/{record.id}" if group_uuid is not None else f"users/{user.id}/{record.id}"
    record.key = file_services.file_key(prefix, record.name)
    storage.put(record.key, data, record.content_type)

    if thumb is not None:
        thumb_data = thumb.file.read()
        if thumb_data:
            thumb_key = f"{record.key}-thumb"
            record.thumb_key = thumb_key
            storage.put(thumb_key, thumb_data, "image/jpeg")

    db.commit()
    # Best-effort: search inside the file, never fail the upload over it.
    extract_services.extract_file_text(db, storage, record)
    return FileOut(id=str(record.id), name=record.name, contentType=record.content_type, size=record.size)


@router.post("/presign", response_model=FilePresignOut, status_code=201)
def presign_upload(
    data: FilePresignIn,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> FilePresignOut:
    """Reserves a row and hands back a direct-to-R2 PUT URL.

    The browser uploads straight to R2, so the bytes never cross the client
    host or this API. Confirm afterwards records the real size.
    """
    if data.size <= 0:
        raise InvalidError("Choose a file first.")
    if data.size > settings.max_upload_bytes:
        raise InvalidError("That file is over 15 MB")

    group_uuid = _target_group(db, user, data.groupId)
    record = FileObject(
        owner_id=user.id,
        group_id=group_uuid,
        key="",
        name=(data.name or "file")[:300],
        content_type=(data.contentType or "application/octet-stream")[:160],
        size=data.size,
    )
    db.add(record)
    db.flush()

    prefix = f"groups/{group_uuid}/{record.id}" if group_uuid is not None else f"users/{user.id}/{record.id}"
    record.key = file_services.file_key(prefix, record.name)
    thumb_key = f"{record.key}-thumb" if data.thumb else None
    record.thumb_key = thumb_key
    # Presign before committing: an unconfigured or failing bucket must not
    # leave a half-created row behind.
    upload_url = storage.presigned_put(record.key, record.content_type)
    thumb_url = storage.presigned_put(thumb_key, "image/jpeg") if thumb_key else None
    db.commit()
    return FilePresignOut(
        id=str(record.id),
        name=record.name,
        contentType=record.content_type,
        size=record.size,
        uploadUrl=upload_url,
        thumbUploadUrl=thumb_url,
    )


@router.post("/{file_id}/confirm", response_model=FileOut)
def confirm_upload(
    file_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> FileOut:
    """Records the real object size after a direct PUT; 422 if it never landed."""
    record = file_services.require_visible_file(db, user, file_id)
    access.require_owned(record, user)
    size = storage.head(record.key)
    if size is None:
        db.delete(record)
        db.commit()
        raise InvalidError("That upload did not finish. Try again.")
    if size > settings.max_upload_bytes:
        storage.delete(record.key)
        db.delete(record)
        db.commit()
        raise InvalidError("That file is over 15 MB")
    record.size = size
    if record.thumb_key is not None and storage.head(record.thumb_key) is None:
        record.thumb_key = None
    db.commit()
    # Best-effort: search inside the file, never fail the upload over it.
    extract_services.extract_file_text(db, storage, record)
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


@router.get("/{file_id}/text", response_model=FileTextOut)
def file_text(
    file_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> FileTextOut:
    """Plain text of a text file, read server-side so ownership holds.

    Only text/* and JSON are readable (a PDF is not dumped into JSON by
    accident), and only the first 256 KB are returned.
    """
    record = file_services.require_visible_file(db, user, file_id)
    if not file_services.is_text_file(record.content_type):
        raise InvalidError("That file has no text to preview.")
    size = storage.head(record.key)
    if size is None:
        raise NotFoundError("That file is gone.")
    raw = storage.get_bytes(record.key, file_services.MAX_TEXT_BYTES) or b""
    return FileTextOut(
        text=raw.decode("utf-8", errors="replace"),
        truncated=size > file_services.MAX_TEXT_BYTES,
    )


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
