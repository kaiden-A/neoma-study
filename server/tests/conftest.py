import ssl
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401  (register models on Base.metadata)
from app.config import get_settings
from app.database import Base, get_db
from app.dependencies import get_storage, get_zitadel
from app.main import app
from app.models import User
from app.models.enums import UserKind
from app.services.auth_services import create_session
from app.services.storage_services import Storage

settings = get_settings()
SCHEMA = f"neoma_test_{uuid.uuid4().hex[:8]}"
assert settings.db_schema != SCHEMA, "refusing to run tests against the live schema"


def _connect_args() -> dict:
    if settings.ssl_required:
        return {"ssl_context": ssl.create_default_context()}
    return {}


# schema_translate_map instead of SET search_path on purpose: session state is
# unreliable through Neon's pooler (transaction mode) and a leaked search_path
# would leave other clients pointing at this schema after it is dropped.
test_engine = create_engine(
    settings.sqlalchemy_url,
    connect_args=_connect_args(),
    execution_options={"schema_translate_map": {settings.db_schema: SCHEMA}},
)

TestingSession = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    with test_engine.connect() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
        connection.commit()
    Base.metadata.create_all(test_engine)
    yield
    with test_engine.connect() as connection:
        connection.execute(text(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE'))
        connection.commit()
    test_engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(_schema: None) -> Iterator[None]:
    yield
    tables = ", ".join(f'"{SCHEMA}"."{table.name}"' for table in Base.metadata.tables.values())
    with test_engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture(autouse=True)
def _emails_off(monkeypatch) -> None:
    """Tests never touch the network: mail is rendered and logged only.

    A test that wants to assert sending sets its own key and patches
    email_services._deliver (see tests/test_groups.py::sent_emails).
    """
    monkeypatch.setattr(settings, "resend_api_key", "")
    monkeypatch.setattr(settings, "email_override_to", "")


@pytest.fixture(autouse=True)
def _google_off(monkeypatch) -> None:
    """Tests never touch Google: with no client id, push/sync are no-ops.

    tests/test_google.py sets its own id/secret and a fake client.
    """
    monkeypatch.setattr(settings, "google_client_id", "")
    monkeypatch.setattr(settings, "google_client_secret", "")


@pytest.fixture
def db() -> Iterator[DbSession]:
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: DbSession) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _make_user(
    db: DbSession,
    *,
    kind: UserKind = UserKind.member,
    name: str = "Ada",
    email: str | None = "ada@example.com",
    zitadel_sub: str | None = None,
) -> User:
    # A real signed-in member always has a subject; invited placeholders do not.
    if zitadel_sub is None:
        zitadel_sub = f"sub-{uuid.uuid4().hex[:8]}"
    user = User(kind=kind, display_name=name, email=email, zitadel_sub=zitadel_sub)
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def make_user():
    return _make_user


@pytest.fixture
def sign_in(db: DbSession, client: TestClient):
    def _sign_in(user: User) -> str:
        token = create_session(db, user, settings=settings)
        client.cookies.set(settings.session_cookie_name, token)
        return token

    return _sign_in


class FakeStorage(Storage):
    """Records object writes without touching R2."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.copies: list[tuple[str, str]] = []

    @property
    def configured(self) -> bool:
        return True

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    def delete(self, key: str | None) -> None:
        if key:
            self.deleted.append(key)
            self.objects.pop(key, None)

    def copy(self, source_key: str, dest_key: str) -> None:
        self.copies.append((source_key, dest_key))
        self.objects[dest_key] = self.objects.get(source_key, b"")

    def presigned_get(self, key: str) -> str:
        return f"https://r2.test/{key}?signed=1"


@pytest.fixture
def storage() -> Iterator[FakeStorage]:
    fake = FakeStorage()
    app.dependency_overrides[get_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_storage, None)


class FakeZitadel:
    """Records what would have been sent to the IdP, without touching the network."""

    def __init__(self, claims: dict | None = None) -> None:
        self.claims = claims or {}
        self.token_requests: list[dict] = []
        self.authorize_requests: list[dict] = []
        self.verify_calls: list[dict] = []
        self.end_session_calls: list[dict] = []

    def authorize_url(self, *, state, nonce, code_challenge, redirect_uri, login_hint=None, prompt=None):
        self.authorize_requests.append(
            {
                "state": state,
                "nonce": nonce,
                "code_challenge": code_challenge,
                "redirect_uri": redirect_uri,
                "login_hint": login_hint,
                "prompt": prompt,
            }
        )
        return f"https://idp.test/authorize?state={state}"

    def exchange_code(self, *, code, code_verifier, redirect_uri):
        self.token_requests.append(
            {"code": code, "code_verifier": code_verifier, "redirect_uri": redirect_uri}
        )
        return {"id_token": "fake.id.token", "access_token": "fake-access"}

    def verify_id_token(self, id_token: str, *, nonce: str):
        self.verify_calls.append({"id_token": id_token, "nonce": nonce})
        return {**self.claims, "nonce": nonce}

    def end_session_url(self, *, id_token_hint=None, post_logout_redirect_uri=None):
        self.end_session_calls.append(
            {"id_token_hint": id_token_hint, "post_logout_redirect_uri": post_logout_redirect_uri}
        )
        return "https://idp.test/end_session"


@pytest.fixture
def fake_idp() -> FakeZitadel:
    return FakeZitadel()


@pytest.fixture
def idp_client(client: TestClient, fake_idp: FakeZitadel) -> TestClient:
    app.dependency_overrides[get_zitadel] = lambda: fake_idp
    return client


@pytest.fixture
def mcp_key(monkeypatch) -> str:
    key = "test-mcp-key"
    monkeypatch.setattr(settings, "mcp_api_key", key)
    monkeypatch.setattr(settings, "mcp_owner_email", "ada@example.com")
    return key


@pytest.fixture
def mcp_env(mcp_key: str, make_user, db: DbSession, monkeypatch) -> User:
    """Points the MCP session factory at the throwaway test schema."""
    import app.mcp_server as mcp_server

    monkeypatch.setattr(mcp_server, "_session_factory", lambda: db)
    return make_user(db, name="Ada", email="ada@example.com")
