"""Google Calendar: OAuth connect, push, and pull.

The OAuth client secret never leaves this process; refresh and access tokens
are encrypted at rest with a key derived from APP_SECRET. Push is best-effort
on purpose: a Google outage must never fail a user's request.
"""

import base64
import hashlib
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from ..config import Settings, get_settings
from ..models import Event, GoogleAccount, Group, GroupMember, Task, TaskAssignee, TaskStatus, User
from ..models.enums import EventType
from ..models.users import utcnow
from ..utils import to_ms
from . import ics_services, settings_services
from .errors import InvalidError, UnavailableError

log = logging.getLogger(__name__)

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"
SCOPE = "openid email https://www.googleapis.com/auth/calendar.events"
STATE_MAX_AGE = 600
# Pull window on the first sync; later syncs use the incremental syncToken.
SYNC_PAST_DAYS = 90
SYNC_FUTURE_DAYS = 365
# On connect/backfill, push events this far back and everything ahead.
BACKFILL_PAST_DAYS = 30
# A second auto-sync request (another tab or device) inside this window is a no-op.
AUTO_SYNC_WINDOW = timedelta(minutes=15)


class GoogleError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None) -> None:
        self.status = status
        super().__init__(message)


class GoogleAuthError(GoogleError):
    """The refresh token was revoked or is otherwise no longer usable."""


class GoogleNotFound(GoogleError):
    """The Google twin is gone (404/410); re-inserting is the right move."""


class SyncTokenExpired(GoogleError):
    """Google rejects the incremental cursor; a full resync is needed."""


@dataclass
class GoogleClient:
    client_id: str
    client_secret: str
    redirect_uri: str
    http: httpx.Client

    def authorize_url(self, *, state: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            # Force a refresh token on every connect, including reconnects.
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{AUTH_ENDPOINT}?{urlencode(params)}"

    def exchange_code(self, *, code: str) -> dict:
        return self._tokens(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.redirect_uri,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }
        )

    def refresh(self, *, refresh_token: str) -> dict:
        return self._tokens(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }
        )

    def userinfo(self, access_token: str) -> dict:
        response = self.http.get(USERINFO_ENDPOINT, headers=_headers(access_token))
        _check(response, "userinfo")
        return dict(response.json())

    def list_events(
        self,
        access_token: str,
        *,
        sync_token: str | None = None,
        page_token: str | None = None,
        time_min: str | None = None,
        time_max: str | None = None,
    ) -> dict:
        params: dict[str, str | int] = {
            "maxResults": 250,
            "singleEvents": "true",
            "showDeleted": "true",
        }
        if sync_token:
            params["syncToken"] = sync_token
        if page_token:
            params["pageToken"] = page_token
        if time_min:
            params["timeMin"] = time_min
        if time_max:
            params["timeMax"] = time_max
        response = self.http.get(
            f"{CALENDAR_API}/calendars/primary/events", params=params, headers=_headers(access_token)
        )
        if response.status_code == 410:
            raise SyncTokenExpired(_error_message(response), status=410)
        _check(response, "events.list")
        return dict(response.json())

    def insert_event(self, access_token: str, body: dict) -> dict:
        response = self.http.post(
            f"{CALENDAR_API}/calendars/primary/events",
            params={"sendUpdates": "all"},
            json=body,
            headers=_headers(access_token),
        )
        _check(response, "events.insert")
        return dict(response.json())

    def patch_event(self, access_token: str, google_event_id: str, body: dict) -> dict:
        response = self.http.patch(
            f"{CALENDAR_API}/calendars/primary/events/{google_event_id}",
            params={"sendUpdates": "all"},
            json=body,
            headers=_headers(access_token),
        )
        _check(response, "events.patch")
        return dict(response.json())

    def delete_event(self, access_token: str, google_event_id: str) -> None:
        response = self.http.delete(
            f"{CALENDAR_API}/calendars/primary/events/{google_event_id}",
            params={"sendUpdates": "all"},
            headers=_headers(access_token),
        )
        if response.status_code in (404, 410):
            raise GoogleNotFound(_error_message(response), status=response.status_code)
        _check(response, "events.delete")

    def _tokens(self, payload: dict) -> dict:
        response = self.http.post(TOKEN_ENDPOINT, data=payload)
        if response.status_code >= 400:
            message = _error_message(response)
            if message == "invalid_grant":
                raise GoogleAuthError(message, status=response.status_code)
            raise GoogleError(
                f"token request failed ({response.status_code}): {message}",
                status=response.status_code,
            )
        return dict(response.json())


def client(settings: Settings | None = None) -> GoogleClient:
    resolved = settings or get_settings()
    return GoogleClient(
        client_id=resolved.google_client_id,
        client_secret=resolved.google_client_secret,
        redirect_uri=resolved.google_redirect_uri,
        http=httpx.Client(timeout=15.0),
    )


def account_for(db: DbSession, user: User | None) -> GoogleAccount | None:
    if user is None:
        return None
    return db.scalar(select(GoogleAccount).where(GoogleAccount.user_id == user.id))


def connect_user(db: DbSession, user: User, *, tokens: dict, info: dict) -> GoogleAccount:
    account = account_for(db, user)
    if account is None:
        account = GoogleAccount(user_id=user.id)
        db.add(account)
    account.google_sub = str(info.get("sub") or account.google_sub or "")[:64]
    account.email = str(info.get("email") or account.email or "")[:320]
    refresh = tokens.get("refresh_token")
    if refresh:
        account.refresh_token = _encrypt(refresh)
    if account.refresh_token is None:
        raise GoogleError("Google did not return a refresh token; try connecting again.")
    access = tokens.get("access_token")
    account.access_token = _encrypt(access) if access else None
    expires_in = tokens.get("expires_in")
    account.access_token_expires_at = utcnow() + timedelta(seconds=int(expires_in)) if expires_in else None
    account.sync_token = None
    db.commit()
    db.refresh(account)
    _write_google_settings(db, user, status="connected", email=account.email, last_sync_at=None)
    return account


def disconnect(db: DbSession, user: User) -> None:
    account = account_for(db, user)
    if account is not None:
        db.delete(account)
        db.commit()
    _write_google_settings(db, user, status="disconnected", email=None, last_sync_at=None)


def push_event(db: DbSession, user: User, event: Event) -> None:
    """Best-effort mirror of one event to the owner's connected calendar."""
    try:
        _push_event(db, user, event)
    except (GoogleError, httpx.HTTPError, ValueError) as exc:
        log.warning("Google push failed for event %s: %s", event.id, exc)


def delete_event_twin(db: DbSession, user: User, event: Event) -> None:
    """Best-effort removal of the Google copy before the local row goes away."""
    if not event.google_event_id:
        return
    try:
        owner = db.get(User, event.owner_id) if event.owner_id else None
        account = account_for(db, owner)
        if account is None:
            return
        token = _access_token(db, account)
        if token is None:
            return
        client().delete_event(token, event.google_event_id)
    except GoogleNotFound:
        pass
    except (GoogleError, httpx.HTTPError) as exc:
        log.warning("Google delete failed for event %s: %s", event.id, exc)


def push_task(db: DbSession, user: User, task: Task) -> None:
    """Best-effort mirror of one task to the organizer's connected calendar."""
    try:
        _push_task(db, user, task)
    except (GoogleError, httpx.HTTPError, ValueError) as exc:
        log.warning("Google push failed for task %s: %s", task.id, exc)


def delete_task_twin(db: DbSession, user: User, task: Task) -> None:
    """Best-effort removal of the Google copy before the local row goes away."""
    if not task.google_event_id:
        return
    try:
        account = _organizer_account(db, task)
        if account is None:
            return
        token = _access_token(db, account)
        if token is None:
            return
        client().delete_event(token, task.google_event_id)
    except GoogleNotFound:
        pass
    except (GoogleError, httpx.HTTPError) as exc:
        log.warning("Google delete failed for task %s: %s", task.id, exc)


def sync_user(db: DbSession, user: User, *, auto: bool = False) -> dict[str, int]:
    if not get_settings().google_configured:
        raise UnavailableError("Google Calendar is not configured on the server.")
    account = account_for(db, user)
    if account is None:
        raise InvalidError("Connect Google Calendar first.")
    if auto and account.last_sync_at is not None:
        last = account.last_sync_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        # Two tabs opening at once should produce one sync, not two.
        if utcnow() - last < AUTO_SYNC_WINDOW:
            return {"pushed": 0, "pulled": 0, "skipped": 1}
    return sync_account(db, account)


def sync_account(
    db: DbSession, account: GoogleAccount, *, dry_run: bool = False, now: datetime | None = None
) -> dict[str, int]:
    moment = now or utcnow()
    settings = get_settings()
    user = db.get(User, account.user_id)
    if not settings.google_configured or user is None or user.deleted_at is not None:
        return {"pushed": 0, "pulled": 0, "skipped": 1}
    token = _access_token(db, account)
    if token is None:
        return {"pushed": 0, "pulled": 0, "skipped": 1}
    pushed = _backfill(db, user, moment) if not dry_run else 0
    api = client(settings)
    pulled = _pull(db, account, api, token, dry_run=dry_run, now=moment)
    if not dry_run:
        account.last_sync_at = moment
        db.commit()
        _write_google_settings(db, user, status="connected", email=account.email, last_sync_at=to_ms(moment))
    return {"pushed": pushed, "pulled": pulled}


def sync_all(db: DbSession, *, dry_run: bool = False, now: datetime | None = None) -> dict[str, int]:
    accounts = db.scalars(select(GoogleAccount)).all()
    totals = {"accounts": len(accounts), "pushed": 0, "pulled": 0, "failed": 0}
    for account in accounts:
        try:
            result = sync_account(db, account, dry_run=dry_run, now=now)
        except (GoogleError, httpx.HTTPError) as exc:
            log.warning("Google sync failed for account %s: %s", account.id, exc)
            totals["failed"] += 1
            continue
        totals["pushed"] += result["pushed"]
        totals["pulled"] += result["pulled"]
    return totals


def _push_event(db: DbSession, user: User, event: Event) -> None:
    settings = get_settings()
    if not settings.google_configured:
        return
    owner = db.get(User, event.owner_id) if event.owner_id else None
    account = account_for(db, owner)
    if account is None:
        # A member editing someone else's group event: there is no connected
        # twin to keep in step until the owner connects.
        return
    token = _access_token(db, account)
    if token is None:
        return
    api = client(settings)
    body = _event_body(db, event, _attendee_emails(db, event, owner))
    if event.google_event_id:
        try:
            api.patch_event(token, event.google_event_id, body)
        except GoogleNotFound:
            event.google_event_id = None
            db.flush()
            event.google_event_id = api.insert_event(token, body).get("id")
    else:
        event.google_event_id = api.insert_event(token, body).get("id")
    db.commit()


def _push_task(db: DbSession, user: User, task: Task) -> None:
    settings = get_settings()
    if not settings.google_configured:
        return
    if task.due_at is None:
        # No date, nothing for a calendar; make sure a stale twin is gone.
        if task.google_event_id:
            delete_task_twin(db, user, task)
            task.google_event_id = None
            task.google_account_id = None
            db.commit()
        return
    account = _organizer_account(db, task)
    if account is None:
        return
    token = _access_token(db, account)
    if token is None:
        return
    api = client(settings)
    body = _task_body(db, task, _task_attendance(db, task, account))
    if task.google_event_id:
        try:
            api.patch_event(token, task.google_event_id, body)
        except GoogleNotFound:
            task.google_event_id = None
            db.flush()
            task.google_event_id = api.insert_event(token, body).get("id")
    else:
        task.google_event_id = api.insert_event(token, body).get("id")
    task.google_account_id = account.id
    db.commit()


def _organizer_account(db: DbSession, task: Task) -> GoogleAccount | None:
    """The account that owns the task's Google twin.

    Once a twin exists, its account is remembered so later edits and deletes
    always address the same copy; otherwise the first connected involved user
    becomes the organizer.
    """
    if task.google_account_id:
        stored = db.get(GoogleAccount, task.google_account_id)
        if stored is not None:
            return stored
    for person in _task_involved(db, task):
        account = account_for(db, person)
        if account is not None:
            return account
    return None


def _task_involved(db: DbSession, task: Task) -> list[User]:
    """Creator first, then assignees, then the owner - without duplicates."""
    ids: list[uuid.UUID] = []
    if task.created_by:
        ids.append(task.created_by)
    ids.extend(row.user_id for row in sorted(task.assignees, key=lambda item: str(item.id)))
    if task.owner_id:
        ids.append(task.owner_id)
    people: list[User] = []
    seen: set[uuid.UUID] = set()
    for user_id in ids:
        if user_id in seen:
            continue
        seen.add(user_id)
        person = db.get(User, user_id)
        if person is not None and person.deleted_at is None:
            people.append(person)
    return people


def _task_attendance(db: DbSession, task: Task, organizer: GoogleAccount) -> list[str]:
    organizer_email = (organizer.email or "").strip().lower()
    emails: list[str] = []
    seen: set[str] = set()
    for person in _task_involved(db, task):
        email = (person.email or "").strip()
        key = email.lower()
        if not email or key == organizer_email or key in seen:
            continue
        seen.add(key)
        emails.append(email)
    return emails


def _task_body(db: DbSession, task: Task, attendees: list[str]) -> dict:
    assert task.due_at is not None  # guaranteed by the caller
    end = task.due_at + timedelta(minutes=ics_services.DEFAULT_BLOCK_MINUTES)
    summary = f"✓ {task.title}" if task.status is TaskStatus.done else task.title
    if task.status is TaskStatus.done or task.reminder_minutes <= 0:
        reminders: dict = {"useDefault": False, "overrides": []}
    else:
        reminders = {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": task.reminder_minutes}],
        }
    description_parts: list[str] = []
    if task.group_id:
        group_name = db.scalar(select(Group.name).where(Group.id == task.group_id))
        if group_name:
            description_parts.append(f"Group: {group_name}")
    if task.description:
        description_parts.append(task.description)
    body: dict = {
        "summary": summary[:300],
        "start": {"dateTime": _rfc3339(task.due_at), "timeZone": "UTC"},
        "end": {"dateTime": _rfc3339(end), "timeZone": "UTC"},
        "reminders": reminders,
    }
    if description_parts:
        body["description"] = "\n".join(description_parts)
    if attendees:
        body["attendees"] = [{"email": email} for email in attendees]
    return body


def _access_token(db: DbSession, account: GoogleAccount) -> str | None:
    now = utcnow()
    token = _decrypt(account.access_token)
    expires = account.access_token_expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if token and expires is not None and expires > now + timedelta(seconds=60):
        return token
    refresh = _decrypt(account.refresh_token)
    if not refresh:
        return None
    try:
        tokens = client().refresh(refresh_token=refresh)
    except GoogleAuthError:
        log.warning("Google refresh token rejected for account %s", account.id)
        _disconnect_account(db, account)
        return None
    access = tokens.get("access_token")
    account.access_token = _encrypt(access) if access else None
    expires_in = tokens.get("expires_in")
    account.access_token_expires_at = now + timedelta(seconds=int(expires_in)) if expires_in else None
    db.commit()
    return access


def _backfill(db: DbSession, user: User, now: datetime) -> int:
    since = now - timedelta(days=BACKFILL_PAST_DAYS)
    events = db.scalars(
        select(Event).where(
            Event.owner_id == user.id,
            Event.google_event_id.is_(None),
            Event.starts_at >= since,
        )
    ).all()
    pushed = 0
    for event in events:
        try:
            _push_event(db, user, event)
        except (GoogleError, httpx.HTTPError) as exc:
            log.warning("Google backfill failed for event %s: %s", event.id, exc)
            continue
        pushed += 1

    tasks = db.scalars(
        select(Task).where(
            Task.google_event_id.is_(None),
            Task.due_at.is_not(None),
            Task.due_at >= since,
            Task.status != TaskStatus.done,
            or_(
                Task.owner_id == user.id,
                Task.created_by == user.id,
                Task.id.in_(select(TaskAssignee.task_id).where(TaskAssignee.user_id == user.id)),
            ),
        )
    ).all()
    for task in tasks:
        # Exactly one account pushes each task: the one selected as organizer.
        account = _organizer_account(db, task)
        if account is None or account.user_id != user.id:
            continue
        try:
            _push_task(db, user, task)
        except (GoogleError, httpx.HTTPError) as exc:
            log.warning("Google backfill failed for task %s: %s", task.id, exc)
            continue
        pushed += 1
    return pushed


def _pull(
    db: DbSession, account: GoogleAccount, api: GoogleClient, token: str, *, dry_run: bool, now: datetime
) -> int:
    sync_token = account.sync_token or None
    page_token: str | None = None
    changed = 0
    while True:
        first_page = page_token is None
        try:
            page = api.list_events(
                token,
                sync_token=sync_token if first_page else None,
                page_token=page_token,
                time_min=_rfc3339(now - timedelta(days=SYNC_PAST_DAYS)) if not sync_token else None,
                time_max=_rfc3339(now + timedelta(days=SYNC_FUTURE_DAYS)) if not sync_token else None,
            )
        except SyncTokenExpired:
            if sync_token is None:
                raise
            # The cursor only lives ~a few weeks idle; start over from scratch.
            sync_token = None
            page_token = None
            if not dry_run:
                account.sync_token = None
                db.commit()
            continue
        for item in page.get("items", []):
            if _apply_item(db, account, item, dry_run=dry_run):
                changed += 1
        page_token = page.get("nextPageToken")
        if not page_token:
            next_token = page.get("nextSyncToken")
            if next_token and not dry_run:
                account.sync_token = next_token
            if not dry_run:
                db.commit()
            break
    return changed


def _apply_item(db: DbSession, account: GoogleAccount, item: dict, *, dry_run: bool) -> bool:
    google_id = str(item.get("id") or "")
    if not google_id:
        return False
    task = db.scalar(select(Task).where(Task.google_event_id == google_id))
    if task is not None:
        return _apply_task_item(task, item, dry_run=dry_run)
    existing = db.scalar(select(Event).where(Event.google_event_id == google_id))
    if item.get("status") == "cancelled":
        if existing is None:
            return False
        if not dry_run:
            db.delete(existing)
        return True
    starts_at = _parse_when(item.get("start") or {})
    if starts_at is None:
        return False
    ends_at = _parse_when(item.get("end") or {})
    if ends_at is not None and ends_at <= starts_at:
        ends_at = None
    title = str(item.get("summary") or "Google Calendar event")[:300]
    location = str(item.get("location") or "")[:300]
    notes = str(item.get("description") or "")[:5000]
    if existing is None:
        if not dry_run:
            db.add(
                Event(
                    owner_id=account.user_id,
                    title=title,
                    type=EventType.personal,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    location=location,
                    reminder_minutes=ics_services.DEFAULT_REMINDER_MINUTES,
                    notes=notes,
                    google_event_id=google_id,
                )
            )
        return True
    updated = _parse_rfc3339(item.get("updated"))
    if updated is not None and _aware(existing.updated_at) >= updated:
        return False
    if not dry_run:
        existing.title = title
        existing.starts_at = starts_at
        existing.ends_at = ends_at
        existing.location = location
        existing.notes = notes
    return True


def _apply_task_item(task: Task, item: dict, *, dry_run: bool) -> bool:
    """Google-side edits to a task's twin flow back onto the board.

    Cancellations are ignored on purpose: a declined invitation or an event
    someone deleted in Google must not erase a shared task.
    """
    if item.get("status") == "cancelled":
        return False
    starts_at = _parse_when(item.get("start") or {})
    if starts_at is None:
        return False
    updated = _parse_rfc3339(item.get("updated"))
    if updated is not None and _aware(task.updated_at) >= updated:
        return False
    if not dry_run:
        task.due_at = starts_at
        title = _clean_task_summary(item.get("summary"))
        if title:
            task.title = title[:300]
    return True


def _clean_task_summary(value: str | None) -> str:
    if not value:
        return ""
    return value.removeprefix("✓").strip()


def _event_body(db: DbSession, event: Event, attendees: list[str]) -> dict:
    end = event.ends_at
    if end is None or end <= event.starts_at:
        end = event.starts_at + timedelta(minutes=ics_services.DEFAULT_BLOCK_MINUTES)
    description_parts: list[str] = []
    if event.group_id:
        group_name = db.scalar(select(Group.name).where(Group.id == event.group_id))
        if group_name:
            description_parts.append(f"Group: {group_name}")
    if event.notes:
        description_parts.append(event.notes)
    body: dict = {
        "summary": event.title,
        "start": {"dateTime": _rfc3339(event.starts_at), "timeZone": "UTC"},
        "end": {"dateTime": _rfc3339(end), "timeZone": "UTC"},
        # Let Google own the notifications; that is the point of connecting.
        "reminders": {"useDefault": True},
    }
    if description_parts:
        body["description"] = "\n".join(description_parts)
    if event.location:
        body["location"] = event.location
    if attendees:
        body["attendees"] = [{"email": email} for email in attendees]
    return body


def _attendee_emails(db: DbSession, event: Event, owner: User | None) -> list[str]:
    if event.group_id is None:
        return []
    owner_email = (owner.email or "").lower() if owner else ""
    rows = db.scalars(
        select(User.email)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == event.group_id, User.email.is_not(None))
    ).all()
    return [email for email in rows if email and email.lower() != owner_email]


def _write_google_settings(
    db: DbSession, user: User, *, status: str, email: str | None, last_sync_at: int | None
) -> None:
    current = settings_services.read_settings(user).model_dump(mode="json")
    current["google"] = {
        "status": status,
        "email": email,
        "lastSyncAt": last_sync_at,
        "calendar": "primary",
    }
    settings_services.write_settings(db, user, settings_services.UserSettings.model_validate(current))


def _disconnect_account(db: DbSession, account: GoogleAccount) -> None:
    user = db.get(User, account.user_id)
    db.delete(account)
    db.commit()
    if user is not None:
        _write_google_settings(db, user, status="disconnected", email=None, last_sync_at=None)


def _fernet() -> Fernet:
    digest = hashlib.sha256(f"neoma-google:{get_settings().app_secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def _decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _check(response: httpx.Response, context: str) -> None:
    if response.status_code in (404, 410):
        raise GoogleNotFound(_error_message(response), status=response.status_code)
    if response.status_code >= 400:
        raise GoogleError(
            f"{context} failed ({response.status_code}): {_error_message(response)}",
            status=response.status_code,
        )


def _error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:300] or "request failed"
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or "request failed")[:300]
        if isinstance(error, str):
            return error[:300]
    return response.text[:300] or "request failed"


def _rfc3339(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _parse_rfc3339(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _aware(parsed)


def _parse_when(value: dict) -> datetime | None:
    if not isinstance(value, dict):
        return None
    if value.get("dateTime"):
        return _parse_rfc3339(str(value["dateTime"]))
    date = value.get("date")
    if date:
        try:
            return datetime.fromisoformat(str(date)).replace(tzinfo=UTC)
        except ValueError:
            return None
    return None


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


__all__ = [
    "GoogleAuthError",
    "GoogleClient",
    "GoogleError",
    "GoogleNotFound",
    "STATE_MAX_AGE",
    "SyncTokenExpired",
    "account_for",
    "client",
    "connect_user",
    "delete_event_twin",
    "delete_task_twin",
    "disconnect",
    "push_event",
    "push_task",
    "sync_account",
    "sync_all",
    "sync_user",
]
