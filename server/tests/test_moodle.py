"""iTa'leem: token parsing, sync, detach/ignore and vault saves."""

import base64
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import (
    FileObject,
    MoodleAccount,
    MoodleAssignment,
    MoodleCourse,
    Note,
    Subject,
    Task,
)
from app.models.enums import NoteScope
from app.services import moodle_services
from app.services.errors import InvalidError

TOKEN = "a" * 32
NEEDED = [
    "core_enrol_get_users_courses",
    "mod_assign_get_assignments",
    "core_course_get_contents",
    "core_calendar_get_action_events_by_timesort",
    "gradereport_user_get_grade_items",
]


def _link(token: str = TOKEN) -> str:
    payload = base64.b64encode(f"siteid:::{token}:::private".encode()).decode()
    return f"neoma://token={payload}"


def _now(days: int = 2) -> int:
    return int((datetime.now(UTC) + timedelta(days=days)).timestamp())


class FakeMoodle:
    def __init__(self, *, bad_token: bool = False) -> None:
        self.bad_token = bad_token
        self.calls: list[str] = []
        self.downloads: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            self.downloads.append(str(request.url))
            return httpx.Response(
                200, content=b"Read the case notes.", headers={"content-type": "text/plain"}
            )
        form = parse_qs(request.content.decode())
        function = form.get("wsfunction", [""])[0]
        self.calls.append(function)
        if self.bad_token:
            return httpx.Response(
                200,
                json={
                    "exception": "moodle_exception",
                    "errorcode": "invalidtoken",
                    "message": "Invalid token - token not found",
                },
            )
        if function == "core_webservice_get_site_info":
            return httpx.Response(
                200,
                json={
                    "sitename": "iTa'LeEm",
                    "release": "5.2 (Build: 20260420)",
                    "siteurl": "https://italeemc.iium.edu.my",
                    "userid": 7,
                    "username": "s1234567",
                    "fullname": "Test Student",
                    "functions": [{"name": name, "version": "1"} for name in NEEDED],
                },
            )
        if function == "core_enrol_get_users_courses":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 101,
                        "shortname": "LAWS1010",
                        "fullname": "Business Law",
                        "category": 1,
                        "progress": 40,
                        "visible": 1,
                    }
                ],
            )
        if function == "mod_assign_get_assignments":
            return httpx.Response(
                200,
                json={
                    "courses": [
                        {
                            "id": 101,
                            "assignments": [
                                {
                                    "id": 500,
                                    "cmid": 9001,
                                    "course": 101,
                                    "name": "Case brief",
                                    "duedate": _now(2),
                                    "cutoffdate": 0,
                                    "intro": "<p>Read the case</p>",
                                    "timemodified": _now(-1),
                                }
                            ],
                        }
                    ]
                },
            )
        if function == "core_calendar_get_action_events_by_timesort":
            return httpx.Response(
                200,
                json={
                    "events": [
                        {
                            "id": 77,
                            "name": "Quiz 1 closes",
                            "description": "<p>Units 1-3</p>",
                            "timestart": _now(3),
                            "eventtype": "close",
                            "modulename": "quiz",
                            "courseid": 101,
                            "url": "https://italeemc.iium.edu.my/mod/quiz/view.php?id=9002",
                        },
                        {
                            "id": 78,
                            "name": "Quiz 1 opens",
                            "description": "",
                            "timestart": _now(1),
                            "eventtype": "open",
                            "modulename": "quiz",
                            "courseid": 101,
                            "url": "https://italeemc.iium.edu.my/mod/quiz/view.php?id=9002",
                        },
                    ]
                },
            )
        if function == "core_course_get_contents":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 1,
                        "name": "Week 1",
                        "uservisible": True,
                        "summary": "<p>Intro</p>",
                        "modules": [
                            {
                                "id": 9001,
                                "name": "Case brief instructions",
                                "modname": "assign",
                                "url": "https://italeemc.iium.edu.my/mod/assign/view.php?id=9001",
                                "uservisible": True,
                                "visible": 1,
                                "description": "<p>Brief the case.</p>",
                                "contents": [],
                            },
                            {
                                "id": 9003,
                                "name": "Week 1 slides",
                                "modname": "resource",
                                "url": "https://italeemc.iium.edu.my/mod/resource/view.php?id=9003",
                                "uservisible": True,
                                "visible": 1,
                                "description": "",
                                "contents": [
                                    {
                                        "type": "file",
                                        "filename": "week1.txt",
                                        "filepath": "/",
                                        "filesize": 20,
                                        "fileurl": "https://italeemc.iium.edu.my/webservice/pluginfile.php/1/mod_resource/content/0/week1.txt",
                                        "mimetype": "text/plain",
                                    }
                                ],
                            },
                        ],
                    }
                ],
            )
        if function == "gradereport_user_get_grade_items":
            return httpx.Response(
                200,
                json={
                    "usergrades": [
                        {
                            "courseid": 101,
                            "gradeitems": [
                                {
                                    "itemname": "Midterm",
                                    "gradeformatted": "78.00",
                                    "grademax": 100,
                                    "percentageformatted": "78 %",
                                    "feedback": "<p>Good</p>",
                                    "cmid": 9001,
                                }
                            ],
                        }
                    ]
                },
            )
        if function == "mod_assign_get_submission_status":
            return httpx.Response(
                200,
                json={
                    "lastattempt": {"submission": {"status": "submitted"}},
                    "gradingstatus": "graded",
                    "feedback": {"gradefordisplay": "78 / 100"},
                },
            )
        return httpx.Response(200, json={})


def install(monkeypatch, fake: FakeMoodle) -> None:
    http = httpx.Client(transport=httpx.MockTransport(fake.handler))
    api = moodle_services.MoodleClient(token=TOKEN, http=http)
    monkeypatch.setattr(moodle_services, "client", lambda token, wwwroot=None: api)


def test_parse_token_accepts_links_and_raw_tokens() -> None:
    assert moodle_services.parse_token(_link()) == TOKEN
    assert moodle_services.parse_token(TOKEN) == TOKEN
    assert moodle_services.parse_token(f"web+neoma://token={_link().split('token=')[1]}") == TOKEN
    with pytest.raises(InvalidError):
        moodle_services.parse_token("not a link")


def test_connect_sync_detach_delete(
    client: TestClient,
    db: DbSession,
    make_user,
    sign_in,
    monkeypatch,
) -> None:
    user = make_user(db)
    sign_in(user)
    fake = FakeMoodle()
    install(monkeypatch, fake)

    response = client.post("/api/moodle/token", json={"link": _link()})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"]["connected"] is True
    assert body["counts"] == {"courses": 1, "deadlines": 1, "events": 1}

    db.expire_all()
    account = db.scalar(select(MoodleAccount).where(MoodleAccount.user_id == user.id))
    assert account is not None
    assert TOKEN not in account.token_enc
    assert account.username == "s1234567"
    assert account.functions == NEEDED

    courses = db.scalars(select(MoodleCourse).where(MoodleCourse.user_id == user.id)).all()
    assert len(courses) == 1
    subject = db.scalar(select(Subject).where(Subject.owner_id == user.id))
    assert subject is not None
    assert courses[0].subject_id == subject.id

    tasks = db.scalars(select(Task).where(Task.owner_id == user.id)).all()
    assert {task.external_uid for task in tasks} == {"assign:500", "italeem-event:77"}
    assert all(task.course_id == courses[0].id for task in tasks)
    assert all(task.reminder_minutes == 24 * 60 for task in tasks)

    # A second sync is idempotent.
    again = client.post("/api/moodle/sync")
    assert again.status_code == 200, again.text
    assert len(db.scalars(select(Task).where(Task.owner_id == user.id)).all()) == 2

    # Editing a mirrored task detaches it and never recreates it.
    assignment_task = next(task for task in tasks if task.external_uid == "assign:500")
    edited = client.patch(
        f"/api/tasks/{assignment_task.id}", json={"title": "My own case brief"}
    )
    assert edited.status_code == 200, edited.text
    db.expire_all()
    detached = db.get(Task, assignment_task.id)
    assert detached is not None
    assert detached.external_uid is None
    assert detached.title == "My own case brief"
    account = db.scalar(select(MoodleAccount).where(MoodleAccount.user_id == user.id))
    assert "assign:500" in account.ignored_uids

    client.post("/api/moodle/sync")
    db.expire_all()
    assert len(db.scalars(select(Task).where(Task.owner_id == user.id)).all()) == 2

    # Deleting the quiz deadline tombstones it.
    quiz_task = next(
        task
        for task in db.scalars(select(Task).where(Task.owner_id == user.id)).all()
        if task.external_uid == "italeem-event:77"
    )
    assert client.delete(f"/api/tasks/{quiz_task.id}").status_code == 204
    client.post("/api/moodle/sync")
    db.expire_all()
    remaining = db.scalars(select(Task).where(Task.owner_id == user.id)).all()
    assert [task.external_uid for task in remaining] == [None]


def test_course_detail_and_save_to_vault(
    client: TestClient,
    db: DbSession,
    make_user,
    sign_in,
    monkeypatch,
    storage,
) -> None:
    user = make_user(db)
    sign_in(user)
    fake = FakeMoodle()
    install(monkeypatch, fake)
    assert client.post("/api/moodle/token", json={"link": _link()}).status_code == 200

    courses = client.get("/api/moodle/courses")
    assert courses.status_code == 200, courses.text
    course_id = courses.json()[0]["id"]
    assert courses.json()[0]["openDeadlines"] == 2

    detail = client.get(f"/api/moodle/courses/{course_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["sections"][0]["name"] == "Week 1"
    assert body["sections"][0]["modules"][1]["files"][0]["filename"] == "week1.txt"
    assert body["assignments"][0]["name"] == "Case brief"

    saved = client.post(
        f"/api/moodle/courses/{course_id}/save", json={"cmid": 9003, "fileIndex": 0}
    )
    assert saved.status_code == 201, saved.text
    note_id = saved.json()["noteId"]

    db.expire_all()
    note = db.get(Note, note_id)
    assert note is not None
    assert note.external_uid and note.external_uid.startswith("italeem-file:")
    record = db.get(FileObject, note.file_id)
    assert record is not None
    assert storage.objects[record.key] == b"Read the case notes."
    assert record.extracted_text == "Read the case notes."

    # Saving again returns the same note and does not download twice.
    downloads = len(fake.downloads)
    again = client.post(f"/api/moodle/courses/{course_id}/save", json={"cmid": 9003})
    assert again.status_code == 201
    assert again.json()["noteId"] == note_id
    assert len(fake.downloads) == downloads


def test_assignments_refresh_submission_status(
    client: TestClient,
    db: DbSession,
    make_user,
    sign_in,
    monkeypatch,
) -> None:
    user = make_user(db)
    sign_in(user)
    install(monkeypatch, FakeMoodle())
    assert client.post("/api/moodle/token", json={"link": _link()}).status_code == 200

    course_id = client.get("/api/moodle/courses").json()[0]["id"]
    response = client.get(f"/api/moodle/courses/{course_id}/assignments?refresh=1")
    assert response.status_code == 200, response.text
    row = response.json()[0]
    assert row["submissionStatus"] == "submitted"
    assert row["grade"] == "78 / 100"

    db.expire_all()
    stored = db.scalar(select(MoodleAssignment).where(MoodleAssignment.user_id == user.id))
    assert stored is not None
    assert stored.submission_status == "submitted"
    assert stored.status_at is not None


def test_disconnect_keeps_vault_notes(
    client: TestClient,
    db: DbSession,
    make_user,
    sign_in,
    monkeypatch,
) -> None:
    user = make_user(db)
    sign_in(user)
    install(monkeypatch, FakeMoodle())
    client.post("/api/moodle/token", json={"link": _link()})
    note = Note(owner_id=user.id, scope=NoteScope.personal, title="Saved", external_uid="italeem-file:1:abc")
    db.add(note)
    db.commit()

    assert client.delete("/api/moodle").status_code == 200
    db.expire_all()
    assert db.scalar(select(MoodleAccount).where(MoodleAccount.user_id == user.id)) is None
    assert db.scalars(select(Task).where(Task.owner_id == user.id)).all() == []
    assert db.get(Note, note.id) is not None
    status = client.get("/api/moodle").json()
    assert status["connected"] is False


def test_bad_token_is_a_sentence(
    client: TestClient, db: DbSession, make_user, sign_in, monkeypatch
) -> None:
    user = make_user(db)
    sign_in(user)
    install(monkeypatch, FakeMoodle(bad_token=True))
    response = client.post("/api/moodle/token", json={"link": _link()})
    assert response.status_code == 422, response.text
    assert "connect" in response.json()["error"].lower()
