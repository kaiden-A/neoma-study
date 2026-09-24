"""Assignment and session notices: Neoma's own email replaced Google invitations."""

import base64
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import GroupMember, Task
from app.models.enums import GroupRole
from app.services import ics_services, settings_services

MS_HOUR = 3_600_000


def _create_group(client: TestClient, name: str = "Finals crew") -> dict:
    response = client.post(
        "/api/groups",
        json={"kind": "study", "name": name, "subject": "", "color": "violet", "description": ""},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _add_member(db: DbSession, group: dict, user) -> None:
    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=user.id, role=GroupRole.member))
    db.commit()


def _create_task(client: TestClient, **overrides) -> dict:
    due = overrides.pop("dueAt", int(datetime.now(UTC).timestamp() * 1000) + 24 * MS_HOUR)
    payload: dict = {"title": "Revise chapter 4", "dueAt": due}
    payload.update(overrides)
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _create_event(client: TestClient, **overrides) -> dict:
    starts = overrides.pop("startsAt", int(datetime.now(UTC).timestamp() * 1000) + 24 * MS_HOUR)
    payload = {"title": "Finals crew session", "type": "session", "startsAt": starts}
    payload.update(overrides)
    response = client.post("/api/events", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _turn_off(db: DbSession, user, **flags) -> None:
    current = settings_services.read_settings(user)
    current.kinds = current.kinds.model_copy(update=flags)
    settings_services.write_settings(db, user, current)


def _ics_text(call: dict) -> str:
    attachment = call["attachments"][0]
    raw = base64.b64decode(attachment["content"]).decode("utf-8")
    # RFC 5545 folds long lines; unfold before asserting on their content.
    return raw.replace("\r\n ", "")


def test_assigning_a_member_emails_them(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = _create_group(client)
    _add_member(db, group, member)

    task = _create_task(client, groupId=group["id"], assigneeIds=[str(member.id)])

    assert len(sent_emails) == 1
    call = sent_emails[0]
    assert call["to"] == "maya@example.com"
    assert "Ada" in call["subject"] and "Revise chapter 4" in call["subject"]
    assert "Open in Neoma" in call["html"]
    assert "Add to Google Calendar" in call["html"]
    assert len(call["attachments"]) == 1
    assert call["attachments"][0]["filename"].endswith(".ics")
    ics = _ics_text(call)
    assert "BEGIN:VEVENT" in ics
    assert f"Neoma id: {task['id']}" in ics
    assert "TRIGGER:-PT60M" in ics  # the task's own reminder, not a default


def test_every_assignee_gets_their_own_email(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    maya = make_user(db, name="Maya", email="maya@example.com")
    noah = make_user(db, name="Noah", email="noah@example.com")
    sign_in(owner)
    group = _create_group(client)
    _add_member(db, group, maya)
    _add_member(db, group, noah)

    _create_task(client, groupId=group["id"], assigneeIds=[str(maya.id), str(noah.id)])

    assert sorted(call["to"] for call in sent_emails) == ["maya@example.com", "noah@example.com"]


def test_self_assignment_is_skipped(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    sign_in(owner)
    group = _create_group(client)

    _create_task(client, groupId=group["id"], assigneeIds=[str(owner.id)])

    assert sent_emails == []


def test_assignment_respects_the_recipients_setting(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = _create_group(client)
    _add_member(db, group, member)
    _turn_off(db, member, assigned=False)

    _create_task(client, groupId=group["id"], assigneeIds=[str(member.id)])

    assert sent_emails == []


def test_repeat_assignment_does_not_resend(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = _create_group(client)
    _add_member(db, group, member)
    task = _create_task(client, groupId=group["id"], assigneeIds=[str(member.id)])

    client.patch(f"/api/tasks/{task['id']}", json={"assigneeIds": [str(member.id)]})

    assert len(sent_emails) == 1


def test_task_moved_emails_the_assignees_once(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = _create_group(client)
    _add_member(db, group, member)
    task = _create_task(client, groupId=group["id"], assigneeIds=[str(member.id)])
    moved = int(datetime.now(UTC).timestamp() * 1000) + 72 * MS_HOUR

    client.patch(f"/api/tasks/{task['id']}", json={"dueAt": moved})
    client.patch(f"/api/tasks/{task['id']}", json={"dueAt": moved})

    assert len(sent_emails) == 2
    assert "moved" in sent_emails[1]["subject"]
    assert len(sent_emails[1]["attachments"]) == 1


def test_session_created_moved_and_cancelled(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = _create_group(client)
    _add_member(db, group, member)

    event = _create_event(client, groupId=group["id"])
    assert len(sent_emails) == 1
    assert "scheduled" in sent_emails[0]["subject"].lower() or "session" in sent_emails[0]["subject"].lower()
    assert f"Neoma id: {event['id']}" in _ics_text(sent_emails[0])

    moved = int(datetime.now(UTC).timestamp() * 1000) + 72 * MS_HOUR
    client.patch(f"/api/events/{event['id']}", json={"startsAt": moved})
    assert len(sent_emails) == 2
    assert "moved" in sent_emails[1]["subject"]

    client.delete(f"/api/events/{event['id']}")
    assert len(sent_emails) == 3
    cancelled = sent_emails[2]
    assert "cancel" in cancelled["subject"]
    assert cancelled["attachments"] == []
    assert "Add to Google Calendar" not in cancelled["html"]


def test_personal_events_never_email(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    sign_in(make_user(db, name="Ada", email="ada@example.com"))

    event = _create_event(client)
    moved = int(datetime.now(UTC).timestamp() * 1000) + 72 * MS_HOUR
    client.patch(f"/api/events/{event['id']}", json={"startsAt": moved})
    client.delete(f"/api/events/{event['id']}")

    assert sent_emails == []


def test_cancellation_only_reaches_the_notified(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = _create_group(client)
    _add_member(db, group, member)
    _turn_off(db, member, sessions=False)
    event = _create_event(client, groupId=group["id"])
    assert sent_emails == []
    _turn_off(db, member, sessions=True)

    client.delete(f"/api/events/{event['id']}")

    assert sent_emails == []


def test_task_google_url_carries_the_marker() -> None:
    task = Task(
        id=uuid.uuid4(),
        title="Lab report",
        due_at=datetime.now(UTC) + timedelta(days=1),
        reminder_minutes=60,
    )

    url = ics_services.task_google_url(task, "Capstone")

    assert url is not None
    details = parse_qs(urlparse(url).query)["details"][0]
    assert f"Neoma id: {task.id}" in details
