"""iTa'leem (IIUM Moodle) REST client and mirror.

Read-only by design: only the read functions are called, and the only writes
are to Neoma (tasks, notes, files). The web-service token is a full-account
credential, so it is Fernet-encrypted, never logged, never returned to the
client, and only ever put in a POST body or the one-off `pluginfile` download
URL.
"""

import base64
import hashlib
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from typing import Any
from urllib.parse import unquote, urlparse

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from ..models import (
    FileObject,
    MoodleAccount,
    MoodleAssignment,
    MoodleCourse,
    Note,
    Subject,
    Task,
    TaskPriority,
    TaskStatus,
    User,
)
from ..models.enums import NoteScope, NoteType
from ..models.users import utcnow
from ..schemas.moodle import (
    AssignmentOut,
    CourseDetailOut,
    CourseOut,
    GradeOut,
    ModuleFileOut,
    ModuleOut,
    SectionOut,
)
from ..schemas.notes import NoteOut
from ..utils import to_ms
from . import crypto, extract_services, file_services, google_services, note_services, settings_services
from .errors import InvalidError, NotFoundError, UnavailableError

log = logging.getLogger(__name__)

MOODLE_HOST = "italeemc.iium.edu.my"
MOODLE_WWWROOT = "https://italeemc.iium.edu.my"
MOBILE_SERVICE = "moodle_mobile_app"
SYNC_PAST_DAYS = 1
SYNC_FUTURE_DAYS = 120
AUTO_SYNC_WINDOW = timedelta(minutes=10)
OUTLINE_TTL = timedelta(minutes=60)
GRADES_TTL = timedelta(hours=6)
SUBMISSION_TTL = timedelta(minutes=10)
MAX_FILE_BYTES = 50 * 1024 * 1024
DEADLINE_REMINDER_MINUTES = 24 * 60
COURSE_COLORS = ("amber", "mint", "sky", "coral", "violet", "pink")

MISSING_COURSE = "We could not find that iTa'leem course."
NOT_CONNECTED = "Connect iTa'leem first: Settings → iTa'leem."
RECONNECT = "Your iTa'leem link is no longer valid. Connect iTa'leem again in Settings."
UNREACHABLE = "iTa'leem could not be reached. Cached data is still here."


class MoodleError(RuntimeError):
    """A readable Moodle failure that is not an auth rejection."""


class MoodleAuthError(MoodleError):
    """The token was rejected (invalidtoken / service login required)."""


@dataclass
class MoodleClient:
    token: str
    wwwroot: str = MOODLE_WWWROOT
    http: httpx.Client = field(
        default_factory=lambda: httpx.Client(timeout=8, follow_redirects=True)
    )

    def call(self, function: str, **params: Any) -> Any:
        data: dict[str, str] = {
            "wstoken": self.token,
            "wsfunction": function,
            "moodlewsrestformat": "json",
        }
        data.update(_flatten(params))
        response: httpx.Response | None = None
        # IIUM's front end occasionally serves a node whose moodledata is
        # inaccessible (a Moodle `dataroot` fatal, HTTP 500). Retrying usually
        # lands on a healthy node, so a read does not have to fail the user.
        for attempt in range(3):
            try:
                response = self.http.post(
                    f"{self.wwwroot}/webservice/rest/server.php", data=data
                )
            except httpx.HTTPError as exc:
                if attempt == 2:
                    raise MoodleError(UNREACHABLE) from exc
                time.sleep(0.4 * (attempt + 1))
                continue
            if response.status_code in {500, 502, 503, 504} and attempt < 2:
                log.warning(
                    "iTa'leem %s returned %s (attempt %s); retrying",
                    function,
                    response.status_code,
                    attempt + 1,
                )
                time.sleep(0.4 * (attempt + 1))
                continue
            break
        assert response is not None
        if response.status_code >= 500:
            body = response.text[:800]
            log.warning("iTa'leem %s returned %s: %s", function, response.status_code, body)
            if "dataroot" in body:
                raise MoodleError(
                    "iTa'leem's server has a storage problem (dataroot). "
                    "This is on IIUM's side; try again in a moment."
                )
            raise MoodleError(
                f"iTa'leem returned a server error ({response.status_code}). Try again."
            )
        if response.status_code >= 400:
            log.warning(
                "iTa'leem %s returned %s: %s",
                function,
                response.status_code,
                response.text[:800],
            )
            raise MoodleError(f"iTa'leem refused that request ({response.status_code}).")
        try:
            payload = response.json()
        except ValueError as exc:
            raise MoodleError("iTa'leem returned an unexpected response.") from exc
        if isinstance(payload, dict) and payload.get("exception"):
            code = str(payload.get("errorcode") or "")
            if code in {"invalidtoken", "servicerequireslogin", "invalidlogin"}:
                raise MoodleAuthError(RECONNECT)
            message = str(payload.get("message") or "iTa'leem refused that request.")
            raise MoodleError(message)
        return payload

    def site_info(self) -> dict:
        return dict(self.call("core_webservice_get_site_info"))

    def courses(self, moodle_user_id: int) -> list[dict]:
        payload = self.call("core_enrol_get_users_courses", userid=moodle_user_id)
        return [dict(row) for row in payload or []]

    def assignments(self, course_ids: list[int]) -> dict:
        if not course_ids:
            return {"courses": []}
        payload = self.call("mod_assign_get_assignments", courseids=course_ids)
        return dict(payload or {})

    def action_events(self, start: datetime, end: datetime) -> list[dict]:
        events: dict[int, dict] = {}
        after = 0
        for _ in range(20):
            payload = self.call(
                "core_calendar_get_action_events_by_timesort",
                timesortfrom=int(start.timestamp()),
                timesortto=int(end.timestamp()),
                aftereventid=after,
                limitnum=50,
            )
            page = [dict(row) for row in (payload or {}).get("events", [])]
            if not page:
                break
            for row in page:
                events[int(row["id"])] = row
            if len(page) < 50:
                break
            after = int(page[-1]["id"])
        return list(events.values())

    def course_contents(self, course_id: int) -> list[dict]:
        payload = self.call("core_course_get_contents", courseid=course_id)
        return [dict(row) for row in payload or []]

    def grades(self, course_id: int, moodle_user_id: int) -> list[dict]:
        payload = self.call(
            "gradereport_user_get_grade_items", courseid=course_id, userid=moodle_user_id
        )
        rows: list[dict] = []
        for user_grade in (payload or {}).get("usergrades", []):
            for item in user_grade.get("gradeitems", []) or []:
                rows.append(dict(item))
        return rows

    def submission_status(self, assign_id: int, moodle_user_id: int) -> dict:
        payload = self.call(
            "mod_assign_get_submission_status", assignid=assign_id, userid=moodle_user_id
        )
        return dict(payload or {})

    def download(self, fileurl: str) -> tuple[bytes, str]:
        separator = "&" if "?" in fileurl else "?"
        target = f"{fileurl}{separator}token={self.token}"
        try:
            with self.http.stream("GET", target, timeout=60) as response:
                if response.status_code >= 400:
                    raise MoodleError("iTa'leem would not serve that file.")
                length = int(response.headers.get("content-length") or 0)
                if length > MAX_FILE_BYTES:
                    raise MoodleError("That file is too large for Neoma (50 MB limit).")
                buffer = bytearray()
                for chunk in response.iter_bytes():
                    buffer.extend(chunk)
                    if len(buffer) > MAX_FILE_BYTES:
                        raise MoodleError("That file is too large for Neoma (50 MB limit).")
                return bytes(buffer), response.headers.get("content-type", "")
        except httpx.HTTPError as exc:
            raise MoodleError("Could not download that file from iTa'leem.") from exc


def client(token: str, wwwroot: str = MOODLE_WWWROOT) -> MoodleClient:
    """Factory kept separate so tests can inject a MockTransport client."""
    return MoodleClient(token=token, wwwroot=wwwroot)


def _flatten(params: dict[str, Any], prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in params.items():
        name = f"{prefix}[{key}]" if prefix else key
        if isinstance(value, dict):
            out.update(_flatten(value, name))
        elif isinstance(value, (list, tuple)):
            for index, item in enumerate(value):
                item_name = f"{name}[{index}]"
                if isinstance(item, dict):
                    out.update(_flatten(item, item_name))
                else:
                    out[item_name] = str(item)
        elif value is not None:
            out[name] = str(value)
    return out


def parse_token(raw: str) -> str:
    """Accepts a neoma:// connect link, web+neoma://, base64 payload or token."""
    value = unquote((raw or "").strip())
    if not value:
        raise InvalidError("Paste the connect link from iTa'leem.")
    if "token=" in value:
        value = value.split("token=", 1)[1]
        value = value.split("&", 1)[0]
    decoded = ""
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded = base64.b64decode(padded, validate=False).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        decoded = ""
    candidate = ""
    if ":::" in decoded:
        parts = decoded.split(":::")
        candidate = parts[1] if len(parts) > 1 else ""
    if not candidate and re.fullmatch(r"[A-Za-z0-9]{24,64}", value):
        candidate = value
    if not re.fullmatch(r"[A-Za-z0-9]{24,64}", candidate):
        raise InvalidError(
            "That doesn't look like an iTa'leem connect link. Copy the whole link from the connect page."
        )
    return candidate


class _TextExtractor(HTMLParser):
    BLOCK = {
        "p",
        "br",
        "div",
        "li",
        "tr",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.BLOCK:
            self.parts.append("\n")


def html_to_text(value: str | None, limit: int = 5000) -> str:
    if not value:
        return ""
    parser = _TextExtractor()
    parser.feed(value)
    text = "".join(parser.parts)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()[:limit]


def _moment(value: int | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromtimestamp(int(value), tz=UTC)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _color(course_id: int) -> str:
    return COURSE_COLORS[course_id % len(COURSE_COLORS)]


def account_for(db: DbSession, user: User) -> MoodleAccount | None:
    return db.scalar(select(MoodleAccount).where(MoodleAccount.user_id == user.id))


def require_account(db: DbSession, user: User) -> MoodleAccount:
    account = account_for(db, user)
    if account is None:
        raise InvalidError(NOT_CONNECTED)
    return account


def _api(db: DbSession, account: MoodleAccount) -> MoodleClient:
    token = crypto.decrypt_secret(account.token_enc, "moodle")
    if not token:
        raise InvalidError(RECONNECT)
    return client(token, account.wwwroot or MOODLE_WWWROOT)


def _write_settings(
    db: DbSession,
    user: User,
    *,
    status: str,
    last_sync_at: int | None = None,
    error: str | None = None,
) -> None:
    current = settings_services.read_settings(user).model_dump(mode="json")
    current["moodle"] = {"status": status, "lastSyncAt": last_sync_at, "error": error}
    settings_services.write_settings(db, user, settings_services.UserSettings.model_validate(current))


def status(db: DbSession, user: User) -> dict:
    account = account_for(db, user)
    stored = settings_services.read_settings(user).moodle
    if account is None:
        return {
            "connected": False,
            "username": None,
            "release": None,
            "lastSyncAt": stored.lastSyncAt,
            "error": stored.error,
            "courses": 0,
            "upcoming": 0,
        }
    course_count = db.scalar(
        select(func.count())
        .select_from(MoodleCourse)
        .where(MoodleCourse.user_id == user.id, MoodleCourse.archived.is_(False))
    )
    upcoming = db.scalar(
        select(func.count())
        .select_from(Task)
        .where(
            Task.owner_id == user.id,
            Task.external_uid.is_not(None),
            Task.status != TaskStatus.done,
            Task.due_at.is_not(None),
            Task.due_at >= utcnow(),
        )
    )
    return {
        "connected": True,
        "username": account.username or None,
        "release": account.release or None,
        "lastSyncAt": to_ms(account.last_sync_at),
        "error": account.last_error or stored.error or None,
        "courses": int(course_count or 0),
        "upcoming": int(upcoming or 0),
    }


def connect_token(db: DbSession, user: User, raw: str) -> dict:
    token = parse_token(raw)
    api = client(token)
    try:
        info = api.site_info()
    except MoodleAuthError as exc:
        raise InvalidError(
            "That connect link is no longer valid. Open the iTa'leem connect page and copy a fresh one."
        ) from exc
    except MoodleError as exc:
        raise UnavailableError(str(exc)) from exc

    wwwroot = str(info.get("siteurl") or "").rstrip("/")
    if urlparse(wwwroot).hostname != MOODLE_HOST:
        raise InvalidError("That link belongs to a different Moodle site. Use the iTa'leem connect page.")

    account = account_for(db, user)
    moodle_user_id = int(info.get("userid") or 0) or None
    if account is not None and account.moodle_user_id not in (None, moodle_user_id):
        _clear_mirror(db, user)
        account = None
    if account is None:
        account = MoodleAccount(user_id=user.id, token_enc="")
        db.add(account)

    account.wwwroot = wwwroot[:200]
    account.token_enc = crypto.encrypt_secret(token, "moodle")
    account.moodle_user_id = moodle_user_id
    account.username = str(info.get("username") or "")[:100]
    account.release = str(info.get("release") or "")[:80]
    account.functions = [
        str(row.get("name")) for row in info.get("functions") or [] if isinstance(row, dict)
    ]
    account.last_error = ""
    db.commit()
    db.refresh(account)

    counts = sync_account(db, user, account)
    return {"status": status(db, user), "counts": counts}


def _apply_info(account: MoodleAccount, info: dict) -> None:
    account.moodle_user_id = int(info.get("userid") or account.moodle_user_id or 0) or None
    account.username = str(info.get("username") or account.username or "")[:100]
    account.release = str(info.get("release") or account.release or "")[:80]
    account.functions = [
        str(row.get("name")) for row in info.get("functions") or [] if isinstance(row, dict)
    ]


def _folder_position(db: DbSession, user: User) -> int:
    current = db.scalar(select(func.max(Subject.position)).where(Subject.owner_id == user.id))
    return int(current or 0) + 1


def _upsert_courses(db: DbSession, user: User, rows: list[dict]) -> tuple[list[MoodleCourse], bool]:
    existing = {
        row.course_id: row
        for row in db.scalars(select(MoodleCourse).where(MoodleCourse.user_id == user.id)).all()
    }
    seen: set[int] = set()
    changed = False
    now = utcnow()
    courses: list[MoodleCourse] = []
    for raw in rows:
        try:
            course_id = int(raw["id"])
        except (KeyError, TypeError, ValueError):
            continue
        seen.add(course_id)
        course = existing.get(course_id)
        if course is None:
            course = MoodleCourse(user_id=user.id, course_id=course_id)
            db.add(course)
        course.shortname = str(raw.get("shortname") or "")[:120]
        course.fullname = str(raw.get("fullname") or course.shortname or "iTa'leem course")[:300]
        course.category = int(raw["category"]) if raw.get("category") is not None else None
        course.progress = int(raw["progress"]) if raw.get("progress") is not None else None
        course.archived = False
        course.last_synced_at = now
        if not course.folder_created:
            subject = Subject(
                owner_id=user.id,
                name=(course.shortname or course.fullname or "iTa'leem")[:120],
                color=_color(course_id),
                position=_folder_position(db, user),
            )
            db.add(subject)
            db.flush()
            course.subject_id = subject.id
            course.folder_created = True
        courses.append(course)
        changed = True
    for course in existing.values():
        if course.course_id not in seen:
            course.archived = True
            changed = True
    db.flush()
    return courses, changed


def _task_for_uid(db: DbSession, user: User, uid: str) -> Task | None:
    return db.scalar(select(Task).where(Task.owner_id == user.id, Task.external_uid == uid))


def _ignored(account: MoodleAccount, uid: str) -> bool:
    return uid in (account.ignored_uids or [])


def _assignment_url(wwwroot: str, cmid: int) -> str:
    return f"{wwwroot}/mod/assign/view.php?id={cmid}"


def _upsert_task(
    db: DbSession,
    user: User,
    *,
    uid: str,
    course: MoodleCourse,
    title: str,
    description: str,
    due_at: datetime | None,
) -> Task:
    task = _task_for_uid(db, user, uid)
    if task is None:
        task = Task(
            owner_id=user.id,
            title=title[:300] or "iTa'leem deadline",
            description=description[:20000],
            due_at=due_at,
            status=TaskStatus.todo,
            priority=TaskPriority.med,
            reminder_minutes=DEADLINE_REMINDER_MINUTES,
            created_by=user.id,
            external_uid=uid,
            course_id=course.id,
        )
        db.add(task)
        db.flush()
        return task
    task.title = title[:300] or task.title
    task.description = description[:20000]
    task.due_at = due_at
    task.course_id = course.id
    return task


def _sync_assignments(
    db: DbSession,
    user: User,
    account: MoodleAccount,
    courses: dict[int, MoodleCourse],
    payload: dict,
) -> int:
    now = utcnow()
    seen: set[int] = set()
    count = 0
    existing = {
        row.assign_id: row
        for row in db.scalars(select(MoodleAssignment).where(MoodleAssignment.user_id == user.id)).all()
    }
    for course_payload in payload.get("courses") or []:
        course = courses.get(int(course_payload.get("id") or 0))
        if course is None:
            continue
        for raw in course_payload.get("assignments") or []:
            assign_id = int(raw.get("id") or 0)
            if not assign_id:
                continue
            seen.add(assign_id)
            row = existing.get(assign_id)
            if row is None:
                row = MoodleAssignment(
                    user_id=user.id, course_id=course.id, assign_id=assign_id, name=""
                )
                db.add(row)
            row.course_id = course.id
            row.cmid = int(raw.get("cmid") or 0)
            row.name = str(raw.get("name") or "")[:300]
            row.due_at = _moment(raw.get("duedate"))
            row.cutoff_at = _moment(raw.get("cutoffdate"))
            row.intro = html_to_text(raw.get("intro") or "", 20000)
            row.timemodified = _moment(raw.get("timemodified"))
            row.last_seen_at = now
            uid = f"assign:{assign_id}"
            if _ignored(account, uid):
                row.task_id = None
                continue
            if row.task_id is not None:
                linked = db.get(Task, row.task_id)
                # The user edited the mirrored task, which detached it. Respect
                # that instead of creating a second task from the same assignment.
                if linked is not None and linked.external_uid is None:
                    continue
            url = _assignment_url(account.wwwroot or MOODLE_WWWROOT, row.cmid)
            description = row.intro
            if url:
                description = f"{description}\n\nOpen in iTa'leem: {url}".strip()
            due = row.due_at or row.cutoff_at
            task = _upsert_task(
                db,
                user,
                uid=uid,
                course=course,
                title=row.name,
                description=description,
                due_at=due,
            )
            row.task_id = task.id
            count += 1
    for row in existing.values():
        if row.assign_id in seen:
            continue
        if row.task_id is not None:
            task = db.get(Task, row.task_id)
            if task is not None and task.external_uid == f"assign:{row.assign_id}":
                if task.status is TaskStatus.done:
                    task.external_uid = None
                else:
                    google_services.delete_task_twin(db, user, task)
                    db.delete(task)
        db.delete(row)
    db.flush()
    return count


def _sync_events(
    db: DbSession, user: User, account: MoodleAccount, courses: dict[int, MoodleCourse], rows: list[dict]
) -> int:
    now = utcnow()
    seen: set[str] = set()
    count = 0
    for raw in rows:
        if str(raw.get("modulename") or "") == "assign":
            continue
        if str(raw.get("eventtype") or "") not in {"due", "close"}:
            continue
        event_id = int(raw.get("id") or 0)
        course_id = raw.get("courseid")
        if course_id is None and isinstance(raw.get("course"), dict):
            course_id = raw["course"].get("id")
        course = courses.get(int(course_id or 0))
        if not event_id or course is None:
            continue
        due = _moment(raw.get("timestart"))
        if due is None or due < now - timedelta(days=SYNC_PAST_DAYS):
            continue
        uid = f"italeem-event:{event_id}"
        seen.add(uid)
        if _ignored(account, uid):
            continue
        url = str(raw.get("url") or "")
        description = html_to_text(raw.get("description") or "", 20000)
        if url:
            description = f"{description}\n\nOpen in iTa'leem: {url}".strip()
        _upsert_task(
            db,
            user,
            uid=uid,
            course=course,
            title=str(raw.get("name") or "iTa'leem deadline"),
            description=description,
            due_at=due,
        )
        count += 1
    mirrored = db.scalars(
        select(Task).where(Task.owner_id == user.id, Task.external_uid.like("italeem-event:%"))
    ).all()
    for task in mirrored:
        if task.external_uid in seen:
            continue
        if task.status is TaskStatus.done:
            task.external_uid = None
        else:
            google_services.delete_task_twin(db, user, task)
            db.delete(task)
    db.flush()
    return count


def sync_account(
    db: DbSession, user: User, account: MoodleAccount | None = None
) -> dict[str, int]:
    account = account or require_account(db, user)
    api = _api(db, account)
    try:
        info = api.site_info()
        _apply_info(account, info)
        raw_courses = api.courses(account.moodle_user_id or 0)
        courses, _ = _upsert_courses(db, user, raw_courses)
        by_moodle_id = {course.course_id: course for course in courses}
        assignments = api.assignments(list(by_moodle_id))
        deadlines = _sync_assignments(db, user, account, by_moodle_id, assignments)
        events = api.action_events(
            utcnow() - timedelta(days=SYNC_PAST_DAYS), utcnow() + timedelta(days=SYNC_FUTURE_DAYS)
        )
        event_count = _sync_events(db, user, account, by_moodle_id, events)
        account.last_sync_at = utcnow()
        account.last_error = ""
        db.commit()
        db.refresh(account)
        _write_settings(
            db, user, status="connected", last_sync_at=to_ms(account.last_sync_at), error=None
        )
        return {"courses": len(by_moodle_id), "deadlines": deadlines, "events": event_count}
    except MoodleAuthError:
        db.rollback()
        account = account_for(db, user)
        if account is not None:
            account.last_error = RECONNECT
            db.commit()
        _write_settings(db, user, status="disconnected", error=RECONNECT)
        raise InvalidError(RECONNECT) from None
    except (MoodleError, httpx.HTTPError) as exc:
        db.rollback()
        account = account_for(db, user)
        message = str(exc) if isinstance(exc, MoodleError) else UNREACHABLE
        if account is not None:
            account.last_error = message[:500]
            db.commit()
        _write_settings(
            db,
            user,
            status="connected",
            last_sync_at=to_ms(account.last_sync_at) if account else None,
            error=message[:500],
        )
        raise UnavailableError(message) from None


def _clear_mirror(db: DbSession, user: User) -> None:
    for task in db.scalars(
        select(Task).where(Task.owner_id == user.id, Task.external_uid.is_not(None))
    ).all():
        google_services.delete_task_twin(db, user, task)
        db.delete(task)
    db.flush()
    for row in db.scalars(select(MoodleAssignment).where(MoodleAssignment.user_id == user.id)).all():
        db.delete(row)
    for row in db.scalars(select(MoodleCourse).where(MoodleCourse.user_id == user.id)).all():
        db.delete(row)
    account = account_for(db, user)
    if account is not None:
        db.delete(account)
    db.commit()


def disconnect(db: DbSession, user: User) -> None:
    account = account_for(db, user)
    if account is None:
        return
    for task in db.scalars(
        select(Task).where(Task.owner_id == user.id, Task.external_uid.is_not(None))
    ).all():
        google_services.delete_task_twin(db, user, task)
        db.delete(task)
    db.flush()
    for row in db.scalars(select(MoodleAssignment).where(MoodleAssignment.user_id == user.id)).all():
        db.delete(row)
    for row in db.scalars(select(MoodleCourse).where(MoodleCourse.user_id == user.id)).all():
        db.delete(row)
    db.delete(account)
    db.commit()
    _write_settings(db, user, status="disconnected", error=None)


def ignore_task(db: DbSession, user: User, task: Task) -> None:
    """Remember a deleted mirrored task so the next sync does not recreate it."""
    if not task.external_uid:
        return
    account = account_for(db, user)
    if account is None:
        return
    uids = [str(uid) for uid in account.ignored_uids or []]
    if task.external_uid not in uids:
        uids.append(task.external_uid)
        account.ignored_uids = uids[-500:]


def sync_all(db: DbSession, *, dry_run: bool = False) -> dict[str, int]:
    """Scheduler entry point: refresh every connected iTa'leem account."""
    counts = {"accounts": 0, "courses": 0, "deadlines": 0, "events": 0, "failed": 0}
    accounts = db.scalars(select(MoodleAccount)).all()
    for account in accounts:
        user = db.get(User, account.user_id)
        if user is None or user.deleted_at is not None:
            continue
        counts["accounts"] += 1
        if dry_run:
            continue
        try:
            result = sync_account(db, user, account)
        except Exception:  # noqa: BLE001 - one broken account must not stop the rest
            db.rollback()
            counts["failed"] += 1
            log.warning("iTa'leem sync failed for user %s", account.user_id, exc_info=True)
            continue
        counts["courses"] += result.get("courses", 0)
        counts["deadlines"] += result.get("deadlines", 0)
        counts["events"] += result.get("events", 0)
    return counts


def _deadlines_by_course(db: DbSession, user_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, datetime | None]]:
    rows = db.execute(
        select(Task.course_id, Task.due_at)
        .where(
            Task.owner_id == user_id,
            Task.course_id.is_not(None),
            Task.external_uid.is_not(None),
            Task.status != TaskStatus.done,
        )
        .order_by(Task.due_at.asc().nulls_last())
    ).all()
    result: dict[uuid.UUID, tuple[int, datetime | None]] = {}
    for course_id, due_at in rows:
        if course_id is None:
            continue
        count, first = result.get(course_id, (0, None))
        result[course_id] = (count + 1, first or _aware(due_at))
    return result


def course_out(db: DbSession, course: MoodleCourse) -> CourseOut:
    deadlines = _deadlines_by_course(db, course.user_id)
    count, first = deadlines.get(course.id, (0, None))
    return CourseOut(
        id=str(course.id),
        moodleId=course.course_id,
        shortname=course.shortname,
        fullname=course.fullname,
        color=_color(course.course_id),
        progress=course.progress,
        subjectId=str(course.subject_id) if course.subject_id else None,
        openDeadlines=count,
        nextDueAt=to_ms(first),
        archived=course.archived,
    )


def list_courses(db: DbSession, user: User) -> list[CourseOut]:
    rows = db.scalars(
        select(MoodleCourse)
        .where(MoodleCourse.user_id == user.id, MoodleCourse.archived.is_(False))
        .order_by(MoodleCourse.fullname.asc())
    ).all()
    deadlines = _deadlines_by_course(db, user.id)
    output: list[CourseOut] = []
    for course in rows:
        count, first = deadlines.get(course.id, (0, None))
        output.append(
            CourseOut(
                id=str(course.id),
                moodleId=course.course_id,
                shortname=course.shortname,
                fullname=course.fullname,
                color=_color(course.course_id),
                progress=course.progress,
                subjectId=str(course.subject_id) if course.subject_id else None,
                openDeadlines=count,
                nextDueAt=to_ms(first),
                archived=course.archived,
            )
        )
    return output


def require_course(db: DbSession, user: User, course_id: uuid.UUID) -> MoodleCourse:
    course = db.get(MoodleCourse, course_id)
    if course is None or course.user_id != user.id:
        raise NotFoundError(MISSING_COURSE)
    return course


def refresh_outline(
    db: DbSession, user: User, course: MoodleCourse, *, force: bool = False
) -> str | None:
    fresh = (
        course.outline
        and course.outline_at
        and utcnow() - (_aware(course.outline_at) or utcnow()) < OUTLINE_TTL
    )
    if fresh and not force:
        return None
    account = require_account(db, user)
    api = _api(db, account)
    try:
        course.outline = api.course_contents(course.course_id)
        course.outline_at = utcnow()
        db.commit()
        return None
    except MoodleAuthError as exc:
        raise InvalidError(RECONNECT) from exc
    except (MoodleError, httpx.HTTPError) as exc:
        return str(exc) if isinstance(exc, MoodleError) else UNREACHABLE


def _file_uid(moodle_user_id: int | None, fileurl: str) -> str:
    path = fileurl.split("?", 1)[0]
    digest = hashlib.sha1(path.encode()).hexdigest()[:32]
    return f"italeem-file:{moodle_user_id or 0}:{digest}"


def _module_description(module: dict) -> str:
    description = module.get("description") or ""
    if not description and module.get("modname") == "label":
        contents = [row for row in module.get("contents") or [] if row.get("type") == "content"]
        description = " ".join(str(row.get("content") or "") for row in contents)
    return html_to_text(description, 1200)


def _saved_note_ids(db: DbSession, user: User, uids: set[str]) -> dict[str, str]:
    if not uids:
        return {}
    rows = db.scalars(
        select(Note).where(Note.owner_id == user.id, Note.external_uid.in_(uids))
    ).all()
    return {str(row.external_uid): str(row.id) for row in rows if row.external_uid}


def _outline_sections(
    db: DbSession, user: User, account: MoodleAccount, course: MoodleCourse
) -> tuple[list[SectionOut], bool]:
    uids: set[str] = set()
    for section in course.outline or []:
        for module in section.get("modules") or []:
            for content in module.get("contents") or []:
                if content.get("type") == "file" and content.get("fileurl"):
                    uids.add(_file_uid(account.moodle_user_id, str(content["fileurl"])))
    saved = _saved_note_ids(db, user, uids)
    sections: list[SectionOut] = []
    truncated = False
    module_count = 0
    for section in course.outline or []:
        if section.get("uservisible") is False:
            continue
        modules: list[ModuleOut] = []
        for module in section.get("modules") or []:
            if module.get("uservisible") is False or module.get("visible") == 0:
                continue
            module_count += 1
            if module_count > 400:
                truncated = True
                break
            contents = [row for row in module.get("contents") or [] if row.get("fileurl")]
            files: list[ModuleFileOut] = []
            link: str | None = None
            for content in contents:
                if content.get("type") == "url":
                    link = link or str(content.get("fileurl") or "")
                elif content.get("type") == "file":
                    uid = _file_uid(account.moodle_user_id, str(content["fileurl"]))
                    files.append(
                        ModuleFileOut(
                            filename=str(content.get("filename") or "file")[:300],
                            mimetype=str(content.get("mimetype") or "application/octet-stream")[:160],
                            size=int(content.get("filesize") or 0),
                            noteId=saved.get(uid),
                        )
                    )
            modules.append(
                ModuleOut(
                    cmid=int(module.get("id") or 0),
                    name=str(module.get("name") or "")[:300],
                    modname=str(module.get("modname") or "")[:40],
                    url=str(module.get("url") or "") or None,
                    description=_module_description(module),
                    link=link,
                    files=files,
                )
            )
        if module_count > 400:
            break
        sections.append(
            SectionOut(
                id=int(section.get("id") or 0),
                name=str(section.get("name") or "")[:200],
                summary=html_to_text(section.get("summary") or "", 1200),
                modules=modules,
            )
        )
    return sections, truncated


def _grades(course: MoodleCourse) -> list[GradeOut]:
    output: list[GradeOut] = []
    for row in course.grades or []:
        raw_cmid = row.get("cmid")
        try:
            cmid = int(raw_cmid) if raw_cmid not in (None, "") else None
        except (TypeError, ValueError):
            cmid = None
        output.append(
            GradeOut(
                name=str(row.get("name") or "")[:200],
                grade=str(row.get("grade") or "")[:50],
                max=str(row.get("max") or "")[:50],
                percentage=str(row.get("percentage") or "")[:50],
                feedback=str(row.get("feedback") or "")[:1000],
                cmid=cmid,
            )
        )
    return output


def assignments_for(db: DbSession, user: User, course: MoodleCourse) -> list[AssignmentOut]:
    rows = db.scalars(
        select(MoodleAssignment)
        .where(MoodleAssignment.user_id == user.id, MoodleAssignment.course_id == course.id)
        .order_by(MoodleAssignment.due_at.asc().nulls_last(), MoodleAssignment.name.asc())
    ).all()
    account = account_for(db, user)
    wwwroot = (account.wwwroot if account else "") or MOODLE_WWWROOT
    return [
        AssignmentOut(
            taskId=str(row.task_id) if row.task_id else None,
            assignId=row.assign_id,
            cmid=row.cmid,
            name=row.name,
            dueAt=to_ms(row.due_at),
            cutoffAt=to_ms(row.cutoff_at),
            submissionStatus=row.submission_status,
            grade=row.grade,
            gradeMax=row.grade_max,
            url=_assignment_url(wwwroot, row.cmid),
        )
        for row in rows
    ]


def _submission_state(payload: dict) -> str:
    attempt = payload.get("lastattempt") or {}
    submission = attempt.get("submission") or {}
    status = str(submission.get("status") or "").lower()
    if status == "submitted":
        return "submitted"
    if status == "draft":
        return "draft"
    return "notsubmitted"


def refresh_assignment_status(
    db: DbSession, user: User, assignment: MoodleAssignment
) -> bool:
    """Fetch one submission status. A single failure must not break a page."""
    account = require_account(db, user)
    api = _api(db, account)
    try:
        payload = api.submission_status(assignment.assign_id, account.moodle_user_id or 0)
    except MoodleAuthError as exc:
        raise InvalidError(RECONNECT) from exc
    except (MoodleError, httpx.HTTPError):
        return False
    assignment.submission_status = _submission_state(payload)
    feedback = payload.get("feedback") or {}
    grade = feedback.get("gradefordisplay") or feedback.get("grade")
    if grade not in (None, ""):
        assignment.grade = str(grade)[:50]
    assignment.status_at = utcnow()
    db.commit()
    return True


def refresh_submission_status(
    db: DbSession, user: User, course: MoodleCourse, *, force: bool = False
) -> None:
    rows = db.scalars(
        select(MoodleAssignment).where(
            MoodleAssignment.user_id == user.id, MoodleAssignment.course_id == course.id
        )
    ).all()
    for row in rows:
        fresh = (
            row.status_at is not None
            and utcnow() - (_aware(row.status_at) or utcnow()) < SUBMISSION_TTL
        )
        if (force or not fresh) and not refresh_assignment_status(db, user, row):
            break


def course_detail(
    db: DbSession, user: User, course_id: uuid.UUID, *, force: bool = False
) -> CourseDetailOut:
    course = require_course(db, user, course_id)
    account = require_account(db, user)
    outline_error = refresh_outline(db, user, course, force=force)
    sections, truncated = _outline_sections(db, user, account, course)
    return CourseDetailOut(
        course=course_out(db, course),
        sections=sections,
        assignments=assignments_for(db, user, course),
        grades=_grades(course),
        outlineAt=to_ms(course.outline_at),
        outlineError=outline_error,
        truncated=truncated,
    )


def refresh_grades(db: DbSession, user: User, course: MoodleCourse, *, force: bool = False) -> None:
    fresh = (
        course.grades
        and course.grades_at
        and utcnow() - (_aware(course.grades_at) or utcnow()) < GRADES_TTL
    )
    if fresh and not force:
        return
    account = require_account(db, user)
    api = _api(db, account)
    try:
        rows = api.grades(course.course_id, account.moodle_user_id or 0)
    except MoodleAuthError as exc:
        raise InvalidError(RECONNECT) from exc
    except (MoodleError, httpx.HTTPError) as exc:
        raise UnavailableError(str(exc) if isinstance(exc, MoodleError) else UNREACHABLE) from None
    course.grades = [
        {
            "name": html_to_text(str(row.get("itemname") or ""), 200),
            "grade": html_to_text(str(row.get("gradeformatted") or ""), 50),
            "max": html_to_text(str(row.get("grademax") or ""), 50),
            "percentage": str(row.get("percentageformatted") or "")[:50],
            "feedback": html_to_text(str(row.get("feedback") or ""), 1000),
            "cmid": row.get("cmid"),
        }
        for row in rows
    ][:300]
    course.grades_at = utcnow()
    db.commit()


def grades_for(db: DbSession, user: User, course: MoodleCourse, *, force: bool = False) -> list[GradeOut]:
    refresh_grades(db, user, course, force=force)
    return _grades(course)


def _note_type(content_type: str, filename: str) -> NoteType:
    lower = f"{content_type} {filename}".lower()
    if "presentation" in lower or filename.lower().endswith((".ppt", ".pptx")):
        return NoteType.slides
    return NoteType.paper


def save_file(
    db: DbSession,
    user: User,
    course_id: uuid.UUID,
    *,
    cmid: int,
    file_index: int,
    storage: Any,
) -> NoteOut:
    course = require_course(db, user, course_id)
    account = require_account(db, user)
    outline_error = refresh_outline(db, user, course)
    if not course.outline:
        raise UnavailableError(outline_error or "iTa'leem could not load that course outline.")
    module = None
    for section in course.outline or []:
        for row in section.get("modules") or []:
            if int(row.get("id") or 0) == cmid:
                module = row
                break
        if module is not None:
            break
    if module is None:
        raise NotFoundError("That iTa'leem activity is no longer in the course.")
    files = [
        row
        for row in module.get("contents") or []
        if row.get("type") == "file" and row.get("fileurl")
    ]
    if file_index >= len(files):
        raise NotFoundError("That file is no longer in the course.")
    content = files[file_index]
    fileurl = str(content["fileurl"])
    if urlparse(fileurl).hostname != urlparse(account.wwwroot or MOODLE_WWWROOT).hostname:
        raise InvalidError("That file is not hosted on iTa'leem.")
    uid = _file_uid(account.moodle_user_id, fileurl)
    existing = db.scalar(select(Note).where(Note.owner_id == user.id, Note.external_uid == uid))
    if existing is not None:
        return note_services.note_out(db, existing)

    api = _api(db, account)
    try:
        data, response_type = api.download(fileurl)
    except MoodleAuthError as exc:
        raise InvalidError(RECONNECT) from exc
    except (MoodleError, httpx.HTTPError) as exc:
        raise UnavailableError(str(exc) if isinstance(exc, MoodleError) else UNREACHABLE) from None
    if not data:
        raise UnavailableError("iTa'leem returned an empty file.")

    filename = str(content.get("filename") or module.get("name") or "iTa'leem file")[:300]
    content_type = str(content.get("mimetype") or response_type or "application/octet-stream")[:160]
    key = file_services.file_key(f"users/{user.id}/{uuid.uuid4().hex}", filename)
    storage.put(key, data, content_type)
    record = FileObject(
        owner_id=user.id,
        key=key,
        name=filename,
        content_type=content_type,
        size=len(data),
    )
    db.add(record)
    db.flush()

    url = str(module.get("url") or "")
    body = _module_description(module)
    if url:
        body = f"{body}\n\n[Open in iTa'leem]({url})".strip()
    note = Note(
        owner_id=user.id,
        scope=NoteScope.personal,
        subject_id=course.subject_id,
        type=_note_type(content_type, filename),
        title=(filename.rsplit(".", 1)[0] or module.get("name") or "iTa'leem file")[:300],
        body=body[:20000],
        file_id=record.id,
        external_uid=uid,
        tags=["iTa'leem", course.shortname[:40]],
        created_by=user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    extract_services.extract_file_text(db, storage, record)
    return note_services.note_out(db, note)
