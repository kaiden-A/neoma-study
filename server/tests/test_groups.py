import io
import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import Group, GroupMember, User
from app.models.enums import GroupRole
from app.services import auth_services

settings = get_settings()


def _create_group(client: TestClient, **overrides) -> dict:
    payload = {"kind": "project", "name": "Capstone", "subject": "CS301", "color": "sky", "description": ""}
    payload.update(overrides)
    response = client.post("/api/groups", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_group_makes_owner_a_member(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    user = make_user(db)
    sign_in(user)

    body = _create_group(client)

    assert body["name"] == "Capstone"
    assert body["ownerId"] == str(user.id)
    assert len(body["members"]) == 1
    assert body["members"][0]["id"] == str(user.id)
    assert body["members"][0]["invited"] is False
    assert len(body["inviteCode"]) == 9 and body["inviteCode"][4] == "-"
    assert all(char not in body["inviteCode"] for char in "IO01")


def test_create_study_group_assigns_topic_colours(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    sign_in(make_user(db))

    body = _create_group(client, kind="study", name="Finals crew", topics=["CS301", "CHEM210", "MATH201"])

    assert [topic["name"] for topic in body["topics"]] == ["CS301", "CHEM210", "MATH201"]
    assert [topic["color"] for topic in body["topics"]] == ["amber", "mint", "sky"]
    assert body["color"] == "sky"


def test_groups_are_scoped_to_membership(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="owner@example.com")
    other = make_user(db, email="other@example.com")
    sign_in(owner)
    group = _create_group(client)
    client.post("/api/auth/logout")

    sign_in(other)
    assert client.get("/api/groups").json() == []
    assert client.get(f"/api/groups/{group['id']}").status_code == 404


def test_update_group(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    group = _create_group(client)

    response = client.patch(f"/api/groups/{group['id']}", json={"name": "Capstone v2", "color": "mint"})

    assert response.status_code == 200
    assert response.json()["name"] == "Capstone v2"
    assert response.json()["color"] == "mint"


def test_delete_group_is_owner_only(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="owner@example.com")
    member = make_user(db, email="member@example.com")
    sign_in(owner)
    group = _create_group(client)
    client.post("/api/auth/logout")

    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()
    sign_in(member)
    assert client.delete(f"/api/groups/{group['id']}").status_code == 403

    client.post("/api/auth/logout")
    sign_in(owner)
    assert client.delete(f"/api/groups/{group['id']}").status_code == 204
    assert client.get(f"/api/groups/{group['id']}").status_code == 404


def test_invite_by_email_creates_placeholder_and_sends_mail(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    inviter = make_user(db, name="Ada Lovelace", email="ada@example.com")
    sign_in(inviter)
    group = _create_group(client, name="Lab group")

    response = client.post(f"/api/groups/{group['id']}/invite", json={"email": "Maya@Student.edu"})

    assert response.status_code == 201, response.text
    member = response.json()
    assert member["email"] == "maya@student.edu"
    assert member["invited"] is True
    assert member["name"] == "Maya"
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "maya@student.edu"
    assert "invited you to Lab group" in sent_emails[0]["subject"]
    assert group["inviteCode"] in sent_emails[0]["text"]

    placeholder = db.query(User).filter(User.email == "maya@student.edu").one()
    assert placeholder.zitadel_sub is None

    again = client.post(f"/api/groups/{group['id']}/invite", json={"email": "maya@student.edu"})
    assert again.status_code == 409
    assert "already in this group" in again.json()["error"]


def test_invite_rejects_bad_email(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    group = _create_group(client)

    response = client.post(f"/api/groups/{group['id']}/invite", json={"email": "not-an-email"})

    assert response.status_code == 422
    assert "valid email" in response.json()["error"]


def test_invited_person_adopts_placeholder_on_first_login(
    idp_client: TestClient, fake_idp, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    inviter = make_user(db, name="Ada", email="ada@example.com")
    sign_in(inviter)
    group = _create_group(client=idp_client, name="Shared unit")
    idp_client.post(f"/api/groups/{group['id']}/invite", json={"email": "maya@student.edu"})
    idp_client.post("/api/auth/logout")

    fake_idp.claims = {"sub": "zitadel-maya", "email": "Maya@student.edu", "name": "Maya Chen"}
    start = idp_client.get("/api/auth/login")
    from urllib.parse import parse_qs, urlparse

    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    idp_client.get(f"/api/auth/callback?code=fake&state={state}")

    maya = db.query(User).filter(User.email == "maya@student.edu").one()
    assert maya.zitadel_sub == "zitadel-maya"
    assert maya.display_name == "Maya Chen"
    assert client_groups(idp_client) == [group["id"]]


def client_groups(client: TestClient) -> list[str]:
    return [group["id"] for group in client.get("/api/groups").json()]


def test_invite_preview_is_public_and_join_is_idempotent(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    owner = make_user(db, name="Ada", email="ada@example.com")
    joiner = make_user(db, name="Maya", email="maya@example.com")
    sign_in(owner)
    group = _create_group(client)
    client.post("/api/auth/logout")

    preview = client.get(f"/api/invites/{group['inviteCode'].lower()}")
    assert preview.status_code == 200
    assert preview.json()["name"] == "Capstone"
    assert preview.json()["ownerName"] == "Ada"
    assert preview.json()["memberCount"] == 1
    assert preview.json()["isMember"] is False

    sign_in(joiner)
    joined = client.post(f"/api/invites/{group['inviteCode']}/join")
    assert joined.status_code == 200
    assert len(joined.json()["members"]) == 2
    assert client.get(f"/api/invites/{group['inviteCode']}").json()["isMember"] is True

    again = client.post(f"/api/invites/{group['inviteCode']}/join")
    assert len(again.json()["members"]) == 2


def test_unknown_invite_code_is_404(client: TestClient) -> None:
    response = client.get("/api/invites/ZZZZ-ZZZZ")

    assert response.status_code == 404
    assert response.json() == {"error": "That invite link is not valid."}


def test_remove_member_and_leave(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="owner@example.com")
    member = make_user(db, email="member@example.com")
    sign_in(owner)
    group = _create_group(client)
    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()

    owner_removal = client.delete(f"/api/groups/{group['id']}/members/{group['ownerId']}")
    assert owner_removal.status_code == 422

    removed = client.delete(f"/api/groups/{group['id']}/members/{member.id}")
    assert removed.status_code == 200
    assert [m["id"] for m in removed.json()["members"]] == [str(owner.id)]

    # A non-owner can leave on their own.
    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()
    client.post("/api/auth/logout")
    sign_in(member)
    assert client.post(f"/api/groups/{group['id']}/leave").status_code == 204
    assert client.get("/api/groups").json() == []


def test_topics_and_links(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    sign_in(make_user(db))
    group = _create_group(client, kind="study", topics=["CS301"])

    added = client.post(f"/api/groups/{group['id']}/topics", json={"name": "MATH201"})
    assert [topic["name"] for topic in added.json()["topics"]] == ["CS301", "MATH201"]
    topic_id = added.json()["topics"][1]["id"]

    renamed = client.patch(f"/api/groups/{group['id']}/topics/{topic_id}", json={"name": "MATH202"})
    assert renamed.json()["topics"][1]["name"] == "MATH202"

    removed = client.delete(f"/api/groups/{group['id']}/topics/{topic_id}")
    assert [topic["name"] for topic in removed.json()["topics"]] == ["CS301"]

    bad_link = client.post(f"/api/groups/{group['id']}/links", json={"label": "", "url": "not-a-url"})
    assert bad_link.status_code == 422

    linked = client.post(
        f"/api/groups/{group['id']}/links", json={"label": "Drive", "url": "https://drive.example.com/x"}
    )
    assert linked.json()["links"][0]["label"] == "Drive"
    link_id = linked.json()["links"][0]["id"]
    assert client.delete(f"/api/groups/{group['id']}/links/{link_id}").json()["links"] == []


def test_regenerate_invite_is_owner_only(client: TestClient, sign_in, make_user, db: DbSession) -> None:
    owner = make_user(db, email="owner@example.com")
    member = make_user(db, email="member@example.com")
    sign_in(owner)
    group = _create_group(client)

    rotated = client.post(f"/api/groups/{group['id']}/invite-code")
    assert rotated.status_code == 200
    assert rotated.json()["inviteCode"] != group["inviteCode"]

    db.add(GroupMember(group_id=uuid.UUID(group["id"]), user_id=member.id, role=GroupRole.member))
    db.commit()
    client.post("/api/auth/logout")
    sign_in(member)
    assert client.post(f"/api/groups/{group['id']}/invite-code").status_code == 403


def test_bootstrap_returns_user_settings_and_groups(
    client: TestClient, sign_in, make_user, db: DbSession
) -> None:
    user = make_user(db, name="Ada", email="ada@example.com")
    sign_in(user)
    group = _create_group(client)

    body = client.get("/api/bootstrap").json()

    assert body["user"]["name"] == "Ada"
    assert body["settings"]["leadTimeHours"] == 48
    assert body["subjects"] == []
    assert [item["id"] for item in body["groups"]] == [group["id"]]


def test_email_log_dedupes_invites(
    client: TestClient, sign_in, make_user, db: DbSession, sent_emails: list[dict]
) -> None:
    sign_in(make_user(db))
    group = _create_group(client)
    client.post(f"/api/groups/{group['id']}/invite", json={"email": "maya@student.edu"})

    # Rotating the code changes the dedupe key, so the same person can be
    # invited again after the link changes.
    client.post(f"/api/groups/{group['id']}/invite-code")
    assert len(sent_emails) == 1


def test_deleting_a_group_purges_its_files(
    client: TestClient, sign_in, make_user, db: DbSession, storage
) -> None:
    sign_in(make_user(db))
    group = _create_group(client, kind="study", name="Finals crew")
    upload = client.post(
        "/api/files",
        files={"file": ("scan.jpg", io.BytesIO(b"img"), "image/jpeg")},
        data={"groupId": group["id"]},
    ).json()

    assert client.delete(f"/api/groups/{group['id']}").status_code == 204
    assert storage.deleted == [f"groups/{group['id']}/{upload['id']}"]


def test_service_adopts_placeholder_directly(db: DbSession, make_user) -> None:
    owner = make_user(db, email="owner@example.com")
    placeholder = User(email="new@example.com", display_name="New", color="amber")
    db.add(placeholder)
    db.commit()
    group = Group(name="G", invite_code="AAAA-BBBB", owner_id=owner.id)
    db.add(group)
    db.flush()
    db.add(GroupMember(group_id=group.id, user_id=placeholder.id, role=GroupRole.member))
    db.commit()

    adopted = auth_services.find_or_create_member(
        db, issuer="https://idp.test", subject="sub-new", email="NEW@example.com", name="New Person"
    )

    assert adopted.id == placeholder.id
    assert adopted.zitadel_sub == "sub-new"
    assert adopted.display_name == "New Person"
    membership = db.query(GroupMember).filter(GroupMember.user_id == adopted.id).one()
    assert membership.group_id == group.id
