"""The Elpis refine pass and page context: ownership, fallbacks and shape."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.models import MoodleAnnouncement, MoodleAssignment, MoodleCourse
from app.schemas.ai import ChatMessageIn
from app.schemas.study import FlashcardDraft
from app.services import ai_services


def _settings(**overrides) -> Settings:
    values = {
        "_env_file": None,
        "database_url": "postgresql://user@localhost/neoma",
        "librechat_base_url": "https://elpis.test/api/agents/v1",
        "librechat_api_key": "secret",
        "librechat_refine_agent_id": "agent_refine",
    }
    values.update(overrides)
    return Settings(**values)


class FakeResponse:
    def __init__(self, payload: object, error: Exception | None = None) -> None:
        self._payload = payload
        self._error = error

    def raise_for_status(self) -> None:
        if self._error is not None:
            raise self._error

    def json(self) -> object:
        return self._payload


class FakeStream:
    status_code: int = 200

    def __init__(self, lines: list[str]) -> None:
        self._lines = lines

    def __enter__(self) -> "FakeStream":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def iter_lines(self):
        return iter(self._lines)


class FakeClient:
    payload: object = {}
    error: Exception | None = None
    calls: list[dict] = []
    lines: list[str] = []
    stream_calls: list[dict] = []

    def __init__(self, *args, **kwargs) -> None:
        del args
        self._timeout = kwargs.get("timeout")

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def post(self, url: str, json: dict | None = None, headers: dict | None = None) -> FakeResponse:
        FakeClient.calls.append({"url": url, "json": json or {}, "headers": headers or {}})
        if FakeClient.error is not None:
            raise FakeClient.error
        return FakeResponse(FakeClient.payload)

    def stream(self, method: str, url: str, json: dict | None = None, headers: dict | None = None):
        FakeClient.stream_calls.append(
            {"method": method, "url": url, "json": json or {}, "headers": headers or {}}
        )
        if FakeClient.error is not None:
            raise FakeClient.error
        return FakeStream(FakeClient.lines)


@pytest.fixture
def fake_http(monkeypatch) -> type[FakeClient]:
    FakeClient.payload = {}
    FakeClient.error = None
    FakeClient.calls = []
    FakeClient.lines = []
    FakeClient.stream_calls = []
    monkeypatch.setattr(ai_services.httpx, "Client", FakeClient)
    return FakeClient


def _completion(payload: dict) -> dict:
    return {"choices": [{"message": {"content": json.dumps(payload)}}]}


def _card(**overrides) -> FlashcardDraft:
    values: dict[str, object] = {
        "front": "What is Entropy?",
        "back": "a state function",
        "kind": "basic",
        "source": "Entropy is a state function.",
    }
    values.update(overrides)
    return FlashcardDraft.model_validate(values)


def test_refine_rewrites_the_front_and_keeps_the_answer(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion(
        {
            "cards": [
                {
                    "index": 0,
                    "front": "In thermodynamics, what is entropy?",
                    "distractors": ["A path function", "A temperature scale", "A reaction rate"],
                }
            ]
        }
    )

    result = ai_services.refine_cards([_card()], note_title="Thermo week 3")

    assert result.refined is True and result.configured is True
    assert result.cards[0].front == "In thermodynamics, what is entropy?"
    assert result.cards[0].back == "a state function"
    assert result.cards[0].distractors == ["A path function", "A temperature scale", "A reaction rate"]
    call = fake_http.calls[0]
    assert call["url"] == "https://elpis.test/api/agents/v1/chat/completions"
    assert call["json"]["model"] == "agent_refine"
    assert call["headers"]["Authorization"] == "Bearer secret"


def test_cloze_must_keep_its_blank(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion({"cards": [{"index": 0, "front": "Entropy is what kind of function?"}]})
    card = _card(front="Entropy is a ___.", back="state function", kind="cloze")

    result = ai_services.refine_cards([card], note_title="Thermo")

    assert result.refined is False
    assert result.cards[0].front == "Entropy is a ___."


def test_basic_front_must_not_leak_the_answer(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion({"cards": [{"index": 0, "front": "Is entropy disorder?"}]})
    card = _card(front="What is entropy?", back="disorder")

    result = ai_services.refine_cards([card], note_title="Thermo")

    assert result.refined is False
    assert result.cards[0].front == "What is entropy?"


def test_bad_json_falls_back_to_the_rules_cards(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = {"choices": [{"message": {"content": "not json at all"}}]}
    cards = [_card()]

    result = ai_services.refine_cards(cards, note_title="Thermo")

    assert result.refined is False
    assert result.configured is True
    assert result.cards == cards


def test_upstream_error_falls_back(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.error = RuntimeError("connection refused")
    cards = [_card()]

    result = ai_services.refine_cards(cards, note_title="Thermo")

    assert result.refined is False
    assert result.cards == cards


def test_unconfigured_does_not_call_elpis(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_refine_agent_id=""))
    cards = [_card()]

    result = ai_services.refine_cards(cards, note_title="Thermo")

    assert result.configured is False
    assert result.refined is False
    assert fake_http.calls == []


def test_distractors_are_cleaned_and_capped(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion(
        {
            "cards": [
                {
                    "index": 0,
                    "front": "What is entropy?",
                    "distractors": [
                        "A state function",
                        " a path function ",
                        "A path function",
                        "A temperature",
                        "A reaction rate",
                        "One too many",
                    ],
                }
            ]
        }
    )

    result = ai_services.refine_cards([_card()], note_title="Thermo")

    assert result.cards[0].distractors == ["a path function", "A temperature", "A reaction rate"]


def test_status_endpoint_reports_capabilities(
    client: TestClient, sign_in, make_user, db, monkeypatch
) -> None:
    sign_in(make_user(db))
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())

    assert client.get("/api/ai/status").json() == {"configured": True, "refine": True, "chat": False}


def test_generate_refine_wiring(client: TestClient, sign_in, make_user, db, monkeypatch, fake_http) -> None:
    sign_in(make_user(db))
    note = client.post(
        "/api/notes",
        json={"type": "note", "title": "Thermo", "body": "Entropy is a state function."},
    ).json()
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion(
        {
            "cards": [
                {
                    "index": 0,
                    "front": "In your own words, what is entropy?",
                    "distractors": ["A path function", "A type of energy", "A reaction rate"],
                }
            ]
        }
    )

    body = client.post(
        "/api/flashcards/generate", json={"noteId": note["id"], "refine": True, "quiz": True}
    ).json()

    assert body["engine"] == "ai" and body["refined"] is True
    assert body["notice"] is None
    assert body["cards"][0]["front"] == "In your own words, what is entropy?"
    assert body["cards"][0]["back"] == "a state function."
    assert body["cards"][0]["kind"] == "choice"
    assert len(body["cards"][0]["distractors"]) == 3


def test_chat_stream_normalizes_chunks(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    fake_http.lines = [
        'data: {"choices":[{"delta":{"content":"Hel"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":"lo"}}]}',
        "data: [DONE]",
    ]

    frames = list(
        ai_services.chat_stream([ChatMessageIn(role="user", content="hi")], context="Title: Thermo")
    )

    assert 'data: {"text": "Hel"}\n\n' in frames
    assert 'data: {"text": "lo"}\n\n' in frames
    assert frames[-1] == 'data: {"done": true}\n\n'
    call = fake_http.stream_calls[0]
    assert call["url"] == "https://elpis.test/api/agents/v1/chat/completions"
    assert call["json"]["model"] == "agent_chat"
    assert "Title: Thermo" in call["json"]["messages"][0]["content"]


def test_chat_stream_upstream_error_is_an_event(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    fake_http.error = httpx.ConnectError("down")

    frames = list(ai_services.chat_stream([ChatMessageIn(role="user", content="hi")]))

    assert any('"error"' in frame for frame in frames)


def test_chat_endpoint_unconfigured(client: TestClient, sign_in, make_user, db, monkeypatch) -> None:
    sign_in(make_user(db))
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id=""))

    response = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})

    assert response.status_code == 503
    assert response.json() == {"error": "The assistant is not connected yet."}


def test_chat_endpoint_streams_note_context(
    client: TestClient, sign_in, make_user, db, monkeypatch, fake_http
) -> None:
    sign_in(make_user(db))
    note = client.post(
        "/api/notes",
        json={"type": "note", "title": "Thermo", "body": "Entropy is a state function."},
    ).json()
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    fake_http.lines = ['data: {"choices":[{"delta":{"content":"It is a state function."}}]}']

    response = client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "What is entropy?"}],
            "context": {"noteId": note["id"]},
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert '"text": "It is a state function."' in response.text
    system = fake_http.stream_calls[0]["json"]["messages"][0]["content"]
    assert "Entropy is a state function." in system


def test_chat_context_is_owner_scoped(
    client: TestClient, sign_in, make_user, db, monkeypatch, fake_http
) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    note = client.post(
        "/api/notes",
        json={"type": "note", "title": "Private", "body": "Entropy is a state function."},
    ).json()
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))

    sign_in(other)
    response = client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "What is entropy?"}],
            "context": {"noteId": note["id"]},
        },
    )

    assert response.status_code == 404


def _course(
    db,
    user,
    *,
    course_id: int = 777,
    shortname: str = "BICS2301",
    fullname: str = "Operating Systems",
):
    course = MoodleCourse(
        user_id=user.id,
        course_id=course_id,
        shortname=shortname,
        fullname=fullname,
        progress=42,
        outline=[
            {
                "name": "Week 5 — Process scheduling",
                "modules": [
                    {"name": "Slides", "modname": "resource"},
                    {"name": "Recording", "modname": "url"},
                ],
            }
        ],
        grades=[{"name": "Quiz 1", "grade": "8", "max": "10", "percentage": "80%", "feedback": ""}],
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    db.add(
        MoodleAssignment(
            user_id=user.id,
            course_id=course.id,
            assign_id=31,
            cmid=310,
            name="Quiz 3",
            due_at=datetime.now(UTC) + timedelta(days=2),
            submission_status="not submitted",
        )
    )
    db.add(
        MoodleAnnouncement(
            user_id=user.id,
            course_id=course.id,
            discussion_id=410,
            subject="Lab moved to Thursday",
            author="Dr Aisyah",
            posted_at=datetime.now(UTC),
        )
    )
    db.commit()
    return course


def test_chat_endpoint_streams_course_context(
    client: TestClient, sign_in, make_user, db, monkeypatch, fake_http
) -> None:
    user = make_user(db)
    sign_in(user)
    course = _course(db, user)
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    fake_http.lines = ['data: {"choices":[{"delta":{"content":"Quiz 3 is next."}}]}']

    response = client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "What is due?"}],
            "context": {"courseId": str(course.id)},
        },
    )

    assert response.status_code == 200
    assert '"text": "Quiz 3 is next."' in response.text
    system = fake_http.stream_calls[0]["json"]["messages"][0]["content"]
    assert "BICS2301 — Operating Systems" in system
    assert "Progress: 42%" in system
    assert "Quiz 3" in system
    assert "Lab moved to Thursday" in system
    assert "Week 5 — Process scheduling" in system
    assert "Slides" in system


def test_course_context_is_owner_scoped(
    client: TestClient, sign_in, make_user, db, monkeypatch, fake_http
) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    course = _course(db, owner)
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))

    sign_in(other)
    response = client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "What is due?"}],
            "context": {"courseId": str(course.id)},
        },
    )

    assert response.status_code == 404


def test_courses_scope_lists_only_the_callers_courses(
    client: TestClient, sign_in, make_user, db, monkeypatch, fake_http
) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    _course(db, owner, course_id=101, shortname="OWN101", fullname="Own Course")
    _course(db, other, course_id=202, shortname="OTHER202", fullname="Other Course")
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    fake_http.lines = ['data: {"choices":[{"delta":{"content":"OK"}}]}']

    response = client.post(
        "/api/ai/chat",
        json={
            "messages": [{"role": "user", "content": "What needs attention?"}],
            "context": {"scope": "courses"},
        },
    )

    assert response.status_code == 200
    system = fake_http.stream_calls[0]["json"]["messages"][0]["content"]
    assert "OWN101 — Own Course" in system
    assert "OTHER202" not in system
    assert "Unread announcements:" in system
    assert "Lab moved to Thursday" in system
