from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import get_storage, require_user
from ..models import FileObject, Note, User
from ..services import export_services
from ..services.storage_services import Storage

router = APIRouter(prefix="/api", tags=["data"])


class ImportRequest(BaseModel):
    payload: dict[str, Any]


@router.get("/export")
def export_account(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> dict[str, Any]:
    return export_services.export_account(db, user)


@router.post("/import")
def import_account(
    data: ImportRequest, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> dict[str, int]:
    return export_services.import_account(db, user, data.payload)


@router.post("/demo")
def load_demo(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> dict[str, int]:
    return export_services.seed_demo(db, user)


@router.delete("/demo")
def clear_all(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> dict[str, int]:
    """Danger zone: removes everything the user owns, not just the demo."""
    return export_services.clear_demo(db, user)


@router.post("/maintenance/remove-files")
def remove_files(
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> dict[str, int]:
    """Deletes every uploaded object and clears the note references."""
    files = list(db.scalars(select(FileObject).where(FileObject.owner_id == user.id)))
    for note in db.scalars(select(Note).where(Note.owner_id == user.id, Note.file_id.is_not(None))):
        note.file_id = None
    for record in files:
        storage.delete(record.key)
        storage.delete(record.thumb_key)
        db.delete(record)
    db.commit()
    return {"files": len(files)}
