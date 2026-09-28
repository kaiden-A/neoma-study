import httpx
import pytest
from fastapi.testclient import TestClient

from app.services import link_services


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
    """Stands in for httpx.Client: records what would have been fetched."""

    payload: dict = {}
    error: Exception | None = None
    calls: list[dict] = []
    timeouts: list[float | None] = []

    def __init__(self, *args, **kwargs) -> None:
        del args
        self._timeout = kwargs.get("timeout")

    def __enter__(self) -> "FakeClient":
        FakeClient.timeouts.append(self._timeout)
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def get(self, url: str, params: dict | None = None) -> FakeResponse:
        FakeClient.calls.append({"url": url, "params": params or {}})
        if FakeClient.error is not None:
            raise FakeClient.error
        return FakeResponse(FakeClient.payload)


@pytest.fixture
def fake_http(monkeypatch) -> type[FakeClient]:
    FakeClient.payload = {}
    FakeClient.error = None
    FakeClient.calls = []
    FakeClient.timeouts = []
    monkeypatch.setattr(link_services.httpx, "Client", FakeClient)
    return FakeClient


def test_preview_requires_a_session(client: TestClient) -> None:
    response = client.post("/api/links/preview", json={"url": "https://youtu.be/dQw4w9WgXcQ"})

    assert response.status_code == 401
    assert response.json() == {"error": "Not signed in."}


def test_youtube_preview_returns_metadata(
    client: TestClient, sign_in, make_user, db, fake_http
) -> None:
    sign_in(make_user(db))
    fake_http.payload = {
        "title": "Big-O in 12 minutes",
        "author_name": "CS Dojo",
        "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        "unexpected": "ignored",
    }

    response = client.post(
        "/api/links/preview",
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s&list=PL123"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "title": "Big-O in 12 minutes",
        "author": "CS Dojo",
        "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    }
    assert len(fake_http.calls) == 1
    call = fake_http.calls[0]
    assert call["url"] == link_services.YOUTUBE_OEMBED
    # The original URL is a parameter, never the request target.
    assert call["params"]["url"].startswith("https://www.youtube.com/watch")
    assert fake_http.timeouts == [link_services.TIMEOUT_SECONDS]


def test_vimeo_preview_uses_vimeo_endpoint(client: TestClient, sign_in, make_user, db, fake_http) -> None:
    sign_in(make_user(db))
    fake_http.payload = {"title": "Lecture 3", "author_name": "Prof K", "thumbnail_url": "https://i.vimeocdn.com/x.jpg"}

    response = client.post("/api/links/preview", json={"url": "https://vimeo.com/76979871"})

    assert response.status_code == 200
    assert response.json()["title"] == "Lecture 3"
    assert fake_http.calls[0]["url"] == link_services.VIMEO_OEMBED
    assert fake_http.calls[0]["params"] == {"url": "https://vimeo.com/76979871"}


def test_non_allowlisted_host_returns_nulls_without_fetching(
    client: TestClient, sign_in, make_user, db, fake_http
) -> None:
    sign_in(make_user(db))

    response = client.post("/api/links/preview", json={"url": "https://evil.example.com/watch?v=x"})

    assert response.status_code == 200
    assert response.json() == {"title": None, "author": None, "thumbnailUrl": None}
    assert fake_http.calls == []


@pytest.mark.parametrize(
    "error",
    [httpx.ConnectError("boom"), httpx.TimeoutException("slow"), ValueError("not json")],
)
def test_provider_failure_returns_nulls(client: TestClient, sign_in, make_user, db, fake_http, error) -> None:
    sign_in(make_user(db))
    fake_http.error = error

    response = client.post("/api/links/preview", json={"url": "https://youtu.be/dQw4w9WgXcQ"})

    assert response.status_code == 200
    assert response.json() == {"title": None, "author": None, "thumbnailUrl": None}


def test_empty_provider_fields_become_nulls(client: TestClient, sign_in, make_user, db, fake_http) -> None:
    sign_in(make_user(db))
    fake_http.payload = {"title": "  ", "author_name": None, "thumbnail_url": ""}

    response = client.post("/api/links/preview", json={"url": "https://youtu.be/dQw4w9WgXcQ"})

    assert response.json() == {"title": None, "author": None, "thumbnailUrl": None}
