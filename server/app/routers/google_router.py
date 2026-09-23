"""Google Calendar OAuth. The secret stays server-side; the browser only ever
talks to this origin, and the callback binds the handshake to the session."""

import time

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session as DbSession

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import current_user, require_user
from ..models import User
from ..services import google_services
from ..services.security import sign_payload, unsign_payload

router = APIRouter(prefix="/api/google", tags=["google"])


def _to_settings(settings: Settings, state: str) -> RedirectResponse:
    base = settings.public_base_url.rstrip("/")
    return RedirectResponse(f"{base}/settings?google={state}", status_code=302)


@router.get("/connect")
def connect(
    user: User = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    if not settings.google_configured:
        return _to_settings(settings, "unconfigured")
    state = sign_payload({"user_id": str(user.id), "iat": int(time.time())}, settings.app_secret)
    return RedirectResponse(google_services.client(settings).authorize_url(state=state), status_code=302)


@router.get("/callback")
def callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    user: User | None = Depends(current_user),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    if error:
        return _to_settings(settings, "error")
    if user is None:
        return RedirectResponse(
            f"{settings.public_base_url.rstrip('/')}/login?next=/settings", status_code=302
        )
    payload = unsign_payload(state, settings.app_secret, max_age=google_services.STATE_MAX_AGE)
    if payload is None or not code or str(payload.get("user_id")) != str(user.id):
        return _to_settings(settings, "error")
    if not settings.google_configured:
        return _to_settings(settings, "unconfigured")

    api = google_services.client(settings)
    try:
        tokens = api.exchange_code(code=code)
        access = tokens.get("access_token")
        if not access:
            raise google_services.GoogleError("token response had no access token")
        info = api.userinfo(access)
        google_services.connect_user(db, user, tokens=tokens, info=info)
    except (google_services.GoogleError, httpx.HTTPError):
        return _to_settings(settings, "error")
    return _to_settings(settings, "connected")


@router.post("/disconnect")
def disconnect(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> dict[str, bool]:
    google_services.disconnect(db, user)
    return {"ok": True}


@router.post("/sync")
def sync(
    auto: bool = Query(default=False),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> dict[str, int]:
    """Manual "Sync now" (auto=false) or the once-a-day client auto-sync."""
    return google_services.sync_user(db, user, auto=auto)
