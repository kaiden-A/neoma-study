"""Derived notifications, exactly the prototype's rules.

Nothing is stored except read/snooze state: items are computed from tasks,
events and notes on every read, keyed by a stable id that encodes the condition
(`overdue:{task}`, `due:{task}:{lead}`, `session:{event}:{1h|lead}`,
`assigned:{task}:{user}`, `exam:{event}:{days}`, `note:{note}`).
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from ..models import Event, Group, GroupMember, Note, NoteScope, NotificationState, Task, TaskStatus, User
from ..schemas.notifications import NotificationOut
from ..services import settings_services
from ..utils import to_ms

EXAM_MILESTONES = (7, 3, 2, 1, 0)
NOTE_FRESHNESS_DAYS = 14

GROUP_LABELS = {
    "overdue": "Overdue",
    "due": "Due soon",
    "sessions": "Study sessions",
    "assigned": "Assigned to you",
    "exams": "Exams",
    "notes": "Shared with you",
}

GROUP_ICONS = {
    "overdue": "fa-circle-exclamation",
    "due": "fa-hourglass-half",
    "sessions": "fa-book-open-reader",
    "assigned": "fa-user-check",
    "exams": "fa-graduation-cap",
    "notes": "fa-note-sticky",
}

PRIORITIES = {"overdue": 0, "due": 1, "sessions": 1, "assigned": 2, "exams": 2, "notes": 4}


def _visible_group_ids(db: DbSession, user: User) -> list[uuid.UUID]:
    return list(db.scalars(select(GroupMember.group_id).where(GroupMember.user_id == user.id)).all())


def _group_names(db: DbSession, group_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not group_ids:
        return {}
    rows = db.execute(select(Group.id, Group.name).where(Group.id.in_(group_ids))).all()
    return {row[0]: row[1] for row in rows}


def _route_for(task: Task | None = None, group_id: uuid.UUID | None = None, tab: str = "tasks") -> str:
    if task is not None and task.group_id:
        return f"/groups/{task.group_id}?tab=tasks"
    if task is not None:
        return "/today"
    if group_id is not None:
        return f"/groups/{group_id}?tab={tab}"
    return "/calendar"


def _state_map(db: DbSession, user: User) -> dict[str, NotificationState]:
    rows = db.scalars(select(NotificationState).where(NotificationState.user_id == user.id)).all()
    return {row.key: row for row in rows}


def derive(db: DbSession, user: User, *, now: datetime | None = None) -> list[NotificationOut]:
    moment = now or datetime.now(UTC)
    settings = settings_services.read_settings(user)
    kinds = settings.kinds
    lead = timedelta(hours=settings.leadTimeHours)
    states = _state_map(db, user)

    group_ids = _visible_group_ids(db, user)
    task_condition = Task.owner_id == user.id
    if group_ids:
        task_condition = or_(task_condition, Task.group_id.in_(group_ids))
    tasks = list(db.scalars(select(Task).where(task_condition)).all())
    names = _group_names(db, {task.group_id for task in tasks if task.group_id})

    event_condition = Event.owner_id == user.id
    if group_ids:
        event_condition = or_(event_condition, Event.group_id.in_(group_ids))
    events = list(db.scalars(select(Event).where(event_condition)).all())
    names.update(_group_names(db, {event.group_id for event in events if event.group_id}))

    note_condition = Note.scope == NoteScope.group
    if group_ids:
        note_condition = note_condition & Note.group_id.in_(group_ids)
    else:
        note_condition = note_condition & Note.id.is_(None)
    notes = list(db.scalars(select(Note).where(note_condition)).all())
    names.update(_group_names(db, {note.group_id for note in notes if note.group_id}))

    items: list[NotificationOut] = []

    def add(
        *,
        key: str,
        group: str,
        title: str,
        body: str,
        at: datetime,
        route: str,
        tone: str = "muted",
    ) -> None:
        state = states.get(key)
        items.append(
            NotificationOut(
                id=key,
                group=group,  # type: ignore[arg-type]
                title=title,
                body=body,
                tone=tone,  # type: ignore[arg-type]
                icon=GROUP_ICONS[group],
                at=to_ms(at) or 0,
                route=route,
                read=bool(state and state.read_at),
                snoozedUntil=to_ms(state.snoozed_until) if state else None,
            )
        )

    # Overdue + due soon (all tasks the user can see, personal and group).
    for task in tasks:
        if task.status is TaskStatus.done or task.due_at is None:
            continue
        group_name = names.get(task.group_id, "") if task.group_id else ""
        suffix = f" · {group_name}" if group_name else ""
        if kinds.overdue and task.due_at < moment:
            add(
                key=f"overdue:{task.id}",
                group="overdue",
                title=task.title,
                body=f"Overdue · {_fmt_dt(task.due_at)}{suffix}",
                at=task.due_at,
                route=_route_for(task),
                tone="danger",
            )
        elif kinds.dueSoon and task.due_at <= moment + lead:
            hours = max(1, round((task.due_at - moment).total_seconds() / 3600))
            label = f"Due today · {_fmt_time(task.due_at)}" if hours <= 24 else f"Due in {hours}h"
            add(
                key=f"due:{task.id}:{settings.leadTimeHours}",
                group="due",
                title=task.title,
                body=f"{label}{suffix}",
                at=task.due_at,
                route=_route_for(task),
                tone="today" if hours <= 24 else "muted",
            )

    # Assigned to you (someone else created it).
    if kinds.assigned:
        for task in tasks:
            if task.status is TaskStatus.done or task.created_by == user.id:
                continue
            if not any(assignee.user_id == user.id for assignee in task.assignees):
                continue
            group_name = names.get(task.group_id, "") if task.group_id else ""
            creator = _user_name(db, task.created_by)
            due = f" · due {_fmt_dt(task.due_at)}" if task.due_at else ""
            add(
                key=f"assigned:{task.id}:{user.id}",
                group="assigned",
                title=task.title,
                body=f"{creator} put this on you{(' · ' + group_name) if group_name else ''}{due}",
                at=task.created_at,
                route=_route_for(task),
            )

    # Sessions (group only, inside the lead window) and exams at milestones.
    for event in events:
        group_name = names.get(event.group_id, "") if event.group_id else ""
        suffix = f" · {group_name}" if group_name else ""
        if kinds.sessions and event.group_id is not None and event.type == "session":
            delta = event.starts_at - moment
            if timedelta(0) <= delta <= lead:
                urgent = delta <= timedelta(hours=1)
                when = "Starts in under an hour" if urgent else f"Today at {_fmt_time(event.starts_at)}"
                add(
                    key=f"session:{event.id}:{'1h' if urgent else settings.leadTimeHours}",
                    group="sessions",
                    title=event.title,
                    body=f"{when}{suffix}",
                    at=event.starts_at,
                    route="/calendar",
                    tone="today" if urgent else "muted",
                )
        if kinds.exams and event.type == "exam":
            days = (event.starts_at.date() - moment.date()).days
            if days in EXAM_MILESTONES:
                label = (
                    f"Today · {_fmt_time(event.starts_at)}"
                    if days == 0
                    else f"In {days} day{'s' if days != 1 else ''} · {_fmt_time(event.starts_at)}"
                )
                add(
                    key=f"exam:{event.id}:{days}",
                    group="exams",
                    title=event.title,
                    body=f"{label}{suffix}",
                    at=event.starts_at,
                    route="/calendar",
                    tone="danger" if days <= 1 else "muted",
                )

    # Shared notes: group notes from someone else, within the freshness window.
    if kinds.notes:
        cutoff = moment - timedelta(days=NOTE_FRESHNESS_DAYS)
        for note in notes:
            if note.created_by == user.id or note.created_at < cutoff:
                continue
            group_name = names.get(note.group_id, "") if note.group_id else ""
            suffix = f" · {group_name}" if group_name else ""
            add(
                key=f"note:{note.id}",
                group="notes",
                title=note.title,
                body=f"{_user_name(db, note.created_by)} shared a note{suffix}",
                at=note.created_at,
                route=f"/groups/{note.group_id}?tab=notes",
            )

    now_ms = to_ms(moment) or 0
    visible = [item for item in items if not (item.snoozedUntil and item.snoozedUntil > now_ms)]
    visible.sort(key=lambda item: PRIORITIES[item.group] * 10**13 + item.at)
    return visible


def unread_count(db: DbSession, user: User) -> int:
    return len([item for item in derive(db, user) if not item.read])


def mark_read(db: DbSession, user: User, keys: list[str]) -> None:
    moment = datetime.now(UTC)
    existing = _state_map(db, user)
    for key in keys:
        state = existing.get(key)
        if state is None:
            state = NotificationState(user_id=user.id, key=key)
            db.add(state)
        state.read_at = moment
    db.commit()


def mark_all_read(db: DbSession, user: User) -> None:
    mark_read(db, user, [item.id for item in derive(db, user)])


def snooze(db: DbSession, user: User, key: str, *, minutes: int) -> None:
    moment = datetime.now(UTC)
    existing = _state_map(db, user)
    state = existing.get(key)
    if state is None:
        state = NotificationState(user_id=user.id, key=key)
        db.add(state)
    state.snoozed_until = moment + timedelta(minutes=minutes)
    db.commit()


def _user_name(db: DbSession, user_id: uuid.UUID | None) -> str:
    if user_id is None:
        return "Someone"
    user = db.get(User, user_id)
    return (user.display_name if user else None) or "Someone"


def _fmt_time(value: datetime) -> str:
    return value.astimezone().strftime("%H:%M")


def _fmt_dt(value: datetime) -> str:
    local = value.astimezone()
    return f"{local:%a} {local.day} {local:%b} · {local:%H:%M}"
