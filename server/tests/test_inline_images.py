"""Inline note images: the stable /raw URL, blob lifecycle and share scoping."""

import io
import re
import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import FileObject, GroupMember
from app.services import file_services, reminder_services

settings = get_settings()


def _upload(client: TestClient, *, group_id: str | None = None, name: str = "shot.jpg") -> dict:
    files = {"file": (name, io.BytesIO(b"img"), "image/jpeg")}
    data = {"groupId": group_id} if group_id else None
    response = client.post("/api/files", files=files, data=data)
    assert response.status_code == 201, response.text
    return response.json()


def _note(client: TestClient, **overrides) -> dict:
    payload = {"type": "note", "title": "Thermo", "body": ""}
    payload.update(overrides)
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _body(file_id: str) -> str:
    return f"Entropy is a state function.\n\n![scan](/api/files/{file_id}/raw)\n"


def _token(url: str) -> str:
    assert url.startswith(settings.public_base_url.rstrip("/") + "/s/")
    return url.rsplit("/", 1)[-1]


def _study_group(client: TestClient) -> dict:
    response = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_raw_redirects_for_owner_and_hides_from_strangers(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    owner = make_user(db, email="ada@example.com")
    sign_in(owner)
    upload = _upload(client)

    response = client.get(f"/api/files/{upload['id']}/raw")
    assert response.status_code == 307, response.text
    assert response.headers["location"] == f"https://r2.test/users/{owner.id}/{upload['id']}.jpg?signed=1"
    assert response.headers["cache-control"] == "no-store"
    assert client.get(f"/api/files/{uuid.uuid4()}/raw").status_code == 404

    sign_in(make_user(db, email="eve@example.com"))
    assert client.get(f"/api/files/{upload['id']}/raw").status_code == 404


def test_group_member_can_load_group_scoped_inline_images(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    owner = make_user(db, email="ada@example.com")
    member = make_user(db, email="maya@example.com")
    sign_in(owner)
    group = _study_group(client)
    upload = _upload(client, group_id=group["id"])

    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id))
    db.commit()
    sign_in(member)
    assert client.get(f"/api/files/{upload['id']}/raw").status_code == 307


def test_delete_note_purges_inline_images(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    upload = _upload(client)
    note = _note(client, body=_body(upload["id"]))

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    db.expire_all()
    assert db.get(FileObject, uuid.UUID(upload["id"])) is None
    assert storage.deleted


def test_delete_keeps_images_another_note_still_embeds(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    upload = _upload(client)
    first = _note(client, body=_body(upload["id"]))
    second = _note(client, title="Copy", body=_body(upload["id"]))

    assert client.delete(f"/api/notes/{first['id']}").status_code == 204
    db.expire_all()
    assert db.get(FileObject, uuid.UUID(upload["id"])) is not None

    assert client.delete(f"/api/notes/{second['id']}").status_code == 204
    db.expire_all()
    assert db.get(FileObject, uuid.UUID(upload["id"])) is None


def test_orphan_sweep_keeps_inline_images(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    kept = _upload(client, name="kept.jpg")
    _note(client, body=_body(kept["id"]))
    orphan = _upload(client, name="orphan.jpg")

    result = reminder_services.purge_orphan_files(db, storage, older_than_hours=0)
    assert result == {"files": 1}
    db.expire_all()
    assert db.get(FileObject, uuid.UUID(kept["id"])) is not None
    assert db.get(FileObject, uuid.UUID(orphan["id"])) is None


def test_share_to_group_copies_inline_images(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    owner = make_user(db, email="ada@example.com")
    member = make_user(db, email="maya@example.com")
    sign_in(owner)
    group = _study_group(client)
    upload = _upload(client)
    note = _note(client, body=_body(upload["id"]))

    shared = client.post(f"/api/notes/{note['id']}/share", json={"groupId": group["id"]}).json()
    assert upload["id"] not in shared["body"]
    match = re.search(r"/api/files/([0-9a-f-]{36})/raw", shared["body"])
    assert match is not None
    copied_id = match.group(1)

    db.expire_all()
    copied = db.get(FileObject, uuid.UUID(copied_id))
    assert copied is not None
    assert str(copied.group_id) == group["id"]
    assert storage.copies

    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id))
    db.commit()
    sign_in(member)
    assert client.get(f"/api/files/{copied_id}/raw").status_code == 307

    # Both notes keep working: the original blob was copied, not moved.
    sign_in(owner)
    assert client.get(f"/api/files/{upload['id']}/raw").status_code == 307


def test_public_share_inline_images_are_token_scoped(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    shown = _upload(client, name="shown.jpg")
    hidden = _upload(client, name="hidden.jpg")
    note = _note(client, body=_body(shown["id"]))
    token = _token(client.post(f"/api/notes/{note['id']}/share-link").json()["url"])

    client.post("/api/auth/logout")
    response = client.get(f"/api/shares/{token}/files/{shown['id']}/raw")
    assert response.status_code == 307, response.text
    assert response.headers["location"].startswith("https://r2.test/")
    # A file the note does not embed stays private even with the token.
    assert client.get(f"/api/shares/{token}/files/{hidden['id']}/raw").status_code == 404
    assert client.get(f"/api/shares/not-a-real-token/files/{shown['id']}/raw").status_code == 404


def test_body_file_ids_ignores_foreign_paths() -> None:
    keep = uuid.uuid4()
    assert file_services.body_file_ids(f"![a](/api/files/{keep}/raw)") == {keep}
    assert file_services.body_file_ids("![a](https://evil.test/api/files/../raw)") == set()
    assert file_services.body_file_ids("no images here") == set()
    assert file_services.body_file_ids(None) == set()
