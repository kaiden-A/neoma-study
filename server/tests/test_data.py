import io

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import Event, Group, Note, Subject, Task


def test_demo_semester_loads_and_clears(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))

    counts = client.post("/api/demo").json()

    assert counts["groups"] == 2
    assert counts["tasks"] >= 8
    assert counts["notes"] >= 6

    bootstrap = client.get("/api/bootstrap").json()
    assert len(bootstrap["groups"]) == 2
    assert {group["kind"] for group in bootstrap["groups"]} == {"project", "study"}
    assert any(note["scope"] == "group" for note in bootstrap["notes"])
    assert any(event["type"] == "exam" for event in bootstrap["events"])
    assert any(task["dueAt"] is None for task in bootstrap["tasks"])

    client.delete("/api/demo")
    assert client.get("/api/bootstrap").json()["groups"] == []
    assert client.get("/api/notes").json() == []
    assert db.query(Subject).count() == 0


def test_export_contains_everything(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    client.post("/api/demo")

    export = client.get("/api/export").json()

    assert export["app"] == "neoma"
    assert export["version"] == 1
    assert len(export["data"]["groups"]) == 2
    assert len(export["data"]["tasks"]) >= 8
    assert len(export["data"]["notes"]) >= 6
    assert len(export["data"]["events"]) >= 4
    assert export["data"]["profile"]["email"] == "ada@example.com"
    group = export["data"]["groups"][0]
    assert group["members"] == ["ada@example.com"]


def test_import_round_trips_into_an_empty_account(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    user = make_user(db)
    sign_in(user)
    client.post("/api/demo")
    export = client.get("/api/export").json()

    client.delete("/api/demo")
    assert client.get("/api/groups").json() == []

    counts = client.post("/api/import", json={"payload": export}).json()

    assert counts["groups"] == 2
    bootstrap = client.get("/api/bootstrap").json()
    assert len(bootstrap["groups"]) == 2
    assert len(bootstrap["tasks"]) == len(export["data"]["tasks"])
    assert len(bootstrap["notes"]) == len(export["data"]["notes"])
    assert len(bootstrap["events"]) == len(export["data"]["events"])
    assert db.query(Group).count() == 2
    assert db.query(Task).count() == len(export["data"]["tasks"])
    assert db.query(Note).count() == len(export["data"]["notes"])
    assert db.query(Event).count() == len(export["data"]["events"])


def test_import_rejects_junk(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))

    response = client.post("/api/import", json={"payload": {"nope": True}})

    assert response.status_code == 422
    assert response.json()["error"] == "That file does not look like a Neoma export."


def test_import_does_not_touch_other_people(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    other = make_user(db, name="Maya", email="maya@example.com")
    sign_in(other)
    other_group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Maya's group", "subject": "", "color": "sky", "description": ""},
    ).json()
    client.post("/api/auth/logout")

    sign_in(owner)
    client.post("/api/demo")
    export = client.get("/api/export").json()
    client.delete("/api/demo")
    client.post("/api/import", json={"payload": export})

    assert client.get(f"/api/groups/{other_group['id']}").status_code == 404
    client.post("/api/auth/logout")
    sign_in(other)
    assert [group["name"] for group in client.get("/api/groups").json()] == ["Maya's group"]


def test_import_matches_members_by_email(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    client.post(f"/api/groups/{group['id']}/invite", json={"email": "maya@example.com"})
    export = client.get("/api/export").json()
    assert set(export["data"]["groups"][0]["members"]) == {"ada@example.com", "maya@example.com"}

    client.delete("/api/demo")
    client.post("/api/import", json={"payload": export})

    rebuilt = client.get("/api/groups").json()[0]
    assert {item["email"] for item in rebuilt["members"]} == {"ada@example.com", "maya@example.com"}


def test_remove_files_clears_objects(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    upload = client.post("/api/files", files={"file": ("scan.jpg", io.BytesIO(b"img"), "image/jpeg")})
    # Storage is not configured in tests unless overridden, so skip when it 503s.
    if upload.status_code != 201:
        assert upload.status_code == 503
        return

    note = client.post(
        "/api/notes",
        json={"type": "handwritten", "title": "Scan", "fileId": upload.json()["id"]},
    ).json()
    assert note["fileId"]

    result = client.post("/api/maintenance/remove-files").json()

    assert result["files"] == 1
    assert client.get(f"/api/notes/{note['id']}").json()["fileId"] is None
