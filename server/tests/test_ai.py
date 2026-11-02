"""The Elpis refine pass and page context: ownership, fallbacks and shape."""

import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.models import MoodleAnnouncement, MoodleAssignment, MoodleCourse
from app.schemas.ai import ChatMessageIn, WeekPlan
from app.schemas.study import FlashcardDraft, QuizQuestion
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


def _quiz_question(**overrides) -> QuizQuestion:
    values: dict[str, object] = {
        "kind": "mcq",
        "term": "Entropy",
        "prompt": "What is entropy?",
        "options": [
            "A measure of disorder",
            "A path function",
            "A reaction rate",
            "A membrane",
        ],
        "answerIndex": 0,
        "source": "Entropy: a measure of disorder",
    }
    values.update(overrides)
    return QuizQuestion.model_validate(values)


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


def test_quiz_refine_improves_prompt_and_distractors(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion(
        {
            "questions": [
                {
                    "index": 0,
                    "prompt": "In thermodynamics, what is entropy?",
                    "distractors": ["A path function", "A temperature scale", "A reaction rate"],
                }
            ]
        }
    )

    result = ai_services.refine_quiz([_quiz_question()], note_title="Thermo")

    assert result.refined is True and result.configured is True
    question = result.questions[0]
    assert question.prompt == "In thermodynamics, what is entropy?"
    assert question.answerIndex == 0
    assert question.options[0] == "A measure of disorder"
    assert question.options[1:] == ["A path function", "A temperature scale", "A reaction rate"]


def test_quiz_refine_rejects_an_answer_leak(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion(
        {"questions": [{"index": 0, "prompt": "Is entropy a measure of disorder?"}]}
    )
    original = _quiz_question()

    result = ai_services.refine_quiz([original], note_title="Thermo")

    assert result.refined is False
    assert result.questions[0].prompt == original.prompt


def test_quiz_refine_rejects_a_changed_subject(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion({"questions": [{"index": 0, "prompt": "What is enthalpy?"}]})
    original = _quiz_question()

    result = ai_services.refine_quiz([original], note_title="Thermo")

    assert result.refined is False
    assert result.questions[0].prompt == original.prompt


def test_quiz_refine_changes_a_short_prompt_only(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion(
        {"questions": [{"index": 0, "prompt": "Explain entropy in your own words."}]}
    )
    original = _quiz_question(
        kind="short",
        prompt="Explain entropy.",
        options=[],
        answerIndex=None,
        modelAnswer="A measure of disorder",
        keyPoints=["measure", "disorder"],
    )

    result = ai_services.refine_quiz([original], note_title="Thermo")

    assert result.refined is True
    assert result.questions[0].prompt == "Explain entropy in your own words."
    assert result.questions[0].modelAnswer == "A measure of disorder"
    assert result.questions[0].keyPoints == ["measure", "disorder"]


def test_quiz_refine_skips_true_false(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    original = _quiz_question(
        kind="true_false",
        prompt="True or false: Entropy is a measure of disorder.",
        options=["True", "False"],
        answerIndex=0,
    )

    result = ai_services.refine_quiz([original], note_title="Thermo")

    assert result.refined is False
    assert fake_http.calls == []


def test_quiz_refine_bad_json_falls_back(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = {"choices": [{"message": {"content": "not json"}}]}
    original = _quiz_question()

    result = ai_services.refine_quiz([original], note_title="Thermo")

    assert result.refined is False
    assert result.configured is True
    assert result.questions == [original]


def test_generate_quiz_refine_wiring(
    client: TestClient, sign_in, make_user, db, monkeypatch, fake_http
) -> None:
    sign_in(make_user(db))
    note = client.post(
        "/api/notes",
        json={
            "type": "note",
            "title": "Thermo",
            "body": (
                "Entropy: a measure of disorder\n"
                "Enthalpy: heat content at constant pressure\n"
                "Osmosis: movement of water across a membrane"
            ),
        },
    ).json()
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    fake_http.payload = _completion(
        {
            "questions": [
                {
                    "index": 0,
                    "prompt": "In your own words, what is entropy?",
                    "distractors": ["A path function", "A temperature scale", "A reaction rate"],
                }
            ]
        }
    )

    body = client.post(
        "/api/quizzes/generate",
        json={"noteId": note["id"], "objective": 1, "subjective": 0, "refine": True},
    ).json()

    assert body["engine"] == "ai" and body["refined"] is True
    assert body["notice"] is None
    assert body["questions"][0]["prompt"] == "In your own words, what is entropy?"


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


def _plan_payload(**overrides) -> dict:
    values: dict[str, object] = {
        "title": "Week of 2 Nov",
        "summary": "The DB assignment comes first.",
        "days": [
            {
                "date": "2026-11-02",
                "label": "Mon 2 Nov",
                "items": [
                    {
                        "title": "Finish the DB assignment",
                        "taskId": None,
                        "dueAt": None,
                        "priority": "high",
                        "minutes": 90,
                        "reason": "Due Tuesday, 20% of the grade",
                        "tip": "Start with normalisation.",
                        "subtasks": ["Normalise the schema", "Write the queries"],
                    }
                ],
            }
        ],
        "deferred": [],
    }
    values.update(overrides)
    return values


def test_chat_stream_emits_a_validated_plan(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    content = "The DB assignment comes first.\n[[NEOMA_PLAN]]" + json.dumps(_plan_payload())
    fake_http.lines = [
        "data: " + json.dumps({"choices": [{"delta": {"content": content}}]}),
        "data: [DONE]",
    ]

    frames = list(ai_services.chat_stream([ChatMessageIn(role="user", content="Plan my week")]))

    text = "".join(json.loads(frame[6:])["text"] for frame in frames if '"text"' in frame)
    assert text == "The DB assignment comes first.\n"
    plan_frame = next(frame for frame in frames if '"plan"' in frame)
    plan = json.loads(plan_frame[6:])["plan"]
    assert plan["title"] == "Week of 2 Nov"
    assert plan["days"][0]["items"][0]["priority"] == "high"
    assert plan["days"][0]["items"][0]["subtasks"][0] == "Normalise the schema"
    assert frames[-1] == 'data: {"done": true}\n\n'


def test_chat_stream_drops_an_invalid_plan(monkeypatch, fake_http) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    fake_http.lines = [
        'data: {"choices":[{"delta":{"content":"Here is the plan.\\n[[NEOMA_PLAN]]not json"}}]}',
        "data: [DONE]",
    ]

    frames = list(ai_services.chat_stream([ChatMessageIn(role="user", content="Plan my week")]))

    assert not any('"plan"' in frame for frame in frames)
    assert any("Here is the plan." in frame for frame in frames)
    assert frames[-1] == 'data: {"done": true}\n\n'


def test_week_plan_normalizes_model_variants() -> None:
    plan = WeekPlan.model_validate(
        _plan_payload(
            days=[
                {
                    "date": "2026-11-02",
                    "label": "Mon 2 Nov",
                    "items": [
                        {
                            "title": "Draft",
                            "taskId": "not-a-uuid",
                            "dueAt": "2026-11-02T20:00:00+08:00",
                            "priority": "medium",
                            "minutes": 45,
                        }
                    ],
                }
            ]
        )
    )

    item = plan.days[0].items[0]
    assert item.taskId is None
    assert item.priority.value == "med"
    assert item.dueAt is not None and item.dueAt > 0


def test_week_plan_accepts_a_copied_task_label() -> None:
    task_id = uuid.uuid4()
    plan = WeekPlan.model_validate(
        _plan_payload(
            days=[
                {
                    "date": "2026-11-02",
                    "items": [{"title": "Existing", "taskId": f"taskId={task_id}", "minutes": 30}],
                }
            ]
        )
    )

    assert plan.days[0].items[0].taskId == str(task_id)


def test_parse_plan_schedules_a_local_time(monkeypatch) -> None:
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings())
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
    raw = json.dumps(
        _plan_payload(
            days=[
                {
                    "date": tomorrow,
                    "label": "Tomorrow",
                    "items": [
                        {
                            "title": "Study block",
                            "taskId": None,
                            "time": "20:00",
                            "priority": "med",
                            "minutes": 60,
                        }
                    ],
                }
            ]
        )
    )

    plan = ai_services._parse_plan(raw)

    assert plan is not None
    item = plan.days[0].items[0]
    assert item.dueAt is not None
    local = datetime.fromtimestamp(item.dueAt / 1000, tz=ai_services._zone())
    assert (local.hour, local.minute) == (20, 0)


def test_week_plan_rejects_too_many_items() -> None:
    items = [{"title": f"Block {index}", "minutes": 15} for index in range(21)]
    with pytest.raises(ValueError):
        WeekPlan.model_validate(_plan_payload(days=[{"date": "2026-11-02", "items": items}]))


def test_chat_endpoint_unconfigured(client: TestClient, sign_in, make_user, db, monkeypatch) -> None:
    sign_in(make_user(db))
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id=""))

    response = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})

    assert response.status_code == 503
    assert response.json() == {"error": "The assistant is not connected yet."}


def test_chat_snapshot_includes_the_week(
    client: TestClient, sign_in, make_user, db, monkeypatch, fake_http
) -> None:
    sign_in(make_user(db))
    due = int((datetime.now(UTC) + timedelta(days=1)).timestamp() * 1000)
    created = client.post(
        "/api/tasks",
        json={"title": "DB assignment", "dueAt": due, "priority": "high"},
    )
    assert created.status_code == 201
    monkeypatch.setattr(ai_services, "get_settings", lambda: _settings(librechat_chat_agent_id="agent_chat"))
    fake_http.lines = ['data: {"choices":[{"delta":{"content":"OK"}}]}']

    response = client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "Plan my week"}]},
    )

    assert response.status_code == 200
    system = fake_http.stream_calls[0]["json"]["messages"][0]["content"]
    assert "NEOMA SNAPSHOT" in system
    assert "DB assignment" in system
    assert f"taskId={created.json()['id']}" in system
    assert "priority high" in system


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
