"""Outbound email through Resend.

One choke point: send_email() takes already-rendered HTML and text. Templates
live in server/templates/emails/ and are rendered with Jinja2. Every attempt is
logged in email_log, and dedupe_key makes scheduled runs idempotent. With no
API key configured, mail is rendered and logged instead of sent, so dev and
tests never leave the machine.
"""

import logging
from pathlib import Path
from typing import Any

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import get_settings
from ..models import EmailLog, User

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


def _deliver(*, to: str, subject: str, html: str, text: str) -> str | None:
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
            resend_id = _deliver(to=recipient, subject=subject, html=html, text=text)
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
