"""iCalendar export, ported from the prototype's ics.js.

Everything with a date is exported: real events plus task deadlines (as 30
minute blocks). Reminders become VALARM triggers; Google gets a template link
instead of a file.
"""

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from ..models import Event, Task
from ..schemas.events import EventOut
from ..utils import to_ms

PRODID = "-//Neoma//Study OS//EN"
CALENDAR_NAME = "Neoma — Study"
DEFAULT_BLOCK_MINUTES = 30
DEFAULT_REMINDER_MINUTES = 60


def stamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str | None) -> str:
    if not text:
        return ""
    return (
        str(text)
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    if len(line) <= 74:
        return line
    chunks = [line[index : index + 73] for index in range(0, len(line), 73)]
    return "\r\n ".join(chunks)


def _event_lines(
    *,
    uid: str,
    title: str,
    starts_at: datetime,
    ends_at: datetime | None,
    group_name: str,
    location: str,
    notes: str,
    reminder_minutes: int | None,
    now: datetime,
) -> list[str]:
    end = ends_at or (starts_at + timedelta(minutes=DEFAULT_BLOCK_MINUTES))
    description_parts = [f"Group: {group_name}"] if group_name else []
    if notes:
        description_parts.append(notes)
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{stamp(now)}",
        f"DTSTART:{stamp(starts_at)}",
        f"DTEND:{stamp(end)}",
        _fold(f"SUMMARY:{_escape(title)}"),
    ]
    if description_parts:
        lines.append(_fold(f"DESCRIPTION:{_escape(chr(10).join(description_parts))}"))
    if location:
        lines.append(_fold(f"LOCATION:{_escape(location)}"))
    reminder = DEFAULT_REMINDER_MINUTES if reminder_minutes is None else reminder_minutes
    if reminder > 0:
        lines.extend(
            [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"DESCRIPTION:{_escape(title)}",
                f"TRIGGER:-PT{reminder}M",
                "END:VALARM",
            ]
        )
    lines.append("END:VEVENT")
    return lines


def build_calendar(lines: list[list[str]], *, now: datetime | None = None) -> str:
    moment = now or datetime.now(UTC)
    header = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{CALENDAR_NAME}",
    ]
    body: list[str] = []
    for block in lines:
        body.extend(block)
    del moment
    return "\r\n".join([*header, *body, "END:VCALENDAR"])


def event_block(event: EventOut, group_name: str, *, now: datetime | None = None) -> list[str]:
    moment = now or datetime.now(UTC)
    return _event_lines(
        uid=f"{event.id}@neoma.local",
        title=event.title,
        starts_at=datetime.fromtimestamp(event.startsAt / 1000, tz=UTC),
        ends_at=datetime.fromtimestamp(event.endsAt / 1000, tz=UTC) if event.endsAt else None,
        group_name=group_name,
        location=event.location,
        notes=event.notes,
        reminder_minutes=event.reminderMinutes,
        now=moment,
    )


def task_block(task: Task, group_name: str, *, now: datetime | None = None) -> list[str] | None:
    if task.due_at is None:
        return None
    moment = now or datetime.now(UTC)
    return _event_lines(
        uid=f"task:{task.id}@neoma.local",
        title=task.title,
        starts_at=task.due_at,
        ends_at=None,
        group_name=group_name,
        location="",
        notes="",
        reminder_minutes=DEFAULT_REMINDER_MINUTES,
        now=moment,
    )


def build_from_rows(
    *,
    events: list[tuple[Event, str]],
    tasks: list[tuple[Task, str]],
    now: datetime | None = None,
) -> str:
    blocks: list[list[str]] = []
    for event, group_name in events:
        blocks.append(event_block(_event_out(event), group_name, now=now))
    for task, group_name in tasks:
        block = task_block(task, group_name, now=now)
        if block is not None:
            blocks.append(block)
    return build_calendar(blocks, now=now)


def _event_out(event: Event) -> EventOut:
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


def google_url(
    *,
    title: str,
    starts_at: datetime,
    ends_at: datetime | None,
    group_name: str,
    location: str,
) -> str:
    end = ends_at or (starts_at + timedelta(minutes=DEFAULT_BLOCK_MINUTES))
    details_parts = [f"Group: {group_name}"] if group_name else []
    details_parts.append("Added from Neoma")
    params = {
        "action": "TEMPLATE",
        "text": title,
        "dates": f"{stamp(starts_at)}/{stamp(end)}",
        "details": "\n".join(details_parts),
    }
    if location:
        params["location"] = location
    return f"https://calendar.google.com/calendar/render?{urlencode(params)}"
