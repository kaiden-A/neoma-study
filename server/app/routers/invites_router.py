import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import current_user, require_user
from ..models import User
from ..schemas.groups import GroupOut, GroupPreviewOut
from ..services import access, group_services

router = APIRouter(prefix="/api/invites", tags=["invites"])


@router.get("/{code}", response_model=GroupPreviewOut)
def preview(
    code: str,
    user: User | None = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> GroupPreviewOut:
    result = group_services.preview(db, code)
    if user is not None:
        group = group_services.find_by_code(db, code)
        result.isMember = group is not None and access.is_member(db, group.id, user.id)
    return result


@router.post("/{code}/join", response_model=GroupOut)
def join(code: str, user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> GroupOut:
    group = group_services.find_by_code(db, code)
    group_id = group.id if group is not None else uuid.UUID(int=0)
    return group_services.join_group(db, user, group_id)
