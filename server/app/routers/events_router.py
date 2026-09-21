import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import Event, Group, GroupMember, Task, User
from ..schemas.events import EventCreate, EventOut, EventPatch
from ..services import event_services, ics_services
from ..utils import from_ms

router = APIRouter(prefix="/api", tags=["events"])


def _visible_group_ids(db: DbSession, user: User) -> list[uuid.UUID]:
    return list(db.scalars(select(GroupMember.group_id).where(GroupMember.user_id == user.id)).all())


def _group_names(db: DbSession, group_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not group_ids:
        return {}
    rows = db.execute(select(Group.id, Group.name).where(Group.id.in_(group_ids))).all()
    return {row[0]: row[1] for row in rows}


@router.get("/events", response_model=list[EventOut])
def list_events(
    from_ms_value: int | None = Query(default=None, alias="from"),
    to_ms_value: int | None = Query(default=None, alias="to"),
    groupId: str | None = Query(default=None),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[EventOut]:
    return event_services.list_events(
        db,
        user,
        starts_from=from_ms(from_ms_value),
        starts_to=from_ms(to_ms_value),
        group_id=uuid.UUID(groupId) if groupId else None,
    )


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(
    data: EventCreate, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> EventOut:
    return event_services.create_event(db, user, data)


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(
    event_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> EventOut:
    return event_services.event_out(event_services.require_event(db, user, event_id))


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: uuid.UUID,
    patch: EventPatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> EventOut:
    return event_services.update_event(db, user, event_id, patch)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> None:
    event_services.delete_event(db, user, event_id)


@router.get("/events/{event_id}/google")
def google_link(
    event_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> dict[str, str]:
    event = event_services.require_event(db, user, event_id)
    group_name = ""
    if event.group_id:
        group_name = db.scalar(select(Group.name).where(Group.id == event.group_id)) or ""
    return {
        "url": ics_services.google_url(
            title=event.title,
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            group_name=group_name,
            location=event.location,
        )
    }


@router.get("/events/{event_id}/ics")
def download_event(
    event_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> Response:
    event = event_services.require_event(db, user, event_id)
    group_name = ""
    if event.group_id:
        group_name = db.scalar(select(Group.name).where(Group.id == event.group_id)) or ""
    text = ics_services.build_calendar(
        [ics_services.event_block(event_services.event_out(event), group_name)]
    )
    filename = "".join(char if char.isalnum() or char in "-_" else "-" for char in event.title.lower())[:60]
    return Response(
        text,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename or "event"}.ics"'},
    )


@router.get("/calendar.ics")
def download_calendar(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> Response:
    group_ids = _visible_group_ids(db, user)
    names = _group_names(db, set(group_ids))

    event_condition = Event.owner_id == user.id
    if group_ids:
        event_condition = or_(event_condition, Event.group_id.in_(group_ids))
    events = db.scalars(select(Event).where(event_condition)).all()

    task_condition = Task.owner_id == user.id
    if group_ids:
        task_condition = or_(task_condition, Task.group_id.in_(group_ids))
    tasks = db.scalars(select(Task).where(task_condition, Task.due_at.is_not(None))).all()

    text = ics_services.build_from_rows(
        events=[(event, names.get(event.group_id, "") if event.group_id else "") for event in events],
        tasks=[(task, names.get(task.group_id, "") if task.group_id else "") for task in tasks],
    )
    return Response(
        text,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="neoma-study.ics"'},
    )
