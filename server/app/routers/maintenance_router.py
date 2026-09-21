from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy.orm import Session as DbSession

from ..config import get_settings
from ..database import get_db
from ..models import User
from ..services import reminder_services, settings_services

router = APIRouter(prefix="/api", tags=["maintenance"])


def _require_secret(x_cleanup_secret: str | None) -> None:
    if not reminder_services.check_secret(x_cleanup_secret):
        raise HTTPException(status_code=403, detail="Not allowed.")


@router.post("/maintenance/send-reminders")
def send_reminders(
    dry_run: bool = Query(default=False),
    x_cleanup_secret: str | None = Header(default=None),
    db: DbSession = Depends(get_db),
) -> dict[str, int]:
    """Drives the reminder digest from a scheduler. Secret header only."""
    _require_secret(x_cleanup_secret)
    return reminder_services.send_reminders(db, dry_run=dry_run)


@router.post("/maintenance/cleanup")
def cleanup(
    dry_run: bool = Query(default=False),
    x_cleanup_secret: str | None = Header(default=None),
    db: DbSession = Depends(get_db),
) -> dict[str, int]:
    """Deletes dead sessions and expired guest rows. Secret header only."""
    _require_secret(x_cleanup_secret)
    return reminder_services.purge_expired(db, dry_run=dry_run)


@router.get("/email/unsubscribe")
def unsubscribe(
    token: str = Query(...),
    user: str = Query(...),
    db: DbSession = Depends(get_db),
) -> Response:
    """The one-click link in every digest: turns reminder emails off."""
    import uuid

    try:
        user_id = uuid.UUID(user)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found.") from None
    account = db.get(User, user_id)
    if account is None or token != reminder_services.unsubscribe_token(account):
        raise HTTPException(status_code=404, detail="Not found.")

    patch = settings_services.UserSettingsPatch()
    patch.kinds = settings_services.NotificationKinds(
        overdue=False, dueSoon=False, assigned=False, sessions=False, exams=False, notes=False
    )
    settings_services.update_settings(db, account, patch)
    settings_url = f"{get_settings().public_base_url.rstrip('/')}/settings"
    body = (
        "<!doctype html><meta charset='utf-8'><title>Unsubscribed</title>"
        "<body style=\"font-family:-apple-system,'Segoe UI',Roboto,sans-serif;"
        'background:#EFF1EC;color:#171C1A;padding:48px;text-align:center">'
        '<h1 style="font-size:20px">Reminder emails are off</h1>'
        '<p style="color:#5A655F">You can turn them back on any time in '
        "Neoma → Settings → Notifications.</p>"
        f'<p><a href="{settings_url}" style="color:#171C1A">Open settings</a></p>'
    )
    return Response(body, media_type="text/html")
