"""Outbound email through Resend.

One choke point: send_email() takes already-rendered HTML and text. Templates
live in server/templates/emails/ and are rendered with Jinja2. Every attempt is
logged in email_log, and dedupe_key makes scheduled runs idempotent. With no
API key configured, mail is rendered and logged instead of sent, so dev and
tests never leave the machine.
"""

import base64
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import get_settings
from ..models import EmailLog, Group, Task, User
from ..schemas.events import EventOut
from ..utils import to_ms
from . import ics_services, settings_services

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
RESEND_ENDPOINT = "https://api.resend.com/emails"

_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def render(template: str, context: dict[str, Any]) -> str:
    return _env.get_template(template).render(**context)


def render_pair(name: str, context: dict[str, Any]) -> tuple[str, str]:
    """Returns (html, text) for templates/emails/<name>.html|.txt."""
    return (
        render(f"emails/{name}.html", context),
        render(f"emails/{name}.txt", context),
    )


def _deliver(
    *,
    to: str,
    subject: str,
    html: str,
    text: str,
    attachments: list[dict] | None = None,
) -> str | None:
    """The network seam; tests monkeypatch this."""
    settings = get_settings()
    payload: dict[str, Any] = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    if settings.email_reply_to:
        payload["reply_to"] = settings.email_reply_to
    if attachments:
        payload["attachments"] = attachments
    response = httpx.post(
        RESEND_ENDPOINT,
        json=payload,
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        timeout=15.0,
    )
    response.raise_for_status()
    return str(response.json().get("id") or "")


def send_email(
    db: DbSession,
    *,
    user: User,
    kind: str,
    dedupe_key: str,
    to: str | None,
    subject: str,
    html: str,
    text: str,
    attachments: list[dict] | None = None,
) -> EmailLog:
    """Renders are the caller's job; this sends, logs and never raises.

    A unique dedupe_key means a repeated run (or a retried job) is a no-op.
    """
    settings = get_settings()
    existing = db.scalar(select(EmailLog).where(EmailLog.dedupe_key == dedupe_key))
    if existing is not None:
        return existing

    recipient = settings.email_override_to.strip() or (to or user.email or "").strip()
    log = EmailLog(
        user_id=user.id,
        kind=kind,
        dedupe_key=dedupe_key,
        to_email=recipient or "unknown",
        subject=subject,
        status="logged",
    )
    if not recipient:
        log.status = "skipped"
        log.error = "No email address."
    elif not settings.email_configured:
        log.status = "logged"
    else:
        try:
            resend_id = _deliver(to=recipient, subject=subject, html=html, text=text, attachments=attachments)
            log.status = "sent"
            log.resend_id = resend_id
        except httpx.HTTPError as exc:
            # Email is best-effort: never fail the user's request for it.
            log.status = "failed"
            log.error = str(exc)[:2000]
            logger.warning("email send failed (%s): %s", kind, exc)

    db.add(log)
    db.commit()
    return log


def invite_context(
    *, group: Any, inviter: User, invite_url: str, topics: list[str]
) -> tuple[str, dict[str, Any]]:
    kind_label = "study group" if str(group.kind) == "study" else "project group"
    subject = f"{inviter.display_name} invited you to {group.name} on Neoma"
    context = {
        "subject": subject,
        "inviter_name": inviter.display_name or "Someone",
        "inviter_email": inviter.email or "",
        "group_name": group.name,
        "group_kind": kind_label,
        "group_subject": group.subject or "",
        "description": group.description or "",
        "topics": topics,
        "invite_code": group.invite_code,
        "invite_url": invite_url,
    }
    return subject, context


def send_group_invite(
    db: DbSession,
    *,
    group: Any,
    inviter: User,
    to_email: str,
    invite_url: str,
    topics: list[str] | None = None,
) -> EmailLog:
    subject, context = invite_context(
        group=group, inviter=inviter, invite_url=invite_url, topics=topics or []
    )
    html, text = render_pair("invite", context)
    return send_email(
        db,
        user=inviter,
        kind="invite",
        dedupe_key=f"invite:{group.id}:{to_email.lower()}:{group.invite_code}",
        to=to_email,
        subject=subject,
        html=html,
        text=text,
    )


# --- task and session notices ------------------------------------------------
#
# Google no longer invites anyone on Neoma's behalf: Neoma sends its own mail
# with the .ics attached and an Add-to-Google button. Everything here is
# best-effort - a failure is logged and never bubbles into the caller's request.

PRIORITY_LABELS = {"low": "Low", "med": "Medium", "high": "High"}


def _base_url() -> str:
    return get_settings().public_base_url.rstrip("/")


def _settings_url() -> str:
    return f"{_base_url()}/settings"


def _fmt_when(value: datetime) -> str:
    local = value.astimezone()
    return f"{local:%a} {local.day} {local:%b} · {local:%H:%M}"


def _group_name(db: DbSession, group_id: uuid.UUID | None) -> str:
    if group_id is None:
        return ""
    return db.scalar(select(Group.name).where(Group.id == group_id)) or ""


def _recipients(db: DbSession, actor: User, user_ids: list[uuid.UUID], *, want: str) -> list[User]:
    """The actor never emails themselves; recipients must have mail and want it."""
    people: list[User] = []
    seen: set[uuid.UUID] = set()
    for user_id in user_ids:
        if user_id in seen or user_id == actor.id:
            continue
        seen.add(user_id)
        person = db.get(User, user_id)
        if person is None or person.deleted_at is not None or not (person.email or "").strip():
            continue
        kinds = settings_services.read_settings(person).kinds
        if not (kinds.assigned if want == "task" else kinds.sessions):
            continue
        people.append(person)
    return people


def _slug(value: str) -> str:
    slug = "".join(char if char.isalnum() or char in "-_" else "-" for char in value.lower())
    return slug.strip("-")[:60] or "neoma"


def _attachment(filename: str, blocks: list[list[str]]) -> dict:
    text = ics_services.build_calendar(blocks)
    return {
        "filename": filename,
        "content": base64.b64encode(text.encode("utf-8")).decode("ascii"),
    }


def _task_context(db: DbSession, actor: User, task: Task, *, moved: bool) -> dict[str, Any]:
    actor_name = actor.display_name or "Someone"
    group_name = _group_name(db, task.group_id)
    if moved:
        subject = f"Neoma · “{task.title}” moved"
        heading = f"“{task.title}” moved"
    else:
        subject = f"{actor_name} assigned you “{task.title}”"
        heading = f"{actor_name} assigned you a task"
    blocks = ics_services.task_block(task, group_name)
    attachments = [_attachment(f"neoma-task-{_slug(task.title)}.ics", [blocks])] if blocks else None
    return {
        "subject": subject,
        "heading": heading,
        "actor_name": actor_name,
        "task_title": task.title,
        "group_name": group_name,
        "when_label": _fmt_when(task.due_at) if task.due_at is not None else "",
        "priority_label": PRIORITY_LABELS[str(task.priority)],
        "description": task.description,
        "open_url": (
            f"{_base_url()}/groups/{task.group_id}?tab=tasks" if task.group_id else f"{_base_url()}/today"
        ),
        "google_url": ics_services.task_google_url(task, group_name) or "",
        "attached": attachments is not None,
        "attachments": attachments,
        "settings_url": _settings_url(),
    }


def send_task_assignment(db: DbSession, *, actor: User, task: Task, recipient_ids: list[uuid.UUID]) -> None:
    """Tells newly added assignees they are on the hook."""
    try:
        recipients = _recipients(db, actor, recipient_ids, want="task")
        if not recipients:
            return
        context = _task_context(db, actor, task, moved=False)
        html, text = render_pair("task", context)
        for person in recipients:
            send_email(
                db,
                user=person,
                kind="assigned",
                dedupe_key=f"assigned:{task.id}:{person.id}",
                to=person.email,
                subject=context["subject"],
                html=html,
                text=text,
                attachments=context["attachments"],
            )
    except Exception:
        logger.exception("assignment email failed for task %s", task.id)


def send_task_moved(db: DbSession, *, actor: User, task: Task, recipient_ids: list[uuid.UUID]) -> None:
    """Tells the current assignees the due date changed."""
    try:
        recipients = _recipients(db, actor, recipient_ids, want="task")
        if not recipients:
            return
        context = _task_context(db, actor, task, moved=True)
        html, text = render_pair("task", context)
        due_token = str(to_ms(task.due_at)) if task.due_at is not None else "none"
        for person in recipients:
            send_email(
                db,
                user=person,
                kind="task_moved",
                dedupe_key=f"task:{task.id}:{person.id}:moved:{due_token}",
                to=person.email,
                subject=context["subject"],
                html=html,
                text=text,
                attachments=context["attachments"],
            )
    except Exception:
        logger.exception("moved email failed for task %s", task.id)


def _session_context(db: DbSession, actor: User, event: EventOut, variant: str) -> dict[str, Any]:
    actor_name = actor.display_name or "Someone"
    group_name = _group_name(db, uuid.UUID(event.groupId) if event.groupId else None)
    starts = datetime.fromtimestamp(event.startsAt / 1000, tz=UTC)
    ends = datetime.fromtimestamp(event.endsAt / 1000, tz=UTC) if event.endsAt else None
    if variant == "created":
        subject = f"Neoma · New session: {event.title}"
        heading = f"{actor_name} scheduled a session"
    elif variant == "moved":
        subject = f"Neoma · “{event.title}” moved"
        heading = f"“{event.title}” moved"
    else:
        subject = f"Neoma · “{event.title}” cancelled"
        heading = f"“{event.title}” is cancelled"
    cancelled = variant == "cancelled"
    attachments = None
    google_url = ""
    if not cancelled:
        google_url = ics_services.google_url(
            title=event.title,
            starts_at=starts,
            ends_at=ends,
            group_name=group_name,
            location=event.location,
            neoma_id=event.id,
        )
        attachments = [
            _attachment(
                f"neoma-session-{_slug(event.title)}.ics",
                [ics_services.event_block(event, group_name)],
            )
        ]
    return {
        "subject": subject,
        "heading": heading,
        "actor_name": actor_name,
        "event_title": event.title,
        "group_name": group_name,
        "when_label": _fmt_when(starts),
        "location": event.location,
        "notes": event.notes,
        "open_url": f"{_base_url()}/calendar",
        "google_url": google_url,
        "attached": attachments is not None,
        "attachments": attachments,
        "cancelled": cancelled,
        "settings_url": _settings_url(),
    }


def send_session_notice(
    db: DbSession,
    *,
    actor: User,
    event: EventOut,
    variant: str,
    recipient_ids: list[uuid.UUID],
) -> None:
    """A group event was created, moved or cancelled."""
    try:
        recipients = _recipients(db, actor, recipient_ids, want="session")
        if variant == "cancelled":
            # Only the people who heard about it in the first place.
            notified = set(
                db.scalars(
                    select(EmailLog.user_id).where(EmailLog.dedupe_key.like(f"session:{event.id}:%"))
                ).all()
            )
            recipients = [person for person in recipients if person.id in notified]
        if not recipients:
            return
        context = _session_context(db, actor, event, variant)
        html, text = render_pair("session", context)
        for person in recipients:
            if variant == "created":
                key = f"session:{event.id}:{person.id}:created"
            elif variant == "moved":
                key = f"session:{event.id}:{person.id}:moved:{event.startsAt}"
            else:
                key = f"session:{event.id}:{person.id}:cancelled"
            send_email(
                db,
                user=person,
                kind="session",
                dedupe_key=key,
                to=person.email,
                subject=context["subject"],
                html=html,
                text=text,
                attachments=context["attachments"],
            )
    except Exception:
        logger.exception("session email failed for event %s", event.id)
