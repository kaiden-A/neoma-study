from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import EmailLog, GroupMember, NotificationState
from app.models import Session as SessionRow
from app.models.enums import GroupRole
from app.services import reminder_services

settings = get_settings()
MS_HOUR = 3_600_000


def _task(client: TestClient, **overrides) -> dict:
    payload = {"title": "Literature review", "priority": "med"}
    payload.update(overrides)
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _event(client: TestClient, **overrides) -> dict:
    starts = overrides.pop("startsAt", int(datetime.now(UTC).timestamp() * 1000) + 24 * MS_HOUR)
    payload = {"title": "Physics revision", "type": "personal", "startsAt": starts}
    payload.update(overrides)
    response = client.post("/api/events", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_overdue_and_due_soon(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    past = int((datetime.now(UTC) - timedelta(hours=2)).timestamp() * 1000)
    soon = int((datetime.now(UTC) + timedelta(hours=3)).timestamp() * 1000)
    _task(client, title="Late thing", dueAt=past)
    _task(client, title="Soon thing", dueAt=soon)
    _task(client, title="Undated thing")

    items = client.get("/api/notifications").json()

    ids = {item["id"] for item in items}
    assert any(item.startswith("overdue:") for item in ids)
    assert any(item.startswith("due:") for item in ids)
    assert len(items) == 2
    assert items[0]["group"] == "overdue"
    assert items[0]["tone"] == "danger"


def test_lead_time_and_kind_gates(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    far = int((datetime.now(UTC) + timedelta(hours=100)).timestamp() * 1000)
    _task(client, title="Far thing", dueAt=far)

    assert client.get("/api/notifications").json() == []

    client.patch("/api/settings", json={"leadTimeHours": 168})
    assert len(client.get("/api/notifications").json()) == 1

    client.patch("/api/settings", json={"kinds": {"dueSoon": False}})
    assert client.get("/api/notifications").json() == []


def test_assigned_to_you_excludes_self_created(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    db.add(GroupMember(group_id=group["id"], user_id=member.id, role=GroupRole.member))
    db.commit()
    _task(client, title="Maya's job", groupId=group["id"], assigneeIds=[str(member.id)])
    _task(client, title="Ada's own job", groupId=group["id"], assigneeIds=[str(owner.id)])
    client.post("/api/auth/logout")

    sign_in(member)
    items = client.get("/api/notifications").json()

    assigned = [item for item in items if item["group"] == "assigned"]
    assert [item["title"] for item in assigned] == ["Maya's job"]
    assert "Ada put this on you" in assigned[0]["body"]


def test_session_and_exam_milestones(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    soon = int((datetime.now(UTC) + timedelta(minutes=30)).timestamp() * 1000)
    _event(client, title="Study night", type="session", groupId=group["id"], startsAt=soon)
    in_three_days = int((datetime.now(UTC) + timedelta(days=3, hours=1)).timestamp() * 1000)
    _event(client, title="CHEM210 midterm", type="exam", startsAt=in_three_days)

    items = client.get("/api/notifications").json()
    groups = {item["group"] for item in items}

    assert "sessions" in groups and "exams" in groups
    session = next(item for item in items if item["group"] == "sessions")
    assert session["body"].startswith("Starts in under an hour")
    assert session["tone"] == "today"
    exam = next(item for item in items if item["group"] == "exams")
    assert exam["body"].startswith("In 3 days")


def test_personal_sessions_do_not_notify(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    soon = int((datetime.now(UTC) + timedelta(hours=2)).timestamp() * 1000)
    _event(client, title="Solo session", type="session", startsAt=soon)

    assert client.get("/api/notifications").json() == []


def test_shared_note_notification(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    client.post(f"/api/groups/{group['id']}/notes", json={"title": "Week 5 summary", "body": "…"})
    client.post("/api/auth/logout")

    sign_in(member)
    # Not a member yet: nothing.
    assert client.get("/api/notifications").json() == []

    db.add(GroupMember(group_id=group["id"], user_id=member.id, role=GroupRole.member))
    db.commit()
    items = client.get("/api/notifications").json()
    notes = [item for item in items if item["group"] == "notes"]
    assert [item["title"] for item in notes] == ["Week 5 summary"]
    assert "Ada shared a note" in notes[0]["body"]


def test_read_snooze_and_read_all(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    past = int((datetime.now(UTC) - timedelta(hours=2)).timestamp() * 1000)
    _task(client, title="Late thing", dueAt=past)
    item_id = client.get("/api/notifications").json()[0]["id"]

    marked = client.post("/api/notifications/read", json={"ids": [item_id]}).json()
    assert marked[0]["read"] is True

    snoozed = client.post("/api/notifications/snooze", json={"id": item_id, "minutes": 60}).json()
    assert snoozed == []  # snoozed items disappear from the list

    assert client.post("/api/notifications/read-all").json() == []
    stored = db.query(NotificationState).all()
    assert len(stored) >= 1


def test_bootstrap_includes_notifications(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    past = int((datetime.now(UTC) - timedelta(hours=1)).timestamp() * 1000)
    _task(client, title="Late thing", dueAt=past)

    body = client.get("/api/bootstrap").json()

    assert [item["group"] for item in body["notifications"]] == ["overdue"]


def test_reminder_digest_sends_once_per_day(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    user = make_user(db, name="Ada Lovelace", email="ada@example.com")
    sign_in(user)
    past = int((datetime.now(UTC) - timedelta(hours=1)).timestamp() * 1000)
    _task(client, title="Late thing", dueAt=past)

    first = reminder_services.send_reminders(db)
    second = reminder_services.send_reminders(db)

    assert first["sent"] == 1 and first["users"] == 1
    assert second["sent"] == 0 and second["skipped"] == 1
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "ada@example.com"
    assert "Late thing" in sent_emails[0]["html"]
    assert "Turn off reminder emails" in sent_emails[0]["text"]
    assert db.query(EmailLog).filter(EmailLog.kind == "digest").count() == 1


def test_reminder_dry_run_does_not_send(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    sign_in(make_user(db))
    past = int((datetime.now(UTC) - timedelta(hours=1)).timestamp() * 1000)
    _task(client, title="Late thing", dueAt=past)

    result = reminder_services.send_reminders(db, dry_run=True)

    assert result["sent"] == 1
    assert sent_emails == []
    assert db.query(EmailLog).count() == 0


def test_maintenance_endpoints_need_the_secret(
    client: TestClient, sign_in, make_user, db: DbSession, monkeypatch
) -> None:
    user = make_user(db)
    sign_in(user)
    monkeypatch.setattr(settings, "cleanup_secret", "")

    assert client.post("/api/maintenance/send-reminders").status_code == 403
    assert client.post("/api/maintenance/cleanup").status_code == 403

    monkeypatch.setattr(settings, "cleanup_secret", "let-me-in")
    assert (
        client.post(
            "/api/maintenance/send-reminders?dry_run=true", headers={"X-Cleanup-Secret": "nope"}
        ).status_code
        == 403
    )
    ok = client.post(
        "/api/maintenance/send-reminders?dry_run=true", headers={"X-Cleanup-Secret": "let-me-in"}
    )
    assert ok.status_code == 200
    assert "users" in ok.json()

    # An expired session is what cleanup is for; make one and check the count.
    expired = SessionRow(
        token_hash="deadbeef",
        user_id=user.id,
        expires_at=datetime.now(UTC) - timedelta(days=2),
    )
    db.add(expired)
    db.commit()

    cleanup = client.post("/api/maintenance/cleanup", headers={"X-Cleanup-Secret": "let-me-in"})
    assert cleanup.status_code == 200
    assert cleanup.json()["sessions"] == 1
    assert db.get(SessionRow, "deadbeef") is None


def test_unsubscribe_turns_reminders_off(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    user = make_user(db, name="Ada", email="ada@example.com")
    sign_in(user)
    past = int((datetime.now(UTC) - timedelta(hours=1)).timestamp() * 1000)
    _task(client, title="Late thing", dueAt=past)

    url = reminder_services.unsubscribe_url(user)
    response = client.get(url.replace(settings.public_base_url, ""))

    assert response.status_code == 200
    assert "Reminder emails are off" in response.text

    result = reminder_services.send_reminders(db)
    assert result["sent"] == 0

    bad = client.get(f"/api/email/unsubscribe?token=wrong&user={user.id}")
    assert bad.status_code == 404
