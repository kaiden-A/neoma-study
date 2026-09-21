"""One round trip for the signed-in client.

The client keeps the prototype's single-store model, so the first paint needs
every collection the user can see. Mutations still go through the per-resource
routers; this is only the initial load.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import Subject, User
from ..schemas.events import EventOut
from ..schemas.groups import GroupOut
from ..schemas.notes import NoteOut
from ..schemas.notifications import NotificationOut
from ..schemas.settings import UserSettings
from ..schemas.subjects import SubjectOut
from ..schemas.tasks import TaskOut
from ..schemas.users import PublicUser
from ..services import (
    auth_services,
    event_services,
    group_services,
    note_services,
    notification_services,
    settings_services,
    task_services,
)

router = APIRouter(prefix="/api/bootstrap", tags=["bootstrap"])


class BootstrapOut(BaseModel):
    user: PublicUser
    settings: UserSettings
    subjects: list[SubjectOut]
    groups: list[GroupOut]
    tasks: list[TaskOut]
    notes: list[NoteOut]
    events: list[EventOut]
    notifications: list[NotificationOut]


@router.get("", response_model=BootstrapOut)
def bootstrap(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> BootstrapOut:
    subjects = db.scalars(
        select(Subject).where(Subject.owner_id == user.id).order_by(Subject.position, Subject.created_at)
    ).all()
    return BootstrapOut(
        user=auth_services.public_user(user),
        settings=settings_services.read_settings(user),
        subjects=[
            SubjectOut(id=str(subject.id), name=subject.name, color=subject.color) for subject in subjects
        ],
        groups=group_services.list_groups(db, user),
        tasks=task_services.list_tasks(db, user),
        notes=note_services.list_notes(db, user),
        events=event_services.list_events(db, user),
        notifications=notification_services.derive(db, user),
    )
