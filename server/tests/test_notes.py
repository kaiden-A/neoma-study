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


def test_personal_notes_are_private(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    note = _note(client)
    client.post("/api/auth/logout")

    sign_in(other)
    assert client.get("/api/notes").json() == []
    assert client.get(f"/api/notes/{note['id']}").status_code == 404
    assert client.patch(f"/api/notes/{note['id']}", json={"title": "Mine now"}).status_code == 404


def test_note_defaults_and_search(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    _note(client, title="Redox reactions", body="titration", tags=["chem"])
    _note(client, title="Recursion", body="call stacks", tags=["cs"])

    assert len(client.get("/api/notes").json()) == 2
    assert [item["title"] for item in client.get("/api/notes?q=redox").json()] == ["Redox reactions"]
    assert [item["title"] for item in client.get("/api/notes?q=chem").json()] == ["Redox reactions"]
    assert [item["title"] for item in client.get("/api/notes?q=stacks").json()] == ["Recursion"]

    blank = client.post("/api/notes", json={"type": "note", "title": "", "body": "Only a body"}).json()
    assert blank["title"] == "Only a body"


def test_link_validation_and_domain_titles(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))

    bad = client.post("/api/notes", json={"type": "link", "title": "x", "url": "ftp://nope"})
    assert bad.status_code == 422

    good = _note(client, type="link", title="", url="https://www.khanacademy.org/computing")
    assert good["url"].startswith("https://")


def test_subjects_crud_and_move_on_delete(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    first = client.post("/api/subjects", json={"name": "Thermodynamics"}).json()
    second = client.post("/api/subjects", json={"name": "Mechanics"}).json()
    assert first["color"] == "amber" and second["color"] == "mint"

    note = _note(client, subjectId=first["id"])
    assert note["subjectId"] == first["id"]

    renamed = client.patch(f"/api/subjects/{first['id']}", json={"name": "Thermo", "color": "coral"}).json()
    assert renamed["name"] == "Thermo" and renamed["color"] == "coral"

    client.delete(f"/api/subjects/{first['id']}?moveTo={second['id']}")
    moved = client.get(f"/api/notes/{note['id']}").json()
    assert moved["subjectId"] == second["id"]

    assert client.delete(f"/api/subjects/{first['id']}").status_code == 404


def test_upload_stores_objects_and_presigns(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    user = make_user(db)
    sign_in(user)

    response = client.post(
        "/api/files",
        files={
            "file": ("notes.jpg", io.BytesIO(b"fake-image-bytes"), "image/jpeg"),
            "thumb": ("notes.jpg", io.BytesIO(b"fake-thumb"), "image/jpeg"),
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "notes.jpg"
    assert body["size"] == len(b"fake-image-bytes")
    keys = list(storage.objects)
    assert keys[0].startswith(f"users/{user.id}/")
    assert len(keys) == 2 and keys[1].endswith("-thumb")

    url = client.get(f"/api/files/{body['id']}/url").json()["url"]
    assert url.startswith("https://r2.test/")
    thumb_url = client.get(f"/api/files/{body['id']}/url?thumb=true").json()["url"]
    assert thumb_url.endswith("-thumb?signed=1")


def test_upload_rejects_oversize_and_empty(
    client: TestClient, sign_in, make_user, db: DbSession, storage, monkeypatch
) -> None:
    sign_in(make_user(db))
    monkeypatch.setattr(settings, "max_upload_bytes", 4)

    too_big = client.post(
        "/api/files", files={"file": ("big.bin", io.BytesIO(b"12345"), "application/octet-stream")}
    )
    assert too_big.status_code == 422
    assert "15 MB" in too_big.json()["error"]

    empty = client.post(
        "/api/files", files={"file": ("empty.bin", io.BytesIO(b""), "application/octet-stream")}
    )
    assert empty.status_code == 422


def test_deleting_a_note_removes_its_objects(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    upload = client.post(
        "/api/files", files={"file": ("paper.pdf", io.BytesIO(b"%PDF"), "application/pdf")}
    ).json()
    note = _note(client, type="paper", fileId=upload["id"])
    assert note["fileName"] == "paper.pdf"
    assert note["fileSize"] == 4

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert storage.deleted


def test_files_are_owner_scoped(client: TestClient, sign_in, make_user, db: DbSession, storage) -> None:
    owner = make_user(db, email="ada@example.com")
    other = make_user(db, email="eve@example.com")
    sign_in(owner)
    upload = client.post(
        "/api/files", files={"file": ("secret.pdf", io.BytesIO(b"%PDF"), "application/pdf")}
    ).json()
    client.post("/api/auth/logout")

    sign_in(other)
    assert client.get(f"/api/files/{upload['id']}/url").status_code == 404
    assert client.delete(f"/api/files/{upload['id']}").status_code == 404


def test_share_to_group_copies_text_and_file(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    owner = make_user(db, email="ada@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    topic = client.post(f"/api/groups/{group['id']}/topics", json={"name": "CS301"}).json()["topics"][0]
    upload = client.post("/api/files", files={"file": ("scan.jpg", io.BytesIO(b"img"), "image/jpeg")}).json()
    note = _note(client, type="handwritten", title="Week 5 scan", fileId=upload["id"], body="key points")

    shared = client.post(
        f"/api/notes/{note['id']}/share", json={"groupId": group["id"], "topicId": topic["id"]}
    )
    assert shared.status_code == 201, shared.text
    body = shared.json()
    assert body["scope"] == "group"
    assert body["topicId"] == topic["id"]
    assert body["type"] == "note"
    assert body["fileId"] is not None and body["fileId"] != upload["id"]
    assert body["fileName"] == "scan.jpg"
    assert body["title"] == "Week 5 scan"

    personal = client.get(f"/api/notes/{note['id']}").json()
    assert personal["scope"] == "personal"
    assert personal["fileId"] == upload["id"]
    # The share copied the object instead of pointing at the personal file.
    assert storage.copies == [
        (f"users/{owner.id}/{upload['id']}", f"groups/{group['id']}/{body['fileId']}")
    ]

    # Deleting the personal note leaves the shared copy alone.
    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert storage.deleted == [f"users/{owner.id}/{upload['id']}"]


def test_share_can_leave_the_file_behind(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    upload = client.post("/api/files", files={"file": ("scan.jpg", io.BytesIO(b"img"), "image/jpeg")}).json()
    note = _note(client, type="handwritten", title="Week 5 scan", fileId=upload["id"])

    shared = client.post(
        f"/api/notes/{note['id']}/share",
        json={"groupId": group["id"], "includeFile": False},
    )
    assert shared.status_code == 201, shared.text
    assert shared.json()["fileId"] is None
    assert storage.copies == []


def test_group_files_are_member_scoped(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    owner = make_user(db, email="ada@example.com")
    member = make_user(db, email="maya@example.com")
    outsider = make_user(db, email="eve@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    client.post(f"/api/groups/{group['id']}/invite", json={"email": "maya@example.com"})
    upload = client.post(
        "/api/files",
        files={"file": ("scan.jpg", io.BytesIO(b"img"), "image/jpeg")},
        data={"groupId": group["id"]},
    ).json()
    assert next(iter(storage.objects)).startswith(f"groups/{group['id']}/")

    client.post("/api/auth/logout")
    sign_in(member)
    assert client.get(f"/api/files/{upload['id']}/url").status_code == 200

    client.post("/api/auth/logout")
    sign_in(outsider)
    assert client.get(f"/api/files/{upload['id']}/url").status_code == 404
    assert client.delete(f"/api/files/{upload['id']}").status_code == 404
    not_member_upload = client.post(
        "/api/files",
        files={"file": ("hack.jpg", io.BytesIO(b"img"), "image/jpeg")},
        data={"groupId": group["id"]},
    )
    assert not_member_upload.status_code == 404


def test_group_note_carries_a_file(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    owner = make_user(db, email="ada@example.com")
    member = make_user(db, email="maya@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    client.post(f"/api/groups/{group['id']}/invite", json={"email": "maya@example.com"})
    upload = client.post(
        "/api/files",
        files={"file": ("paper.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        data={"groupId": group["id"]},
    ).json()
    client.post("/api/auth/logout")

    sign_in(member)
    note = client.post(
        f"/api/groups/{group['id']}/notes",
        json={"type": "paper", "title": "2023 past paper", "fileId": upload["id"]},
    )
    assert note.status_code == 201, note.text
    assert note.json()["fileName"] == "paper.pdf"
    assert note.json()["fileSize"] == 4

    # A personal note may not borrow somebody else's group file...
    personal = client.post("/api/notes", json={"type": "paper", "title": "Mine", "fileId": upload["id"]})
    assert personal.status_code == 404

    # ...and a group note may only carry files scoped to that group.
    personal_upload = client.post(
        "/api/files", files={"file": ("mine.jpg", io.BytesIO(b"img"), "image/jpeg")}
    ).json()
    borrowed = client.post(
        f"/api/groups/{group['id']}/notes", json={"title": "Borrowed", "fileId": personal_upload["id"]}
    )
    assert borrowed.status_code == 404


def test_deleting_a_group_note_removes_its_group_file(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    upload = client.post(
        "/api/files",
        files={"file": ("answers.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        data={"groupId": group["id"]},
    ).json()
    note = client.post(
        f"/api/groups/{group['id']}/notes", json={"title": "Answers", "fileId": upload["id"]}
    ).json()

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert storage.deleted == [f"groups/{group['id']}/{upload['id']}"]


def test_group_notes_and_request_answer_flow(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    client.post(f"/api/groups/{group['id']}/invite", json={"email": "maya@example.com"})

    request = client.post(
        f"/api/groups/{group['id']}/notes",
        json={"type": "request", "title": "Anyone have week 5 slides?", "body": "", "tags": ["week5"]},
    )
    assert request.status_code == 201, request.text
    request_body = request.json()
    assert request_body["request"]["open"] is True

    empty_answer = client.post(f"/api/notes/{request_body['id']}/answer", json={"body": ""})
    assert empty_answer.status_code == 422

    answered = client.post(
        f"/api/notes/{request_body['id']}/answer",
        json={"url": "https://drive.example.com/slides", "body": "Here you go"},
    )
    assert answered.status_code == 201, answered.text
    answer = answered.json()
    assert answer["type"] == "link"
    assert answer["title"] == "drive.example.com"
    assert answer["tags"] == ["week5"]

    refreshed = client.get(f"/api/notes/{request_body['id']}").json()
    assert refreshed["request"]["open"] is False
    assert refreshed["request"]["answerNoteId"] == answer["id"]

    again = client.post(f"/api/notes/{request_body['id']}/answer", json={"body": "second"})
    assert again.status_code == 422
    assert "already answered" in again.json()["error"]

    # Members see the group's notes; the feed excludes nothing server-side.
    client.post("/api/auth/logout")
    sign_in(member)
    group_notes = client.get(f"/api/groups/{group['id']}/notes").json()
    assert {item["id"] for item in group_notes} == {request_body["id"], answer["id"]}


def test_group_notes_are_hidden_from_non_members(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    owner = make_user(db, email="ada@example.com")
    outsider = make_user(db, email="eve@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "study", "name": "Finals crew", "subject": "", "color": "violet", "description": ""},
    ).json()
    note = client.post(f"/api/groups/{group['id']}/notes", json={"title": "Secret", "body": ""}).json()
    client.post("/api/auth/logout")

    sign_in(outsider)
    assert client.get(f"/api/groups/{group['id']}/notes").status_code == 404
    assert client.get(f"/api/notes/{note['id']}").status_code == 404


def test_bootstrap_includes_notes(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    note = _note(client)

    body = client.get("/api/bootstrap").json()

    assert [item["id"] for item in body["notes"]] == [note["id"]]
