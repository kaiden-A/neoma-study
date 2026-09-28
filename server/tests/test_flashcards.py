"""Flashcards: CRUD, ownership, the due queue and SM-2 scheduling."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Flashcard
from app.services import srs


def _note(client: TestClient, **overrides) -> dict:
    payload = {"type": "note", "title": "Thermo week 3", "body": "Entropy"}
    payload.update(overrides)
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _card(client: TestClient, note_id: str, **overrides) -> dict:
    payload = {"noteId": note_id, "front": "What is entropy?", "back": "Disorder"}
    payload.update(overrides)
    response = client.post("/api/flashcards", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_card_crud_and_ownership(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    note = _note(client)
    card = _card(client, note["id"])

    assert card["reps"] == 0 and card["lapses"] == 0
    assert card["intervalDays"] == 0 and card["ease"] == 2.5
    assert card["noteTitle"] == "Thermo week 3"
    assert card["suspended"] is False
    assert card["dueAt"] > 0

    patched = client.patch(f"/api/flashcards/{card['id']}", json={"front": "Define entropy"})
    assert patched.status_code == 200
    assert patched.json()["front"] == "Define entropy"

    assert [item["id"] for item in client.get("/api/flashcards").json()] == [card["id"]]
    assert [item["id"] for item in client.get(f"/api/flashcards?noteId={note['id']}").json()] == [card["id"]]
    client.post("/api/auth/logout")

    sign_in(other)
    assert client.get("/api/flashcards").json() == []
    assert client.patch(f"/api/flashcards/{card['id']}", json={"front": "Mine"}).status_code == 404
    assert client.post(f"/api/flashcards/{card['id']}/grade", json={"grade": "good"}).status_code == 404

    sign_in(owner)
    assert client.delete(f"/api/flashcards/{card['id']}").status_code == 204
    assert client.get("/api/flashcards").json() == []


def test_card_needs_a_visible_note(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))

    missing = client.post("/api/flashcards", json={"noteId": "not-a-uuid", "front": "x"})
    assert missing.status_code == 422

    ghost = client.post(
        "/api/flashcards",
        json={"noteId": "00000000-0000-0000-0000-000000000000", "front": "x"},
    )
    assert ghost.status_code == 404

    empty = client.post("/api/flashcards", json={"noteId": _note(client)["id"], "front": "   "})
    assert empty.status_code == 422


def test_due_queue_filters_and_suspends(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    user = make_user(db)
    sign_in(user)
    note = _note(client)
    soon = _card(client, note["id"], front="Soon?")
    _card(client, note["id"], front="Later?")

    rows = list(db.scalars(select(Flashcard).order_by(Flashcard.created_at)))
    rows[0].due_at = datetime.now(UTC) - timedelta(hours=1)
    rows[1].due_at = datetime.now(UTC) + timedelta(days=3)
    db.commit()

    due = client.get("/api/flashcards?due=true").json()
    assert [item["id"] for item in due] == [soon["id"]]

    soon_row = db.get(Flashcard, uuid.UUID(soon["id"]))
    assert soon_row is not None
    soon_row.suspended = True
    db.commit()
    assert client.get("/api/flashcards?due=true").json() == []

    assert len(client.get("/api/flashcards").json()) == 2


def test_grade_good_moves_interval(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client)
    card = _card(client, note["id"])

    first = client.post(f"/api/flashcards/{card['id']}/grade", json={"grade": "good"}).json()
    assert first["reps"] == 1
    assert first["intervalDays"] == 1
    assert first["ease"] == 2.5  # good (4) is exactly ease-neutral in SM-2
    assert timedelta(hours=23) < _until(first["dueAt"]) < timedelta(hours=25)

    second = client.post(f"/api/flashcards/{card['id']}/grade", json={"grade": "easy"}).json()
    assert second["reps"] == 2
    assert second["intervalDays"] == 6
    assert second["ease"] > first["ease"]


def test_grade_again_resets(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client)
    card = _card(client, note["id"])
    client.post(f"/api/flashcards/{card['id']}/grade", json={"grade": "good"})

    again = client.post(f"/api/flashcards/{card['id']}/grade", json={"grade": "again"}).json()

    assert again["reps"] == 0
    assert again["lapses"] == 1
    assert again["intervalDays"] == 0
    assert _until(again["dueAt"]) < timedelta(minutes=11)


def test_srs_schedule_math() -> None:
    now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    good = srs.review(ease=2.5, interval_days=0, reps=0, lapses=0, grade="good", now=now)
    assert good.interval_days == 1 and good.reps == 1
    assert good.due_at == now + timedelta(days=1)

    sixth = srs.review(ease=2.5, interval_days=1, reps=1, lapses=0, grade="good", now=now)
    assert sixth.interval_days == 6 and sixth.reps == 2

    third = srs.review(ease=2.5, interval_days=6, reps=2, lapses=0, grade="good", now=now)
    assert third.interval_days == 15  # round(6 * 2.5)

    hard = srs.review(ease=2.5, interval_days=6, reps=2, lapses=0, grade="hard", now=now)
    assert hard.ease < 2.5
    assert hard.interval_days < third.interval_days

    failed = srs.review(ease=2.5, interval_days=15, reps=3, lapses=1, grade="again", now=now)
    assert failed.reps == 0 and failed.lapses == 2
    assert failed.due_at == now + timedelta(minutes=10)

    floored = srs.review(ease=1.3, interval_days=1, reps=1, lapses=5, grade="again", now=now)
    assert floored.ease == 1.3


def test_review_notification_and_bootstrap(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client)
    _card(client, note["id"])

    notifications = client.get("/api/notifications").json()
    review = [item for item in notifications if item["group"] == "review"]
    assert len(review) == 1
    assert review[0]["route"] == "/review"

    assert len(client.get("/api/bootstrap").json()["flashcards"]) == 1

    updated = client.patch("/api/settings", json={"kinds": {"review": False}}).json()
    assert updated["kinds"]["review"] is False
    assert [item for item in client.get("/api/notifications").json() if item["group"] == "review"] == []


def test_mcp_flashcard_tools(
    client: TestClient, mcp_env, mcp_key: str, sign_in
) -> None:
    from tests.test_mcp import _call, _payload

    sign_in(mcp_env)
    created_note = client.post("/api/notes", json={"title": "MCP card note", "body": "x"})
    assert created_note.status_code == 201
    note_id = created_note.json()["id"]

    created = _call(client, "create_card", {"note_id": note_id, "front": "Q", "back": "A"}, mcp_key)
    card: Any = _payload(created)
    assert card["front"] == "Q" and card["noteTitle"] == "MCP card note"

    due = _payload(_call(client, "list_due_cards", {}, mcp_key))
    assert [item["id"] for item in due] == [card["id"]]

    graded = _payload(_call(client, "grade_card", {"card_id": card["id"], "grade": "easy"}, mcp_key))
    assert graded["reps"] == 1
    assert graded["dueAt"] > 0

    bad = _call(client, "grade_card", {"card_id": card["id"], "grade": "nope"}, mcp_key)
    assert bad.get("isError") is True


def _until(ms: int) -> timedelta:
    return datetime.fromtimestamp(ms / 1000, tz=UTC) - datetime.now(UTC)
