"""Public note sharing: token-addressed reads, no session required."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import get_storage
from ..schemas.notes import FileUrlOut, PublicNoteOut
from ..services import share_services
from ..services.storage_services import Storage

router = APIRouter(prefix="/api/shares", tags=["shares"])


@router.get("/{token}", response_model=PublicNoteOut)
def public_note(token: str, db: DbSession = Depends(get_db)) -> PublicNoteOut:
    return share_services.public_note(db, token)


@router.get("/{token}/file", response_model=FileUrlOut)
def public_file(
    token: str, db: DbSession = Depends(get_db), storage: Storage = Depends(get_storage)
) -> FileUrlOut:
    return share_services.public_file(db, token, storage)
