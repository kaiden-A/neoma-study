"""Calendar events. Group events are visible to members; personal ones are not."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from ..models import Event, GroupMember, User
from ..schemas.events import EventCreate, EventOut, EventPatch
from ..utils import from_ms, to_ms
from . import access, email_services, google_services
from .errors import InvalidError, NotFoundError

MISSING_EVENT = "That event is gone."


def _visible_group_ids(db: DbSession, user: User) -> list[uuid.UUID]:
    return list(db.scalars(select(GroupMember.group_id).where(GroupMember.user_id == user.id)).all())


def event_out(event: Event) -> EventOut:
    return EventOut(
        id=str(event.id),
        title=event.title,
        type=event.type,
        groupId=str(event.group_id) if event.group_id else None,
        startsAt=to_ms(event.starts_at) or 0,
        endsAt=to_ms(event.ends_at),
        location=event.location,
        reminderMinutes=event.reminder_minutes,
        notes=event.notes,
        createdBy=str(event.owner_id) if event.owner_id else None,
        createdAt=to_ms(event.created_at) or 0,
        updatedAt=to_ms(event.updated_at) or 0,
    )


def require_event(db: DbSession, user: User, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise NotFoundError(MISSING_EVENT)
    if event.group_id is not None:
        if not access.is_member(db, event.group_id, user.id):
            raise NotFoundError(MISSING_EVENT)
    elif event.owner_id != user.id:
        raise NotFoundError(MISSING_EVENT)
    return event


def list_events(
    db: DbSession,
    user: User,
    *,
    starts_from: datetime | None = None,
    starts_to: datetime | None = None,
    group_id: uuid.UUID | None = None,
) -> list[EventOut]:
    group_ids = _visible_group_ids(db, user)
    condition = Event.owner_id == user.id
    if group_ids:
        condition = or_(condition, Event.group_id.in_(group_ids))
    query = select(Event).where(condition)
    if group_id is not None:
        access.require_group(db, group_id, user)
        query = query.where(Event.group_id == group_id)
    if starts_from is not None:
        query = query.where(Event.starts_at >= starts_from)
    if starts_to is not None:
        query = query.where(Event.starts_at <= starts_to)
    events = db.scalars(query.order_by(Event.starts_at)).all()
    return [event_out(event) for event in events]


def _resolve_group(db: DbSession, user: User, group_id: str | None) -> uuid.UUID | None:
    if not group_id:
        return None
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError as exc:
        raise InvalidError("That group id is not valid.") from exc
    access.require_group(db, group_uuid, user)
    return group_uuid


def create_event(db: DbSession, user: User, data: EventCreate) -> EventOut:
    starts_at = from_ms(data.startsAt)
    if starts_at is None:
        raise InvalidError("Pick a start time.")
    ends_at = from_ms(data.endsAt)
    if ends_at is not None and ends_at < starts_at:
        raise InvalidError("The end cannot be before the start.")
    event = Event(
        owner_id=user.id,
        group_id=_resolve_group(db, user, data.groupId),
        title=data.title.strip(),
        type=data.type,
        starts_at=starts_at,
        ends_at=ends_at,
        location=data.location.strip()[:300],
        reminder_minutes=data.reminderMinutes,
        notes=data.notes.strip(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    google_services.push_event(db, user, event)
    payload = event_out(event)
    if event.group_id is not None:
        email_services.send_session_notice(
            db,
            actor=user,
            event=payload,
            variant="created",
            recipient_ids=access.member_ids(db, event.group_id),
        )
    return payload


def update_event(db: DbSession, user: User, event_id: uuid.UUID, patch: EventPatch) -> EventOut:
    event = require_event(db, user, event_id)
    fields = patch.model_fields_set
    previous_starts = event.starts_at
    previous_ends = event.ends_at
    if "title" in fields and patch.title is not None:
        event.title = patch.title.strip()
    if "type" in fields and patch.type is not None:
        event.type = patch.type
    if "groupId" in fields:
        event.group_id = _resolve_group(db, user, patch.groupId)
    if "startsAt" in fields and patch.startsAt is not None:
        starts_at = from_ms(patch.startsAt)
        if starts_at is None:
            raise InvalidError("Pick a start time.")
        event.starts_at = starts_at
    if "endsAt" in fields:
        event.ends_at = from_ms(patch.endsAt)
    if event.ends_at is not None and event.ends_at < event.starts_at:
        raise InvalidError("The end cannot be before the start.")
    if "location" in fields and patch.location is not None:
        event.location = patch.location.strip()[:300]
    if "reminderMinutes" in fields and patch.reminderMinutes is not None:
        event.reminder_minutes = patch.reminderMinutes
    if "notes" in fields and patch.notes is not None:
        event.notes = patch.notes.strip()
    db.commit()
    db.refresh(event)
    google_services.push_event(db, user, event)
    payload = event_out(event)
    if event.group_id is not None and (event.starts_at != previous_starts or event.ends_at != previous_ends):
        email_services.send_session_notice(
            db,
            actor=user,
            event=payload,
            variant="moved",
            recipient_ids=access.member_ids(db, event.group_id),
        )
    return payload


def delete_event(db: DbSession, user: User, event_id: uuid.UUID) -> None:
    event = require_event(db, user, event_id)
    google_services.delete_event_twin(db, user, event)
    snapshot = event_out(event)
    recipient_ids = access.member_ids(db, event.group_id) if event.group_id is not None else []
    db.delete(event)
    db.commit()
    if recipient_ids:
        email_services.send_session_notice(
            db, actor=user, event=snapshot, variant="cancelled", recipient_ids=recipient_ids
        )


def upcoming_session_for_group(
    db: DbSession, group_id: uuid.UUID, now: datetime | None = None
) -> Event | None:
    moment = now or datetime.now(UTC)
    return db.scalar(
        select(Event)
        .where(Event.group_id == group_id, Event.type == "session", Event.starts_at >= moment)
        .order_by(Event.starts_at)
        .limit(1)
    )
