import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import GroupMember
from app.models.enums import GroupRole

MS_HOUR = 3_600_000


def _create(client: TestClient, **overrides) -> dict:
    starts = overrides.pop("startsAt", int(datetime.now(UTC).timestamp() * 1000) + 24 * MS_HOUR)
    payload = {"title": "Physics revision", "type": "personal", "startsAt": starts}
    payload.update(overrides)
    response = client.post("/api/events", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_event_defaults_and_update(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))

    event = _create(client)

    assert event["reminderMinutes"] == 60
    assert event["groupId"] is None
    assert event["endsAt"] is None

    patched = client.patch(
        f"/api/events/{event['id']}",
        json={"title": "Physics revision block", "type": "meeting", "reminderMinutes": 15},
    ).json()
    assert patched["title"] == "Physics revision block"
    assert patched["type"] == "meeting"
    assert patched["reminderMinutes"] == 15


def test_event_validation(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    starts = int(datetime.now(UTC).timestamp() * 1000)

    bad_title = client.post("/api/events", json={"title": "", "startsAt": starts})
    assert bad_title.status_code == 422

    ends_before = client.post(
        "/api/events",
        json={"title": "Nope", "startsAt": starts, "endsAt": starts - MS_HOUR},
    )
    assert ends_before.status_code == 422
    assert "end cannot be before" in ends_before.json()["error"]


def test_events_are_scoped(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    event = _create(client)
    client.post("/api/auth/logout")

    sign_in(other)
    assert client.get("/api/events").json() == []
    assert client.get(f"/api/events/{event['id']}").status_code == 404
    assert client.patch(f"/api/events/{event['id']}", json={"title": "x"}).status_code == 404


def test_group_events_visible_to_members(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    event = _create(client, title="Finals crew session", type="session", groupId=group["id"])
    client.post("/api/auth/logout")

    sign_in(member)
    assert client.get("/api/events").json() == []

    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()
    visible = client.get("/api/events").json()
    assert [item["id"] for item in visible] == [event["id"]]

    # Members can edit and delete group events.
    assert client.patch(f"/api/events/{event['id']}", json={"location": "Library"}).status_code == 200
    assert client.delete(f"/api/events/{event['id']}").status_code == 204


def test_event_filters_by_range(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    now = datetime.now(UTC)
    soon = int((now + timedelta(days=1)).timestamp() * 1000)
    later = int((now + timedelta(days=10)).timestamp() * 1000)
    _create(client, title="Soon", startsAt=soon)
    _create(client, title="Later", startsAt=later)

    start_ms = int(now.timestamp() * 1000)
    end_ms = int((now + timedelta(days=2)).timestamp() * 1000)
    window = client.get(f"/api/events?from={start_ms}&to={end_ms}").json()
    assert [item["title"] for item in window] == ["Soon"]


def test_ics_export_includes_events_and_task_deadlines(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    sign_in(make_user(db))
    event = _create(client, title="Physics revision", location="Library", notes="Bring the formula sheet")
    due = int((datetime.now(UTC) + timedelta(days=2)).timestamp() * 1000)
    client.post("/api/tasks", json={"title": "Literature review", "dueAt": due})

    response = client.get("/api/calendar.ics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    body = response.text
    assert body.startswith("BEGIN:VCALENDAR\r\n")
    assert body.rstrip().endswith("END:VCALENDAR")
    assert f"UID:{event['id']}@neoma.local" in body
    assert "SUMMARY:Physics revision" in body
    assert "LOCATION:Library" in body
    assert "TRIGGER:-PT60M" in body
    assert "BEGIN:VEVENT" in body
    assert body.count("BEGIN:VEVENT") == 2
    assert "Literature review" in body


def test_single_event_ics_and_google_link(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    event = _create(client, title="Group meeting", location="Room 3")

    ics = client.get(f"/api/events/{event['id']}/ics")
    assert ics.status_code == 200
    assert "attachment" in ics.headers["content-disposition"]
    assert "Group meeting" in ics.text

    google = client.get(f"/api/events/{event['id']}/google").json()["url"]
    assert google.startswith("https://calendar.google.com/calendar/render?")
    assert "action=TEMPLATE" in google
    assert "Group+meeting" in google
    assert "Added+from+Neoma" in google


def test_ics_escapes_and_folds_long_lines(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    long_title = "Revision " * 30
    event = _create(client, title=long_title, notes="semicolons; commas, and\nnewlines")

    body = client.get(f"/api/events/{event['id']}/ics").text

    assert "\\;" in body and "\\," in body and "\\n" in body
    assert "\r\n " in body  # folded continuation


def test_deleting_a_group_unlinks_its_events(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    event = _create(client, title="Session", type="session", groupId=group["id"])

    client.delete(f"/api/groups/{group['id']}")

    still_there = client.get(f"/api/events/{event['id']}").json()
    assert still_there["groupId"] is None


def test_bootstrap_includes_events(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    event = _create(client)

    body = client.get("/api/bootstrap").json()

    assert [item["id"] for item in body["events"]] == [event["id"]]
