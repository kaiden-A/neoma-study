import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..models.enums import TaskStatus
from ..schemas.tasks import PostponeRequest, TaskCreate, TaskOut, TaskPatch
from ..services import task_services
from ..utils import from_ms

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(
    groupId: str | None = Query(default=None),
    personal: bool = Query(default=False),
    status: TaskStatus | None = Query(default=None),
    assignee: str | None = Query(default=None),
    dueBefore: int | None = Query(default=None),
    dueAfter: int | None = Query(default=None),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[TaskOut]:
    return task_services.list_tasks(
        db,
        user,
        group_id=uuid.UUID(groupId) if groupId else None,
        personal=personal,
        status=status,
        assignee=uuid.UUID(assignee) if assignee else None,
        due_before=from_ms(dueBefore),
        due_after=from_ms(dueAfter),
    )


@router.post("", response_model=TaskOut, status_code=201)
def create_task(
    data: TaskCreate, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> TaskOut:
    return task_services.create_task(db, user, data)


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> TaskOut:
    return task_services.task_out(task_services.require_task(db, user, task_id))


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: uuid.UUID,
    patch: TaskPatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> TaskOut:
    return task_services.update_task(db, user, task_id, patch)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> None:
    task_services.delete_task(db, user, task_id)


@router.post("/{task_id}/postpone", response_model=TaskOut)
def postpone_task(
    task_id: uuid.UUID,
    body: PostponeRequest | None = None,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> TaskOut:
    offset = body.timezoneOffsetMinutes if body else 0
    return task_services.postpone_task(db, user, task_id, offset)


@router.post("/{task_id}/duplicate", response_model=TaskOut, status_code=201)
def duplicate_task(
    task_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> TaskOut:
    return task_services.duplicate_task(db, user, task_id)
