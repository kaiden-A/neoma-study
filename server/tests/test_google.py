import time
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import Event, GoogleAccount, GroupMember, Task, User
from app.models.enums import EventType, GroupRole
from app.services import google_services
from app.services.security import sign_payload, unsign_payload

settings = get_settings()
MS_HOUR = 3_600_000


class FakeGoogle:
    """Records what would have been sent to Google, without touching the network."""

    def __init__(self) -> None:
        self.authorize_states: list[str] = []
        self.exchanged: list[str] = []
        self.inserted: list[dict] = []
        self.patched: list[tuple[str, dict]] = []
        self.deleted: list[str] = []
        self.list_calls: list[dict] = []
        self.pages: list[dict] = []
        self.list_error: Exception | None = None
        self.next_id = "g-1"
        self.tokens = {"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 3600}
        self.info = {"sub": "google-sub-1", "email": "ada@gmail.com"}

    def authorize_url(self, *, state: str) -> str:
        self.authorize_states.append(state)
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    def exchange_code(self, *, code: str) -> dict:
        self.exchanged.append(code)
        return self.tokens

    def refresh(self, *, refresh_token: str) -> dict:
        return {"access_token": "access-2", "expires_in": 3600}

    def userinfo(self, access_token: str) -> dict:
        return self.info

    def list_events(self, access_token, *, sync_token=None, page_token=None, time_min=None, time_max=None):
        self.list_calls.append(
            {
                "sync_token": sync_token,
                "page_token": page_token,
                "time_min": time_min,
                "time_max": time_max,
            }
        )
        if self.list_error is not None:
            error = self.list_error
            self.list_error = None
            raise error
        return self.pages.pop(0) if self.pages else {"items": []}

    def insert_event(self, access_token, body: dict) -> dict:
        self.inserted.append(body)
        return {"id": self.next_id}

    def patch_event(self, access_token, google_event_id: str, body: dict) -> dict:
        self.patched.append((google_event_id, body))
        return {"id": google_event_id}

    def delete_event(self, access_token, google_event_id: str) -> None:
        self.deleted.append(google_event_id)


@pytest.fixture
def fake_google(monkeypatch) -> FakeGoogle:
    fake = FakeGoogle()
    monkeypatch.setattr(google_services, "client", lambda settings=None: fake)
    monkeypatch.setattr(settings, "google_client_id", "test-client")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")
    return fake


def _connect(db: DbSession, user: User) -> GoogleAccount:
    return google_services.connect_user(
        db,
        user,
        tokens={"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 3600},
        info={"sub": "google-sub-1", "email": user.email or "ada@gmail.com"},
    )


def _future(**overrides) -> dict:
    starts = int(datetime.now(UTC).timestamp() * 1000) + 24 * MS_HOUR
    payload = {"title": "Physics revision", "type": "personal", "startsAt": starts}
    payload.update(overrides)
    return payload


def test_authorize_url_asks_for_offline_consent() -> None:
    api = google_services.GoogleClient(
        client_id="client",
        client_secret="secret",
        redirect_uri="http://localhost:8000/api/google/callback",
        http=httpx.Client(),
    )

    url = api.authorize_url(state="state-1")

    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "access_type=offline" in url
    assert "prompt=consent" in url
    assert "calendar.events" in url


def test_connect_redirects_to_google_with_signed_state(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    sign_in(user)

    response = client.get("/api/google/connect")

    assert response.status_code == 302
    assert response.headers["location"].startswith("https://accounts.google.com/")
    payload = unsign_payload(fake_google.authorize_states[-1], settings.app_secret, max_age=600)
    assert payload is not None
    assert payload["user_id"] == str(user.id)


def test_connect_unconfigured_says_so(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))

    response = client.get("/api/google/connect")

    assert response.status_code == 302
    assert response.headers["location"].endswith("/settings?google=unconfigured")


def test_callback_rejects_a_forged_state(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    sign_in(make_user(db))

    response = client.get("/api/google/callback?code=abc&state=forged")

    assert response.headers["location"].endswith("/settings?google=error")
    assert db.scalar(select(GoogleAccount)) is None


def test_callback_stores_the_account_and_updates_settings(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    sign_in(user)
    state = sign_payload({"user_id": str(user.id), "iat": int(time.time())}, settings.app_secret)

    response = client.get(f"/api/google/callback?code=abc&state={state}")

    assert response.headers["location"].endswith("/settings?google=connected")
    account = db.scalar(select(GoogleAccount).where(GoogleAccount.user_id == user.id))
    assert account is not None
    assert account.email == "ada@gmail.com"
    assert account.refresh_token != "refresh-1"  # stored encrypted
    google = client.get("/api/bootstrap").json()["settings"]["google"]
    assert google["status"] == "connected"
    assert google["email"] == "ada@gmail.com"


def test_disconnect_removes_the_account(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)

    assert client.post("/api/google/disconnect").json() == {"ok": True}

    assert db.scalar(select(GoogleAccount)) is None
    assert client.get("/api/bootstrap").json()["settings"]["google"]["status"] == "disconnected"


def test_creating_an_event_pushes_it(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)

    response = client.post("/api/events", json=_future())

    assert response.status_code == 201, response.text
    assert len(fake_google.inserted) == 1
    event = db.scalar(select(Event))
    assert event is not None
    assert event.google_event_id == "g-1"


def test_editing_an_event_patches_its_twin(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)
    event = client.post("/api/events", json=_future()).json()

    client.patch(f"/api/events/{event['id']}", json={"title": "Moved"})
    client.delete(f"/api/events/{event['id']}")

    assert fake_google.patched[-1][0] == "g-1"
    assert fake_google.patched[-1][1]["summary"] == "Moved"
    assert fake_google.deleted == ["g-1"]


def test_group_events_push_without_attendees(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    _connect(db, owner)
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()

    client.post("/api/events", json=_future(title="Session", type="session", groupId=group["id"]))

    assert "attendees" not in fake_google.inserted[-1]
    assert "Group: Finals crew" in fake_google.inserted[-1]["description"]


def test_sync_backfills_existing_events(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    starts = datetime.now(UTC) + timedelta(days=1)
    db.add(
        Event(
            owner_id=user.id,
            title="Existing",
            type=EventType.personal,
            starts_at=starts,
        )
    )
    db.commit()
    _connect(db, user)
    sign_in(user)

    result = client.post("/api/google/sync").json()

    assert result["pushed"] == 1
    assert fake_google.inserted[-1]["summary"] == "Existing"
    event = db.scalar(select(Event))
    assert event is not None and event.google_event_id == "g-1"


def test_sync_imports_google_events_and_deletes_cancelled(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    starts = datetime.now(UTC) + timedelta(days=3)
    db.add(
        Event(
            owner_id=user.id,
            title="Old copy",
            type=EventType.personal,
            starts_at=starts,
            google_event_id="g-cancelled",
        )
    )
    db.commit()
    _connect(db, user)
    sign_in(user)
    stamp = starts.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    fake_google.pages = [
        {
            "items": [
                {
                    "id": "g-imported",
                    "status": "confirmed",
                    "summary": "Dentist",
                    "start": {"dateTime": stamp},
                    "end": {"dateTime": stamp},
                    "updated": stamp,
                },
                {"id": "g-cancelled", "status": "cancelled", "updated": stamp},
            ],
            "nextSyncToken": "sync-2",
        }
    ]

    result = client.post("/api/google/sync").json()

    assert result["pulled"] == 2
    imported = db.scalar(select(Event).where(Event.google_event_id == "g-imported"))
    assert imported is not None and imported.title == "Dentist"
    assert db.scalar(select(Event).where(Event.google_event_id == "g-cancelled")) is None
    account = db.scalar(select(GoogleAccount))
    assert account is not None and account.sync_token == "sync-2"


def test_sync_skips_hand_added_event_copies(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    """A copy made with the Add-to-Google button or an .ics is not re-imported."""
    user = make_user(db)
    event = Event(
        owner_id=user.id,
        title="Physics revision",
        type=EventType.personal,
        starts_at=datetime.now(UTC) + timedelta(days=1),
        google_event_id="g-twin",
    )
    db.add(event)
    db.commit()
    _connect(db, user)
    sign_in(user)
    stamp = (datetime.now(UTC) + timedelta(days=2)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    fake_google.pages = [
        {
            "items": [
                {
                    "id": "g-copy",
                    "status": "confirmed",
                    "summary": "Physics revision",
                    "description": f"Added from Neoma\nNeoma id: {event.id}",
                    "start": {"dateTime": stamp},
                    "end": {"dateTime": stamp},
                    "updated": stamp,
                }
            ],
            "nextSyncToken": "sync-2",
        }
    ]

    result = client.post("/api/google/sync").json()

    assert result["pulled"] == 0
    assert db.scalar(select(Event).where(Event.google_event_id == "g-copy")) is None


def test_sync_skips_hand_added_task_copies(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    task = Task(
        owner_id=user.id,
        title="Lab report",
        due_at=datetime.now(UTC) + timedelta(days=2),
        google_event_id="g-task",
    )
    db.add(task)
    db.commit()
    _connect(db, user)
    sign_in(user)
    stamp = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    fake_google.pages = [
        {
            "items": [
                {
                    "id": "g-copy",
                    "status": "confirmed",
                    "summary": "Lab report",
                    "description": f"Neoma id: {task.id}",
                    "start": {"dateTime": stamp},
                    "end": {"dateTime": stamp},
                    "updated": stamp,
                }
            ],
            "nextSyncToken": "sync-2",
        }
    ]

    result = client.post("/api/google/sync").json()

    assert result["pulled"] == 0
    assert db.scalar(select(Event).where(Event.google_event_id == "g-copy")) is None
    db.refresh(task)
    assert task.google_event_id == "g-task"


def test_sync_restarts_when_the_cursor_expires(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    account = _connect(db, user)
    account.sync_token = "stale"
    db.commit()
    sign_in(user)
    fake_google.list_error = google_services.SyncTokenExpired("gone", status=410)
    fake_google.pages = [{"items": [], "nextSyncToken": "fresh"}]

    assert client.post("/api/google/sync").status_code == 200

    assert fake_google.list_calls[0]["sync_token"] == "stale"
    assert fake_google.list_calls[1]["sync_token"] is None
    db.refresh(account)
    assert account.sync_token == "fresh"


def test_sync_requires_a_connection(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google
) -> None:
    sign_in(make_user(db))

    response = client.post("/api/google/sync")

    assert response.status_code == 422
    assert "Connect Google Calendar" in response.json()["error"]


def _create_task(client: TestClient, **overrides) -> dict:
    due = overrides.pop("dueAt", int(datetime.now(UTC).timestamp() * 1000) + 24 * MS_HOUR)
    payload: dict = {"title": "Lab report", "dueAt": due}
    payload.update(overrides)
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_task_due_date_pushes_with_reminder(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)

    task = _create_task(client, title="Submit lab report")

    assert len(fake_google.inserted) == 1
    body = fake_google.inserted[-1]
    assert body["summary"] == "Submit lab report"
    assert body["reminders"] == {"useDefault": False, "overrides": [{"method": "popup", "minutes": 60}]}
    assert body["start"]["dateTime"].endswith("Z")
    stored = db.get(Task, uuid.UUID(task["id"]))
    assert stored is not None and stored.google_event_id == "g-1"


def test_task_without_a_due_date_stays_local(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)

    _create_task(client, dueAt=None)

    assert fake_google.inserted == []
    assert db.scalar(select(Task.google_event_id)) is None


def test_task_reminder_zero_silences_notifications(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)

    _create_task(client, reminderMinutes=0)

    assert fake_google.inserted[-1]["reminders"] == {"useDefault": False, "overrides": []}


def test_group_tasks_push_without_attendees(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    _connect(db, owner)
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()

    _create_task(client, title="Revise chapter 4", groupId=group["id"], assigneeIds=[str(member.id)])

    body = fake_google.inserted[-1]
    assert "attendees" not in body
    assert "Group: Finals crew" in body["description"]


def test_google_writes_never_ask_for_guest_emails() -> None:
    """sendUpdates=none on every write, so Google sends no mail of its own."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(200, json={"id": "g-1"})

    api = google_services.GoogleClient(
        client_id="client",
        client_secret="secret",
        redirect_uri="http://localhost:8000/api/google/callback",
        http=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    api.insert_event("token", {"summary": "x"})
    api.patch_event("token", "g-1", {"summary": "x"})
    api.delete_event("token", "g-1")

    assert [request.url.params.get("sendUpdates") for request in seen] == ["none", "none", "none"]


def test_task_created_by_an_unconnected_member_uses_a_connected_assignee(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    creator = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    _connect(db, member)
    sign_in(creator)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()

    task = _create_task(client, groupId=group["id"], assigneeIds=[str(member.id)])

    assert len(fake_google.inserted) == 1
    stored = db.get(Task, uuid.UUID(task["id"]))
    assert stored is not None and stored.google_account_id is not None
    account = db.get(GoogleAccount, stored.google_account_id)
    assert account is not None and account.user_id == member.id


def test_completing_a_task_marks_and_silences_the_event(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)
    task = _create_task(client, title="Essay draft")

    client.patch(f"/api/tasks/{task['id']}", json={"status": "done"})

    event_id, body = fake_google.patched[-1]
    assert event_id == "g-1"
    assert body["summary"] == "✓ Essay draft"
    assert body["reminders"] == {"useDefault": False, "overrides": []}


def test_clearing_a_due_date_removes_the_event(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)
    task = _create_task(client)

    client.patch(f"/api/tasks/{task['id']}", json={"dueAt": None})

    assert fake_google.deleted == ["g-1"]
    stored = db.get(Task, uuid.UUID(task["id"]))
    assert stored is not None and stored.google_event_id is None


def test_deleting_a_task_deletes_the_event(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    _connect(db, user)
    sign_in(user)
    task = _create_task(client)

    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204

    assert fake_google.deleted == ["g-1"]


def test_sync_backfills_tasks(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    sign_in(user)
    task = _create_task(client, title="Backfilled task")
    _connect(db, user)
    fake_google.pages = [{"items": [], "nextSyncToken": "sync-1"}]

    result = client.post("/api/google/sync").json()

    assert result["pushed"] == 1
    assert fake_google.inserted[-1]["summary"] == "Backfilled task"
    stored = db.get(Task, uuid.UUID(task["id"]))
    assert stored is not None and stored.google_event_id == "g-1"


def test_pull_moves_a_task_due_date(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    starts = datetime.now(UTC) + timedelta(days=2)
    task = Task(
        owner_id=user.id,
        title="Dentist",
        due_at=starts,
        reminder_minutes=60,
        google_event_id="g-task",
    )
    db.add(task)
    db.commit()
    _connect(db, user)
    sign_in(user)
    moved = (datetime.now(UTC) + timedelta(days=5)).replace(microsecond=0)
    stamp = moved.isoformat().replace("+00:00", "Z")
    later = (datetime.now(UTC) + timedelta(minutes=1)).replace(microsecond=0)
    fake_google.pages = [
        {
            "items": [
                {
                    "id": "g-task",
                    "status": "confirmed",
                    "summary": "Dentist appointment",
                    "start": {"dateTime": stamp},
                    "end": {"dateTime": stamp},
                    "updated": later.isoformat().replace("+00:00", "Z"),
                }
            ],
            "nextSyncToken": "sync-2",
        }
    ]

    client.post("/api/google/sync")

    db.refresh(task)
    assert task.due_at is not None and task.due_at.replace(microsecond=0) == moved
    assert task.title == "Dentist appointment"
    # The task's twin is never imported as a duplicate calendar event.
    assert db.scalar(select(Event).where(Event.google_event_id == "g-task")) is None


def test_cancelling_a_task_event_keeps_the_task(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    starts = datetime.now(UTC) + timedelta(days=2)
    task = Task(owner_id=user.id, title="Keep me", due_at=starts, google_event_id="g-task")
    db.add(task)
    db.commit()
    _connect(db, user)
    sign_in(user)
    fake_google.pages = [{"items": [{"id": "g-task", "status": "cancelled"}], "nextSyncToken": "s"}]

    client.post("/api/google/sync")

    assert db.get(Task, task.id) is not None
    db.refresh(task)
    assert task.google_event_id == "g-task"


def test_auto_sync_skips_when_recent(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    account = _connect(db, user)
    account.last_sync_at = datetime.now(UTC)
    db.commit()
    sign_in(user)

    result = client.post("/api/google/sync?auto=true").json()

    assert result == {"pushed": 0, "pulled": 0, "skipped": 1}
    assert fake_google.list_calls == []


def test_auto_sync_runs_when_stale(
    client: TestClient, sign_in, make_user, db: DbSession, fake_google: FakeGoogle
) -> None:
    user = make_user(db)
    account = _connect(db, user)
    account.last_sync_at = datetime.now(UTC) - timedelta(days=1)
    db.commit()
    sign_in(user)
    fake_google.pages = [{"items": [], "nextSyncToken": "s"}]

    result = client.post("/api/google/sync?auto=true").json()

    assert result == {"pushed": 0, "pulled": 0}
    assert len(fake_google.list_calls) == 1
