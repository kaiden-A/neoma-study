"""Quizzes: generation, CRUD, ownership and server-side scoring."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Quiz


def _note(client: TestClient, **overrides) -> dict:
    payload = {
        "type": "note",
        "title": "Thermo week 3",
        "body": (
            "Entropy: a measure of disorder\n"
            "Enthalpy: heat content at constant pressure\n"
            "Osmosis: movement of water across a membrane\n"
            "Catalyst: speeds a reaction without being consumed"
        ),
    }
    payload.update(overrides)
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _quiz_payload(note_id: str) -> dict:
    return {
        "noteId": note_id,
        "title": "Thermo quiz",
        "questions": [
            {
                "kind": "mcq",
                "prompt": "What is entropy?",
                "options": [
                    "A measure of disorder",
                    "Heat content at constant pressure",
                    "A reaction rate",
                    "A membrane",
                ],
                "answerIndex": 0,
                "source": "Entropy: a measure of disorder",
            },
            {
                "kind": "true_false",
                "prompt": "True or false: Enthalpy is heat content at constant pressure.",
                "options": ["True", "False"],
                "answerIndex": 0,
                "source": "Enthalpy: heat content at constant pressure",
            },
            {
                "kind": "short",
                "prompt": "Explain osmosis.",
                "modelAnswer": "Movement of water across a membrane",
                "keyPoints": ["movement of water", "across a membrane"],
                "source": "Osmosis: movement of water across a membrane",
            },
        ],
    }


def _create_quiz(client: TestClient, note_id: str) -> dict:
    response = client.post("/api/quizzes", json=_quiz_payload(note_id))
    assert response.status_code == 201, response.text
    return response.json()


def test_generate_previews_without_writing(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client)

    response = client.post(
        "/api/quizzes/generate",
        json={"noteId": note["id"], "objective": 5, "subjective": 2},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["noteId"] == note["id"]
    assert body["noteTitle"] == "Thermo week 3"
    assert body["engine"] == "rules" and body["refined"] is False
    assert body["questions"]
    assert {question["kind"] for question in body["questions"]} <= {
        "mcq",
        "true_false",
        "short",
    }
    assert any(question["kind"] == "mcq" for question in body["questions"])
    assert any(question["kind"] == "short" for question in body["questions"])
    for question in body["questions"]:
        if question["kind"] == "mcq":
            assert 2 <= len(question["options"]) <= 4
            assert question["options"][question["answerIndex"]]
        if question["kind"] == "short":
            assert question["modelAnswer"]
            assert len(question["keyPoints"]) >= 2
    assert db.scalars(select(Quiz)).all() == []


def test_generate_respects_counts_and_notices(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client, body="Entropy: a measure of disorder")

    body = client.post(
        "/api/quizzes/generate",
        json={"noteId": note["id"], "objective": 10, "subjective": 5},
    ).json()
    assert len(body["questions"]) <= 15
    assert body["notice"]
    assert "of 15 questions" in body["notice"]


def test_quiz_crud_and_ownership(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    note = _note(client)
    quiz = _create_quiz(client, note["id"])

    assert quiz["noteId"] == note["id"]
    assert quiz["noteTitle"] == "Thermo week 3"
    assert quiz["questionCount"] == 3
    assert quiz["objectiveCount"] == 2
    assert quiz["writtenCount"] == 1
    assert quiz["lastAttempt"] is None
    mcq = next(q for q in quiz["questions"] if q["kind"] == "mcq")
    assert mcq["options"][mcq["answerIndex"]] == "A measure of disorder"

    listed = client.get(f"/api/quizzes?noteId={note['id']}").json()
    assert [item["id"] for item in listed] == [quiz["id"]]
    assert listed[0]["questionCount"] == 3

    fetched = client.get(f"/api/quizzes/{quiz['id']}").json()
    assert fetched["title"] == "Thermo quiz"
    assert len(fetched["questions"]) == 3

    bootstrap = client.get("/api/bootstrap").json()
    assert [item["id"] for item in bootstrap["quizzes"]] == [quiz["id"]]

    client.post("/api/auth/logout")
    sign_in(other)
    assert client.get("/api/quizzes").json() == []
    assert client.get(f"/api/quizzes/{quiz['id']}").status_code == 404
    assert client.delete(f"/api/quizzes/{quiz['id']}").status_code == 404

    sign_in(owner)
    assert client.delete(f"/api/quizzes/{quiz['id']}").status_code == 204
    assert client.get("/api/quizzes").json() == []


def test_quiz_rejects_bad_shapes(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client)

    base = _quiz_payload(note["id"])
    base["questions"][0]["answerIndex"] = 4
    assert client.post("/api/quizzes", json=base).status_code == 422

    base = _quiz_payload(note["id"])
    base["questions"][1]["options"] = ["Yes", "No"]
    assert client.post("/api/quizzes", json=base).status_code == 422

    base = _quiz_payload(note["id"])
    base["questions"][2]["keyPoints"] = ["only one"]
    assert client.post("/api/quizzes", json=base).status_code == 422

    assert (
        client.post(
            "/api/quizzes",
            json={"noteId": "not-a-uuid", "title": "x", "questions": _quiz_payload(note["id"])["questions"]},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/quizzes",
            json={
                "noteId": "00000000-0000-0000-0000-000000000000",
                "title": "x",
                "questions": _quiz_payload(note["id"])["questions"],
            },
        ).status_code
        == 404
    )


def test_attempt_scores_objective_and_key_points(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    sign_in(make_user(db))
    note = _note(client)
    quiz = _create_quiz(client, note["id"])
    questions = quiz["questions"]
    mcq_index = next(index for index, q in enumerate(questions) if q["kind"] == "mcq")
    tf_index = next(index for index, q in enumerate(questions) if q["kind"] == "true_false")
    short_index = next(index for index, q in enumerate(questions) if q["kind"] == "short")
    mcq = questions[mcq_index]
    tf = questions[tf_index]

    response = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        json={
            "answers": [
                {"index": mcq_index, "choice": mcq["answerIndex"]},
                {"index": tf_index, "choice": 1 - tf["answerIndex"]},
                {"index": short_index, "text": "Water moves across a membrane.", "covered": [0, 1]},
            ]
        },
    )
    assert response.status_code == 201, response.text
    attempt = response.json()
    assert attempt["objectiveCorrect"] == 1
    assert attempt["objectiveTotal"] == 2
    assert attempt["writtenCovered"] == 2
    assert attempt["writtenTotal"] == 2
    assert len(attempt["answers"]) == 3

    fetched = client.get(f"/api/quizzes/{quiz['id']}").json()
    assert fetched["lastAttempt"]["id"] == attempt["id"]
    assert fetched["lastAttempt"]["objectiveCorrect"] == 1

    empty = client.post(f"/api/quizzes/{quiz['id']}/attempts", json={"answers": []}).json()
    assert empty["objectiveCorrect"] == 0
    assert empty["writtenCovered"] == 0

    too_many = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        json={"answers": [{"index": 3, "choice": 0}]},
    )
    assert too_many.status_code == 422

    duplicate = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        json={
            "answers": [
                {"index": mcq_index, "choice": 0},
                {"index": mcq_index, "choice": 1},
            ]
        },
    )
    assert duplicate.status_code == 422


def test_note_delete_cascades_quizzes(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client)
    quiz = _create_quiz(client, note["id"])
    assert db.get(Quiz, uuid.UUID(quiz["id"])) is not None

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert db.scalars(select(Quiz)).all() == []
