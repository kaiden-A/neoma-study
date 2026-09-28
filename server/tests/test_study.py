"""Study sessions: aggregation, dashboard numbers and streak boundaries."""

import io
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import StudySession, User
from app.services import study_services


def _subject(client: TestClient, name: str) -> dict:
    response = client.post("/api/subjects", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def _note(client: TestClient, **overrides) -> dict:
    payload = {"title": "Week 1", "body": "x"}
    payload.update(overrides)
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _ms(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


def test_session_creation_uses_the_notes_subject(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    user = make_user(db)
    sign_in(user)
    subject = _subject(client, "Thermodynamics")
    note = _note(client, subjectId=subject["id"])
    started = datetime.now(UTC) - timedelta(minutes=25)

    response = client.post(
        "/api/study/sessions",
        json={
            "noteId": note["id"],
            "startedAt": _ms(started),
            "endedAt": _ms(started + timedelta(minutes=25)),
            "seconds": 1500,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["noteId"] == note["id"]
    assert body["noteTitle"] == "Week 1"
    assert body["subjectId"] == subject["id"]
    assert body["source"] == "timer"
    assert [item["id"] for item in client.get("/api/study/sessions").json()] == [body["id"]]


def test_session_ownership_and_clamping(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    note = _note(client)
    client.post("/api/auth/logout")

    sign_in(other)
    denied = client.post(
        "/api/study/sessions",
        json={"noteId": note["id"], "startedAt": _ms(datetime.now(UTC)), "seconds": 60},
    )
    assert denied.status_code == 404

    subject_denied = client.post(
        "/api/study/sessions",
        json={
            "startedAt": _ms(datetime.now(UTC)),
            "seconds": 60,
            "subjectId": "00000000-0000-0000-0000-000000000000",
        },
    )
    assert subject_denied.status_code == 404

    too_long = client.post(
        "/api/study/sessions",
        json={"startedAt": _ms(datetime.now(UTC)), "seconds": 90_000},
    )
    assert too_long.status_code == 422


def test_overview_dashboard_numbers(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    user = make_user(db)
    sign_in(user)
    subject = _subject(client, "Thermodynamics")
    blank = _note(client, subjectId=subject["id"], title="Blank")
    upload = client.post(
        "/api/files", files={"file": ("slides.pdf", io.BytesIO(b"%PDF"), "application/pdf")}
    ).json()
    _note(client, subjectId=subject["id"], title="With file", type="slides", fileId=upload["id"])

    card = client.post(
        "/api/flashcards", json={"noteId": blank["id"], "front": "Q", "back": "A"}
    ).json()
    assert card["dueAt"] > 0

    now = datetime.now(UTC)
    client.post(
        "/api/study/sessions",
        json={
            "noteId": blank["id"],
            "startedAt": _ms(now - timedelta(minutes=90)),
            "endedAt": _ms(now),
            "seconds": 5400,
        },
    )

    overview = client.get("/api/study/overview").json()

    assert overview["minutesThisWeek"] == 90
    assert overview["streakDays"] == 1
    stats = overview["subjects"][0]
    assert stats["name"] == "Thermodynamics"
    assert stats["notes"] == 2
    assert stats["files"] == 1
    assert stats["cardsDue"] == 1
    assert stats["minutesThisWeek"] == 90
    assert stats["lastStudiedAt"] is not None
    continued = overview["continueStudy"]
    assert continued["noteId"] == blank["id"]
    assert continued["page"] == 1


def test_continue_studying_remembers_position(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    sign_in(make_user(db))
    note = _note(client, title="Chapter 4")
    client.patch(
        f"/api/notes/{note['id']}",
        json={"study": {"position": {"page": 12, "scroll": 300}, "highlights": [], "timestamps": [372.0]}},
    )
    client.post(
        "/api/study/sessions",
        json={"noteId": note["id"], "startedAt": _ms(datetime.now(UTC)), "seconds": 120},
    )

    continued = client.get("/api/study/overview").json()["continueStudy"]

    assert continued["title"] == "Chapter 4"
    assert continued["page"] == 12
    assert continued["videoSeconds"] == 372.0


def test_streak_boundaries(db: DbSession, make_user) -> None:
    user: User = make_user(db)
    now = datetime(2026, 5, 20, 12, 0, tzinfo=UTC)

    def add_session(days_ago: int) -> None:
        moment = now - timedelta(days=days_ago)
        db.add(
            StudySession(
                user_id=user.id, started_at=moment, ended_at=moment, seconds=600, source="timer"
            )
        )

    add_session(0)
    add_session(1)
    add_session(3)
    db.commit()

    # Today and yesterday run; the gap at day 2 stops it.
    assert study_services.streak_days(db, user, now=now) == 2

    # Activity yesterday but none today still counts (the day is young).
    assert study_services.streak_days(db, user, now=now + timedelta(days=1)) == 2

    # Two days without activity ends the streak.
    assert study_services.streak_days(db, user, now=now + timedelta(days=2)) == 0


def test_week_minutes_reset(db: DbSession, make_user) -> None:
    user: User = make_user(db)
    monday = datetime(2026, 5, 18, 9, 0, tzinfo=UTC)  # Monday
    assert study_services.week_start(monday) == monday.replace(hour=0)

    db.add(
        StudySession(
            user_id=user.id,
            started_at=monday - timedelta(days=1),
            ended_at=monday,
            seconds=3600,
            source="timer",
        )
    )
    db.add(
        StudySession(
            user_id=user.id,
            started_at=monday + timedelta(hours=2),
            ended_at=monday + timedelta(hours=2),
            seconds=120,
            source="timer",
        )
    )
    db.commit()

    overview = study_services.overview(db, user, now=monday + timedelta(days=1))
    assert overview.minutesThisWeek == 2
