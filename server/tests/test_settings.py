from fastapi.testclient import TestClient

from app.models.enums import UserKind


def test_settings_require_a_session(client: TestClient) -> None:
    response = client.get("/api/settings")

    assert response.status_code == 401
    assert response.json() == {"error": "Not signed in."}


def test_settings_defaults(client: TestClient, sign_in, make_user, db) -> None:
    sign_in(make_user(db))

    response = client.get("/api/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["theme"] == "light"
    assert body["leadTimeHours"] == 48
    assert body["kinds"]["overdue"] is True
    assert body["google"]["status"] == "disconnected"
    assert body["elpis"]["enabled"] is False
    assert body["syncLog"] == []


def test_settings_patch_merges_and_persists(client: TestClient, sign_in, make_user, db) -> None:
    sign_in(make_user(db))

    response = client.patch(
        "/api/settings",
        json={"leadTimeHours": 24, "kinds": {"overdue": False}, "theme": "dark"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["leadTimeHours"] == 24
    assert body["theme"] == "dark"
    assert body["kinds"]["overdue"] is False
    assert body["kinds"]["dueSoon"] is True

    again = client.get("/api/settings").json()
    assert again["kinds"]["overdue"] is False


def test_settings_reject_unknown_lead_time(client: TestClient, sign_in, make_user, db) -> None:
    sign_in(make_user(db))

    response = client.patch("/api/settings", json={"leadTimeHours": 5})

    assert response.status_code == 422
    assert response.json() == {"error": "Pick a reminder window from the list."}


def test_profile_patch(client: TestClient, sign_in, make_user, db) -> None:
    user = make_user(db, name="Ada", email="ada@example.com")
    sign_in(user)

    response = client.patch(
        "/api/auth/me",
        json={"name": "Ada Lovelace", "program": "BSc CS · Year 3", "color": "violet"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": str(user.id),
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "kind": UserKind.member,
        "program": "BSc CS · Year 3",
        "color": "violet",
    }

    assert client.get("/api/auth/me").json()["program"] == "BSc CS · Year 3"
