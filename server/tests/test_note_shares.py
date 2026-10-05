import io

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings

settings = get_settings()


def _note(client: TestClient, **overrides) -> dict:
    payload = {"type": "note", "title": "Big-O cheat sheet", "body": "O(1) < O(log n)", "tags": ["exam"]}
    payload.update(overrides)
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _token(url: str) -> str:
    assert url.startswith(settings.public_base_url.rstrip("/") + "/s/")
    return url.rsplit("/", 1)[-1]


def test_share_link_is_public_and_redacted(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db, name="Ada", email="ada@example.com"))
    note = _note(client)

    assert client.get(f"/api/notes/{note['id']}/share-link").json() == {"enabled": False, "url": None}

    created = client.post(f"/api/notes/{note['id']}/share-link")
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["enabled"] is True
    token = _token(body["url"])

    # Re-enabling returns the same link, so a sent link keeps working.
    assert client.post(f"/api/notes/{note['id']}/share-link").json()["url"] == body["url"]

    # Anonymous visitors read the note with no session and no ids leaking.
    client.post("/api/auth/logout")
    public = client.get(f"/api/shares/{token}")
    assert public.status_code == 200, public.text
    payload = public.json()
    assert payload["title"] == note["title"]
    assert payload["body"] == note["body"]
    assert payload["tags"] == ["exam"]
    assert payload["sharedBy"] == "Ada"
    assert payload["file"] is None
    assert {"id", "study", "subjectId", "createdBy", "request"}.isdisjoint(payload)


def test_share_link_reflects_edits_and_revocation(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    owner = make_user(db, email="ada@example.com")
    sign_in(owner)
    note = _note(client)
    token = _token(client.post(f"/api/notes/{note['id']}/share-link").json()["url"])

    client.patch(f"/api/notes/{note['id']}", json={"title": "Renamed later"})
    assert client.get(f"/api/shares/{token}").json()["title"] == "Renamed later"

    assert client.delete(f"/api/notes/{note['id']}/share-link").status_code == 204
    assert client.get(f"/api/shares/{token}").status_code == 404
    assert client.get(f"/api/shares/{token}").json()["error"] == "That link is not valid."
    assert client.get(f"/api/notes/{note['id']}/share-link").json() == {"enabled": False, "url": None}


def test_share_link_is_owner_only_and_personal_only(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    note = _note(client)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    group_note = client.post(f"/api/groups/{group['id']}/notes", json={"title": "Group item"}).json()
    client.post("/api/auth/logout")

    sign_in(other)
    assert client.get(f"/api/notes/{note['id']}/share-link").status_code == 404
    assert client.post(f"/api/notes/{note['id']}/share-link").status_code == 404
    assert client.delete(f"/api/notes/{note['id']}/share-link").status_code == 404

    sign_in(owner)
    assert client.post(f"/api/notes/{group_note['id']}/share-link").status_code == 404
    assert client.get("/api/shares/not-a-real-token").status_code == 404


def test_share_link_file_is_presigned_anonymously(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    upload = client.post("/api/files", files={"file": ("scan.jpg", io.BytesIO(b"img"), "image/jpeg")}).json()
    note = _note(client, type="handwritten", title="Week 5 scan", fileId=upload["id"])
    empty = _note(client, title="No attachment")
    token = _token(client.post(f"/api/notes/{note['id']}/share-link").json()["url"])
    empty_token = _token(client.post(f"/api/notes/{empty['id']}/share-link").json()["url"])

    client.post("/api/auth/logout")
    payload = client.get(f"/api/shares/{token}").json()
    assert payload["file"] == {"name": "scan.jpg", "contentType": "image/jpeg", "size": 3}

    file_response = client.get(f"/api/shares/{token}/file")
    assert file_response.status_code == 200, file_response.text
    url = file_response.json()["url"]
    assert url.startswith("https://r2.test/") and url.endswith(f"/{upload['id']}.jpg?signed=1")
    assert client.get(f"/api/shares/{empty_token}/file").status_code == 404


def test_deleting_note_revokes_link(client: TestClient, sign_in, make_user, db: DbSession, storage) -> None:
    sign_in(make_user(db))
    note = _note(client)
    token = _token(client.post(f"/api/notes/{note['id']}/share-link").json()["url"])

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    client.post("/api/auth/logout")
    assert client.get(f"/api/shares/{token}").status_code == 404
