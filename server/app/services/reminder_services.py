"""Reminder digests and maintenance jobs.

One service function per job, exposed twice: a CLI under server/scripts/ and a
secret-header endpoint under /api/maintenance/. Both are idempotent and support
dry runs, so a cron (Cloud Scheduler, GitHub Actions, a laptop) can drive them.
"""

import hmac
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import get_settings
from ..models import EmailLog, FileObject, Note, User
from ..models import Session as SessionRow
from ..services import email_services, file_services, notification_services, storage_services

DIGEST_GROUPS = ("overdue", "due", "sessions", "assigned", "exams", "notes")
ORPHAN_FILE_HOURS = 24


def unsubscribe_token(user: User) -> str:
    settings = get_settings()
    return hmac.new(settings.app_secret.encode(), f"unsubscribe:{user.id}".encode(), "sha256").hexdigest()[
        :40
    ]


def unsubscribe_url(user: User) -> str:
    settings = get_settings()
    base = settings.public_base_url.rstrip("/")
    return f"{base}/api/email/unsubscribe?token={unsubscribe_token(user)}&user={user.id}"


def send_reminders(db: DbSession, *, dry_run: bool = False, now: datetime | None = None) -> dict[str, int]:
    """One digest per user per day, deduped through email_log."""
    moment = now or datetime.now(UTC)
    settings = get_settings()
    base = settings.public_base_url.rstrip("/")
    sent = skipped = failed = 0

    users = db.scalars(select(User).where(User.deleted_at.is_(None), User.email.is_not(None))).all()
    for user in users:
        items = [item for item in notification_services.derive(db, user, now=moment) if not item.read]
        if not items:
            skipped += 1
            continue

        groups = []
        for key in DIGEST_GROUPS:
            group_items = [item for item in items if item.group == key]
            if group_items:
                groups.append(
                    {
                        "label": notification_services.GROUP_LABELS[key],
                        "entries": [
                            {"title": item.title, "body": item.body, "tone": item.tone}
                            for item in group_items
                        ],
                    }
                )

        context = {
            "subject": f"Neoma · {len(items)} thing{'s' if len(items) != 1 else ''} to look at",
            "heading": f"Good morning, {user.display_name.split(' ')[0] if user.display_name else 'there'}",
            "date_label": f"{moment:%A} {moment.day} {moment:%B}",
            "groups": groups,
            "notifications_url": f"{base}/notifications",
            "unsubscribe_url": unsubscribe_url(user),
        }
        html, text = email_services.render_pair("digest", context)
        dedupe_key = f"digest:{user.id}:{moment.date().isoformat()}"
        if dry_run:
            sent += 1
            continue
        # One digest per user per day; a repeated run is a no-op.
        if db.scalar(select(EmailLog.id).where(EmailLog.dedupe_key == dedupe_key)) is not None:
            skipped += 1
            continue
        log = email_services.send_email(
            db,
            user=user,
            kind="digest",
            dedupe_key=dedupe_key,
            to=user.email,
            subject=str(context["subject"]),
            html=html,
            text=text,
        )
        if log.status == "failed":
            failed += 1
        elif log.status in {"sent", "logged"}:
            sent += 1
        else:
            skipped += 1

    return {"users": len(users), "sent": sent, "skipped": skipped, "failed": failed}


def purge_expired(db: DbSession, *, dry_run: bool = False, now: datetime | None = None) -> dict[str, int]:
    """Deletes dead sessions (revoked or expired) and expired guest rows."""
    moment = now or datetime.now(UTC)
    dead = list(
        db.scalars(
            select(SessionRow).where(
                (SessionRow.expires_at <= moment)
                | (SessionRow.revoked_at.is_not(None) & (SessionRow.revoked_at <= moment - timedelta(days=1)))
            )
        )
    )
    guests = list(
        db.scalars(
            select(User).where(
                User.guest_expires_at.is_not(None), User.guest_expires_at <= moment, User.deleted_at.is_(None)
            )
        )
    )
    if not dry_run:
        for row in dead:
            db.delete(row)
        for guest in guests:
            db.delete(guest)
        db.commit()
    return {"sessions": len(dead), "guests": len(guests)}


def purge_orphan_files(
    db: DbSession,
    storage: storage_services.Storage,
    *,
    dry_run: bool = False,
    older_than_hours: int = ORPHAN_FILE_HOURS,
    now: datetime | None = None,
) -> dict[str, int]:
    """Blobs whose reserved row never became a note (abandoned direct uploads).

    A row is created before the browser PUTs to R2; if the upload or the
    confirm call never lands, nothing references the row. The grace window
    keeps a file safe while it is still being attached.
    """
    moment = now or datetime.now(UTC)
    cutoff = moment - timedelta(hours=older_than_hours)
    orphans = list(
        db.scalars(
            select(FileObject)
            .where(FileObject.created_at <= cutoff)
            .where(~FileObject.id.in_(select(Note.file_id).where(Note.file_id.is_not(None))))
        )
    )
    if not dry_run:
        for file in orphans:
            file_services.purge_file(db, storage, file)
        db.commit()
    return {"files": len(orphans)}


def check_secret(provided: str | None) -> bool:
    settings = get_settings()
    if not settings.cleanup_secret:
        return False
    return hmac.compare_digest(provided or "", settings.cleanup_secret)


__all__ = [
    "check_secret",
    "purge_expired",
    "purge_orphan_files",
    "send_reminders",
    "unsubscribe_token",
    "unsubscribe_url",
]
