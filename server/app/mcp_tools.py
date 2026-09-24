"""MCP tools: thin wrappers over app/services/*.

Sync def tools run on a worker thread in mcp v2, so the sync SQLAlchemy
services are called directly (no FastAPI dependency layer involved). Every tool
runs as the member the verifier resolved for the request.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from .mcp_server import current_user, default_zone, get_session, mcp
from .models import TaskStatus
from .schemas.groups import GroupOut
from .schemas.notes import GroupNoteCreate, NoteCreate, NoteOut, NotePatch
from .schemas.tasks import TaskCreate, TaskOut, TaskPatch
from .services import event_services, group_services, note_services, task_services
from .services.errors import ServiceError

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)
MUTATING = ToolAnnotations(read_only_hint=False, open_world_hint=False)
DESTRUCTIVE = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False)

GroupId = Annotated[str, Field(description="The group's id.")]
TaskId = Annotated[str, Field(description="The task's id.")]
NoteId = Annotated[str, Field(description="The note's id.")]
Title = Annotated[str, Field(min_length=1, max_length=300, description="A short title.")]


def _run(action):
    """Turns service errors into sentences the model can read."""
    try:
        return action()
    except ServiceError as exc:
        raise ToolError(exc.message) from exc


def _uuid(value: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ToolError(f"That {what} id is not valid.") from exc


def _zone(name: str | None) -> ZoneInfo:
    if not name:
        return default_zone()
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ToolError(f"Unknown timezone {name!r}. Use an IANA name, e.g. Asia/Kuala_Lumpur.") from exc


def _iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=UTC).isoformat().replace("+00:00", "Z")


def _label(ms: int | None) -> str | None:
    if ms is None:
        return None
    local = datetime.fromtimestamp(ms / 1000, tz=UTC).astimezone(default_zone())
    return f"{local:%a %d %b, %H:%M}"


def _offset_minutes(moment: datetime) -> int:
    return int((moment.utcoffset() or timedelta(0)).total_seconds() // 60)


def _now_report(zone: ZoneInfo) -> dict:
    moment = datetime.now(UTC).astimezone(zone)
    start = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return {
        "utc": moment.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "unixMs": int(moment.timestamp() * 1000),
        "timezone": zone.key,
        "local": moment.isoformat(),
        "date": f"{moment:%Y-%m-%d}",
        "time": f"{moment:%H:%M}",
        "weekday": f"{moment:%A}",
        "utcOffsetMinutes": _offset_minutes(moment),
        "startOfDayMs": int(start.timestamp() * 1000),
        "endOfDayMs": int(end.timestamp() * 1000),
    }


@mcp.tool(annotations=READ_ONLY)
def now(
    timezone: Annotated[
        str | None, Field(description="IANA zone to report in; defaults to the server's.")
    ] = None,
) -> dict:
    """The current time, so dates and deadlines can be reasoned about."""
    return _now_report(_zone(timezone))


@mcp.tool(annotations=READ_ONLY)
def list_groups() -> list[GroupOut]:
    """List every group the signed-in member belongs to, with members and topics."""
    with get_session() as db:
        user = current_user(db)
        return group_services.list_groups(db, user)


@mcp.tool(annotations=READ_ONLY)
def list_tasks(
    group_id: Annotated[str | None, Field(description="Only tasks in this group.")] = None,
    status: Annotated[str | None, Field(description="todo, doing or done.")] = None,
    due_before: Annotated[
        int | None, Field(description="Only tasks due before this (ms since epoch).")
    ] = None,
) -> list[dict]:
    """List tasks the member can see: their own to-dos and their groups' tasks."""
    with get_session() as db:
        user = current_user(db)
        parsed_status = None
        if status:
            try:
                parsed_status = TaskStatus(status)
            except ValueError as exc:
                raise ToolError("Status must be todo, doing or done.") from exc
        due = datetime.fromtimestamp(due_before / 1000, tz=UTC) if due_before else None
        tasks = task_services.list_tasks(
            db,
            user,
            group_id=_uuid(group_id, "group") if group_id else None,
            status=parsed_status,
            due_before=due,
        )
        return [{**task.model_dump(mode="json"), "dueAtIso": _iso(task.dueAt)} for task in tasks]


@mcp.tool(annotations=MUTATING)
def create_task(
    title: Title,
    group_id: Annotated[str | None, Field(description="Leave out for a personal to-do.")] = None,
    due_at: Annotated[int | None, Field(description="Due time in ms since epoch.")] = None,
    priority: Annotated[str, Field(description="low, med or high.")] = "med",
    description: Annotated[str, Field(max_length=20000, description="Notes for the task.")] = "",
) -> TaskOut:
    """Create a task for the member, optionally on one of their groups."""
    with get_session() as db:
        user = current_user(db)
        payload = _run(
            lambda: task_services.create_task(
                db,
                user,
                TaskCreate(
                    title=title,
                    groupId=group_id,
                    dueAt=due_at,
                    priority=priority,  # type: ignore[arg-type]
                    description=description,
                ),
            )
        )
        return payload


@mcp.tool(annotations=MUTATING)
def update_task(
    task_id: TaskId,
    title: Annotated[str | None, Field(description="A new title.")] = None,
    status: Annotated[str | None, Field(description="todo, doing or done.")] = None,
    due_at: Annotated[int | None, Field(description="New due time in ms; 0 clears it.")] = None,
    priority: Annotated[str | None, Field(description="low, med or high.")] = None,
) -> TaskOut:
    """Change a task's title, status, due date or priority."""
    with get_session() as db:
        user = current_user(db)
        patch = TaskPatch()
        if title is not None:
            patch.title = title
        if status is not None:
            try:
                patch.status = TaskStatus(status)
            except ValueError as exc:
                raise ToolError("Status must be todo, doing or done.") from exc
        if due_at is not None:
            patch.dueAt = None if due_at == 0 else due_at
        if priority is not None:
            patch.priority = priority  # type: ignore[assignment]
        return _run(lambda: task_services.update_task(db, user, _uuid(task_id, "task"), patch))


@mcp.tool(annotations=DESTRUCTIVE)
def delete_task(task_id: TaskId) -> dict:
    """Delete a task. This cannot be undone."""
    with get_session() as db:
        user = current_user(db)
        _run(lambda: task_services.delete_task(db, user, _uuid(task_id, "task")))
        return {"ok": True}


@mcp.tool(annotations=READ_ONLY)
def upcoming(
    days: Annotated[int, Field(ge=1, le=60, description="How many days ahead to look.")] = 7,
) -> list[dict]:
    """Merged deadlines and calendar events for the next few days, soonest first."""
    with get_session() as db:
        user = current_user(db)
        now = datetime.now(UTC)
        horizon = now + timedelta(days=days)
        tasks = task_services.list_tasks(db, user, due_before=horizon)
        events = event_services.list_events(db, user, starts_from=now, starts_to=horizon)
        merged: list[dict] = [
            {
                "kind": "task",
                "id": task.id,
                "title": task.title,
                "at": task.dueAt,
                "groupId": task.groupId,
                "status": task.status,
            }
            for task in tasks
        ]
        merged.extend(
            {
                "kind": "event",
                "id": event.id,
                "title": event.title,
                "at": event.startsAt,
                "type": event.type,
                "groupId": event.groupId,
                "location": event.location,
            }
            for event in events
        )
        merged.sort(key=lambda item: item["at"] or 0)
        for item in merged:
            item["atIso"] = _iso(item["at"])
            item["atLabel"] = _label(item["at"])
        return merged


@mcp.tool(annotations=READ_ONLY)
def search_vault(
    query: Annotated[str, Field(min_length=1, description="Words to look for.")],
) -> list[NoteOut]:
    """Search the member's personal notes by title, body, URL and tags."""
    with get_session() as db:
        user = current_user(db)
        notes = note_services.list_notes(db, user, query=query)
        return notes[:20]


@mcp.tool(annotations=READ_ONLY)
def get_note(note_id: NoteId) -> NoteOut:
    """Read one note in full, including its subject or group topic."""
    with get_session() as db:
        user = current_user(db)
        note = _run(lambda: note_services.require_note(db, user, _uuid(note_id, "note")))
        return note_services.note_out(db, note)


@mcp.tool(annotations=MUTATING)
def create_note(
    title: Title,
    body: Annotated[str, Field(max_length=20000, description="The note's text.")] = "",
    group_id: Annotated[
        str | None, Field(description="Share it into this group instead of the vault.")
    ] = None,
    topic_id: Annotated[str | None, Field(description="The group topic to file it under.")] = None,
    tags: Annotated[list[str] | None, Field(description="Searchable tags.")] = None,
) -> NoteOut:
    """Create a personal note, or post one into a group the member belongs to."""
    with get_session() as db:
        user = current_user(db)
        if group_id:
            created = _run(
                lambda: note_services.create_group_note(
                    db,
                    user,
                    _uuid(group_id, "group"),
                    GroupNoteCreate(title=title, body=body, topicId=topic_id, tags=tags or []),
                )
            )
        else:
            created = _run(
                lambda: note_services.create_personal_note(
                    db, user, NoteCreate(title=title, body=body, tags=tags or [])
                )
            )
        return created


@mcp.tool(annotations=MUTATING)
def update_note(
    note_id: NoteId,
    title: Annotated[str | None, Field(description="A new title.")] = None,
    body: Annotated[str | None, Field(description="Replacement text.")] = None,
    pinned: Annotated[bool | None, Field(description="Pin it to the top of the vault.")] = None,
) -> NoteOut:
    """Change a note's title, body or pinned state."""
    with get_session() as db:
        user = current_user(db)
        patch = NotePatch()
        if title is not None:
            patch.title = title
        if body is not None:
            patch.body = body
        if pinned is not None:
            patch.pinned = pinned
        return _run(lambda: note_services.update_note(db, user, _uuid(note_id, "note"), patch))


@mcp.tool(annotations=READ_ONLY)
def list_events(
    from_ms: Annotated[
        int | None, Field(description="Only events starting after this (ms since epoch).")
    ] = None,
    to_ms: Annotated[
        int | None, Field(description="Only events starting before this (ms since epoch).")
    ] = None,
) -> list[dict]:
    """Calendar events the member can see, soonest first."""
    with get_session() as db:
        user = current_user(db)
        events = event_services.list_events(
            db,
            user,
            starts_from=datetime.fromtimestamp(from_ms / 1000, tz=UTC) if from_ms else None,
            starts_to=datetime.fromtimestamp(to_ms / 1000, tz=UTC) if to_ms else None,
        )
        return [
            {
                **event.model_dump(mode="json"),
                "startsAtIso": _iso(event.startsAt),
                "endsAtIso": _iso(event.endsAt),
            }
            for event in events
        ]


@mcp.tool(annotations=READ_ONLY)
def daily_brief() -> dict:
    """Everything needed to plan the day: today's and this week's work, and the next sessions."""
    with get_session() as db:
        user = current_user(db)
        now = datetime.now(UTC)
        end_of_today = now.replace(hour=23, minute=59, second=59, microsecond=0)
        week = now + timedelta(days=7)
        tasks = task_services.list_tasks(db, user, due_before=week)
        events = event_services.list_events(db, user, starts_from=now, starts_to=week)
        overdue = [task for task in tasks if task.dueAt and task.dueAt < int(now.timestamp() * 1000)]
        today = [
            task
            for task in tasks
            if task.dueAt
            and int(now.timestamp() * 1000) <= task.dueAt <= int(end_of_today.timestamp() * 1000)
        ]

        def task_dict(task: TaskOut) -> dict:
            return {**task.model_dump(mode="json"), "dueAtIso": _iso(task.dueAt)}

        return {
            "now": _now_report(default_zone()),
            "generatedAt": int(now.timestamp() * 1000),
            "overdue": [task_dict(task) for task in overdue],
            "dueToday": [task_dict(task) for task in today],
            "thisWeek": [task_dict(task) for task in tasks],
            "events": [
                {
                    **event.model_dump(mode="json"),
                    "startsAtIso": _iso(event.startsAt),
                    "endsAtIso": _iso(event.endsAt),
                }
                for event in events
            ],
        }
