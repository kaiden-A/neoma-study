"""The Elpis refine pass: answer immutability, validation and fallbacks."""

import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
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


class FakeClient:
    payload: object = {}
    error: Exception | None = None
    calls: list[dict] = []

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


@pytest.fixture
def fake_http(monkeypatch) -> type[FakeClient]:
    FakeClient.payload = {}
    FakeClient.error = None
    FakeClient.calls = []
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

    body = client.post("/api/flashcards/generate", json={"noteId": note["id"], "refine": True}).json()

    assert body["engine"] == "ai" and body["refined"] is True
    assert body["notice"] is None
    assert body["cards"][0]["front"] == "In your own words, what is entropy?"
    assert body["cards"][0]["back"] == "a state function."
    assert len(body["cards"][0]["distractors"]) == 3
