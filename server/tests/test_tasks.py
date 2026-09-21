import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import GroupMember, Task, User
from app.models.enums import GroupRole


def _create(client: TestClient, **overrides) -> dict:
    payload = {"title": "Literature review", "priority": "med"}
    payload.update(overrides)
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_personal_task_defaults(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))

    task = _create(client)

    assert task["groupId"] is None
    assert task["status"] == "todo"
    assert task["priority"] == "med"
    assert task["dueAt"] is None
    assert task["assigneeIds"] == []
    assert task["subtasks"] == []
    assert task["completedAt"] is None


def test_tasks_are_scoped_to_membership(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    outsider = make_user(db, name="Eve", email="eve@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    task = _create(client, groupId=group["id"], title="Group work", assigneeIds=[str(owner.id)])
    client.post("/api/auth/logout")

    sign_in(outsider)
    assert client.get("/api/tasks").json() == []
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert client.patch(f"/api/tasks/{task['id']}", json={"title": "Hacked"}).status_code == 404

    personal = client.post("/api/tasks", json={"title": "My own thing"}).json()
    client.post("/api/auth/logout")
    sign_in(owner)
    assert personal["id"] not in [item["id"] for item in client.get("/api/tasks").json()]


def test_group_task_rejects_non_member_assignee(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    owner = make_user(db, email="ada@example.com")
    stranger = make_user(db, email="eve@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()

    response = client.post(
        "/api/tasks",
        json={"title": "Nope", "groupId": group["id"], "assigneeIds": [str(stranger.id)]},
    )

    assert response.status_code == 404
    assert "not in this group" in response.json()["error"]


def test_status_transitions_stamp_completed_at(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    task = _create(client)

    done = client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}).json()
    assert done["completedAt"] is not None

    reopened = client.patch(f"/api/tasks/{task['id']}", json={"status": "doing"}).json()
    assert reopened["completedAt"] is None


def test_subtasks_and_links_replace_wholesale(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    task = _create(client)

    updated = client.patch(
        f"/api/tasks/{task['id']}",
        json={
            "subtasks": [
                {"title": "Read papers", "done": True},
                {"title": "Write summary", "done": False},
            ],
            "links": [{"label": "Brief", "url": "https://example.com/brief"}],
        },
    ).json()

    assert [item["title"] for item in updated["subtasks"]] == ["Read papers", "Write summary"]
    assert updated["links"][0]["url"] == "https://example.com/brief"

    cleared = client.patch(f"/api/tasks/{task['id']}", json={"subtasks": [], "links": []}).json()
    assert cleared["subtasks"] == []
    assert cleared["links"] == []

    bad = client.patch(f"/api/tasks/{task['id']}", json={"links": [{"label": "x", "url": "ftp://nope"}]})
    assert bad.status_code == 422


def test_personal_tasks_never_keep_assignees(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    user = make_user(db)
    sign_in(user)

    task = _create(client, assigneeIds=[str(user.id)])

    assert task["assigneeIds"] == []


def test_moving_a_task_between_group_and_personal(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    owner = make_user(db)
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    task = _create(client, assigneeIds=[str(owner.id)])

    in_group = client.patch(
        f"/api/tasks/{task['id']}", json={"groupId": group["id"], "assigneeIds": [str(owner.id)]}
    ).json()
    assert in_group["groupId"] == group["id"]
    assert in_group["assigneeIds"] == [str(owner.id)]

    personal = client.patch(f"/api/tasks/{task['id']}", json={"groupId": None}).json()
    assert personal["groupId"] is None
    assert personal["assigneeIds"] == []


def test_postpone_preserves_time_and_handles_undated(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    sign_in(make_user(db))
    due = int((datetime.now(UTC) + timedelta(hours=5)).timestamp() * 1000)
    task = _create(client, dueAt=due)

    moved = client.post(f"/api/tasks/{task['id']}/postpone", json={"timezoneOffsetMinutes": 0}).json()
    assert moved["dueAt"] == due + 24 * 3_600_000

    undated = _create(client, title="No date")
    assigned = client.post(f"/api/tasks/{undated['id']}/postpone", json={}).json()
    when = datetime.fromtimestamp((assigned["dueAt"] or 0) / 1000, tz=UTC)
    assert when.hour == 9 and when.minute == 0


def test_duplicate_resets_progress(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    task = _create(client, subtasks=[{"title": "Step", "done": True}])
    client.patch(f"/api/tasks/{task['id']}", json={"status": "done"})

    copy = client.post(f"/api/tasks/{task['id']}/duplicate").json()

    assert copy["id"] != task["id"]
    assert copy["status"] == "todo"
    assert copy["completedAt"] is None
    assert copy["subtasks"][0]["done"] is False


def test_list_filters(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    user = make_user(db)
    sign_in(user)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    due = int((datetime.now(UTC) + timedelta(days=1)).timestamp() * 1000)
    _create(client, title="Personal soon", dueAt=due)
    _create(client, title="Group work", groupId=group["id"], assigneeIds=[str(user.id)])
    _create(client, title="Personal later")

    personal = client.get("/api/tasks?personal=true").json()
    assert [item["title"] for item in personal] == ["Personal soon", "Personal later"]

    scoped = client.get(f"/api/tasks?groupId={group['id']}").json()
    assert [item["title"] for item in scoped] == ["Group work"]

    soon = client.get(f"/api/tasks?dueBefore={due + 1000}").json()
    assert [item["title"] for item in soon] == ["Personal soon"]

    assigned = client.get(f"/api/tasks?assignee={user.id}").json()
    assert [item["title"] for item in assigned] == ["Group work"]

    done = client.get("/api/tasks?status=done").json()
    assert done == []


def test_removing_a_member_reassigns_tasks(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    member = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()
    task = _create(client, groupId=group["id"], assigneeIds=[str(member.id)])

    client.request(
        "DELETE",
        f"/api/groups/{group['id']}/members/{member.id}",
        json={"reassignTo": str(owner.id)},
    )

    refreshed = client.get(f"/api/tasks/{task['id']}").json()
    assert refreshed["assigneeIds"] == [str(owner.id)]


def test_bootstrap_includes_tasks(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    task = _create(client)

    body = client.get("/api/bootstrap").json()

    assert [item["id"] for item in body["tasks"]] == [task["id"]]


def test_deleting_a_group_cascades_tasks(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    group = client.post(
        "/api/groups",
        json={"kind": "project", "name": "Capstone", "subject": "", "color": "sky", "description": ""},
    ).json()
    _create(client, groupId=group["id"])

    client.delete(f"/api/groups/{group['id']}")

    assert client.get("/api/tasks").json() == []
    assert db.query(Task).count() == 0
    assert db.query(User).count() == 1
