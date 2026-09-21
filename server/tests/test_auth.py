from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import User
from app.models.enums import UserKind
from app.services import security
from tests.conftest import FakeZitadel

settings = get_settings()


def _callback(client: TestClient) -> None:
    """Drive the full login handshake through the fake IdP."""
    start = client.get("/api/auth/login")
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    client.get(f"/api/auth/callback?code=fake-code&state={state}")


def test_login_sets_signed_cookie_and_redirects_to_idp(idp_client: TestClient, fake_idp: FakeZitadel) -> None:
    response = idp_client.get("/api/auth/login?next=/today")

    assert response.status_code == 302
    assert response.headers["location"].startswith("https://idp.test/authorize")
    assert fake_idp.authorize_requests[0]["redirect_uri"] == settings.zitadel_redirect_uri
    assert "code_challenge" in fake_idp.authorize_requests[0]

    cookie = idp_client.cookies.get(security.OAUTH_COOKIE)
    payload = security.unsign_payload(cookie, settings.app_secret, max_age=security.OAUTH_COOKIE_MAX_AGE)
    assert payload is not None
    assert payload["next"] == "/today"


def test_login_next_rejects_offsite(idp_client: TestClient) -> None:
    idp_client.get("/api/auth/login?next=//evil.example.com")

    cookie = idp_client.cookies.get(security.OAUTH_COOKIE)
    payload = security.unsign_payload(cookie, settings.app_secret, max_age=security.OAUTH_COOKIE_MAX_AGE)
    assert payload is not None
    assert payload["next"] == "/"


def test_login_passes_login_hint_and_prompt(idp_client: TestClient, fake_idp: FakeZitadel) -> None:
    idp_client.get("/api/auth/login?next=/today&login_hint=ada@example.com&prompt=create")

    request = fake_idp.authorize_requests[0]
    assert request["login_hint"] == "ada@example.com"
    assert request["prompt"] == "create"


def test_login_ignores_unknown_prompt(idp_client: TestClient, fake_idp: FakeZitadel) -> None:
    idp_client.get("/api/auth/login?prompt=delete-everything")

    assert fake_idp.authorize_requests[0]["prompt"] is None


def test_callback_wrong_state_is_400(idp_client: TestClient) -> None:
    idp_client.get("/api/auth/login")

    response = idp_client.get("/api/auth/callback?code=fake-code&state=not-the-state")

    assert response.status_code == 400
    assert response.json()["error"] == "Could not finish signing in. Please try again."


def test_callback_provisions_member_and_sets_session(
    idp_client: TestClient, fake_idp: FakeZitadel, db: DbSession
) -> None:
    fake_idp.claims = {"sub": "idp-sub-1", "email": "Ada@Example.com", "name": "Ada Lovelace"}

    _callback(idp_client)

    user = db.scalar(select(User).where(User.zitadel_sub == "idp-sub-1"))
    assert user is not None
    assert user.kind is UserKind.member
    assert user.email == "ada@example.com"
    assert user.display_name == "Ada Lovelace"
    assert idp_client.cookies.get(settings.session_cookie_name)


def test_callback_second_login_reuses_member(
    idp_client: TestClient, fake_idp: FakeZitadel, db: DbSession
) -> None:
    fake_idp.claims = {"sub": "idp-sub-2", "email": "ada@example.com", "name": "Ada"}

    _callback(idp_client)
    _callback(idp_client)

    users = db.scalars(select(User).where(User.zitadel_sub == "idp-sub-2")).all()
    assert len(users) == 1


def test_me_requires_session(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json() == {"error": "Not signed in."}


def test_me_returns_member(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    user = make_user(db, name="Ada Lovelace", email="ada@example.com")
    sign_in(user)

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "id": str(user.id),
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "kind": "member",
        "program": "",
        "color": "amber",
    }


def test_logout_revokes_and_returns_idp_url(
    idp_client: TestClient, fake_idp: FakeZitadel, sign_in, make_user, db: DbSession
) -> None:
    user = make_user(db, zitadel_sub="idp-sub-3")
    token = sign_in(user)

    response = idp_client.post("/api/auth/logout")

    assert response.status_code == 200
    assert response.json()["logoutUrl"] == "https://idp.test/end_session"
    assert fake_idp.end_session_calls[0]["post_logout_redirect_uri"] == settings.zitadel_post_logout_uri
    set_cookie = response.headers.get("set-cookie", "")
    assert f"{settings.session_cookie_name}=" in set_cookie
    assert "Max-Age=0" in set_cookie

    idp_client.cookies.set(settings.session_cookie_name, token)
    assert idp_client.get("/api/auth/me").status_code == 401
