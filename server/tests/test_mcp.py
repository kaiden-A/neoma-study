"""The MCP endpoint, driven through the mounted route like a real client."""

import json
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import Task, User

settings = get_settings()

MCP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def _post(client: TestClient, body: dict, token: str | None) -> Any:
    headers = dict(MCP_HEADERS)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.post("/mcp", headers=headers, content=json.dumps(body))


def _payload(result: dict) -> Any:
    """Schema-typed tools come back as structuredContent; list returns are
    wrapped in {"result": [...]}; composite tools fall back to a text block."""
    if "structuredContent" in result:
        structured = result["structuredContent"]
        if isinstance(structured, dict) and set(structured) == {"result"}:
            return structured["result"]
        return structured
    return json.loads(result["content"][0]["text"])


def _call(client: TestClient, name: str, arguments: dict, token: str) -> dict:
    response = _post(
        client,
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}},
        token,
    )
    assert response.status_code == 200, response.text
    return response.json()["result"]


def test_get_mcp_is_405(client: TestClient) -> None:
    response = client.get("/mcp")

    assert response.status_code == 405
    assert "SSE" in response.text


def test_unauthenticated_call_gets_a_challenge(client: TestClient, mcp_env: User) -> None:
    response = _post(client, {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}, None)

    assert response.status_code == 401
    challenge = response.headers.get("www-authenticate", "")
    assert "Bearer" in challenge
    assert "resource_metadata" in challenge


def test_wrong_token_is_rejected(client: TestClient, mcp_env: User) -> None:
    response = _post(client, {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}, "not-the-key")

    assert response.status_code == 401


def test_initialize_and_tools_list(client: TestClient, mcp_env: User, mcp_key: str) -> None:
    init = _post(
        client,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "pytest", "version": "0"},
            },
        },
        mcp_key,
    )
    assert init.status_code == 200, init.text

    listed = _post(client, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}, mcp_key)
    assert listed.status_code == 200, listed.text
    names = {tool["name"] for tool in listed.json()["result"]["tools"]}
    assert {
        "list_groups",
        "list_tasks",
        "create_task",
        "update_task",
        "upcoming",
        "search_vault",
        "get_note",
        "create_note",
        "list_events",
        "daily_brief",
    } <= names


def test_tools_act_as_the_owner(client: TestClient, mcp_env: User, mcp_key: str, db: DbSession) -> None:
    created = _call(client, "create_task", {"title": "From Elpis"}, mcp_key)
    payload = _payload(created)
    assert payload["title"] == "From Elpis"

    listed = _payload(_call(client, "list_tasks", {}, mcp_key))
    assert [task["title"] for task in listed] == ["From Elpis"]

    # The task is stored for the owner the static key maps to.
    stored = db.scalar(select(Task).where(Task.title == "From Elpis"))
    assert stored is not None
    assert stored.owner_id == mcp_env.id
    assert stored.group_id is None


def test_tools_scope_to_the_owner(
    client: TestClient, mcp_env: User, mcp_key: str, make_user, db: DbSession
) -> None:
    other = make_user(db, name="Maya", email="maya@example.com")
    db.add(Task(owner_id=other.id, title="Maya's private task", created_by=other.id))
    db.commit()

    listed = _payload(_call(client, "list_tasks", {}, mcp_key))

    assert listed == []


def test_tool_errors_are_readable(client: TestClient, mcp_env: User, mcp_key: str) -> None:
    result = _call(client, "get_note", {"note_id": "00000000-0000-0000-0000-000000000000"}, mcp_key)

    assert result.get("isError") is True
    text = result["content"][0]["text"]
    assert "item is gone" in text.lower()


def test_static_key_needs_a_matching_member(
    client: TestClient, mcp_key: str, db: DbSession, monkeypatch
) -> None:
    import app.mcp_server as mcp_server

    monkeypatch.setattr(mcp_server, "_session_factory", lambda: db)
    monkeypatch.setattr(settings, "mcp_owner_email", "nobody@example.com")

    response = _post(client, {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}, mcp_key)

    assert response.status_code == 401


def test_zitadel_token_path_accepts_a_matching_subject(
    client: TestClient, mcp_env: User, db: DbSession, monkeypatch
) -> None:
    """A valid IdP token maps through (idp_issuer, zitadel_sub) to the member."""
    import app.mcp_server as mcp_server

    mcp_env.idp_issuer = settings.zitadel_issuer.rstrip("/")
    mcp_env.zitadel_sub = "sub-owner"
    db.commit()

    class FakeKey:
        key = "secret"

    class FakeJwks:
        def get_signing_key_from_jwt(self, token: str) -> FakeKey:
            return FakeKey()

    def fake_decode(token, key, **kwargs):
        return {"sub": "sub-owner", "exp": 9_999_999_999}

    monkeypatch.setattr(mcp_server, "_jwks", lambda: FakeJwks())
    monkeypatch.setattr(mcp_server.jwt, "decode", fake_decode)

    response = _post(client, {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}, "idp-token")

    assert response.status_code == 200, response.text


def test_api_routes_still_win_over_the_mount(client: TestClient) -> None:
    """The MCP mount is last, so /api/* keeps working."""
    assert client.get("/api/health").status_code == 200
