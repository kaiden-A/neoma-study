"""Public note sharing: token-addressed reads, no session required."""

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
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


@router.get("/{token}/files/{file_id}/raw")
def public_file_raw(
    token: str,
    file_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> RedirectResponse:
    """Inline images of a shared note: same stable path, token-scoped."""
    url = share_services.public_inline_file(db, token, file_id, storage).url
    return RedirectResponse(url, status_code=307, headers={"Cache-Control": "no-store"})
