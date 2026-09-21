import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..schemas.groups import (
    GroupCreate,
    GroupLinkCreate,
    GroupOut,
    GroupPatch,
    InviteRequest,
    MemberOut,
    RemoveMemberRequest,
    TopicCreate,
    TopicPatch,
)
from ..schemas.notes import GroupNoteCreate, NoteOut
from ..services import group_services, note_services

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("", response_model=list[GroupOut])
def list_groups(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> list[GroupOut]:
    return group_services.list_groups(db, user)


@router.post("", response_model=GroupOut, status_code=201)
def create_group(
    data: GroupCreate, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> GroupOut:
    return group_services.create_group(db, user, data)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(
    group_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> GroupOut:
    return group_services.get_group(db, user, group_id)


@router.patch("/{group_id}", response_model=GroupOut)
def update_group(
    group_id: uuid.UUID,
    patch: GroupPatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GroupOut:
    return group_services.update_group(db, user, group_id, patch)


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> None:
    group_services.delete_group(db, user, group_id)


@router.post("/{group_id}/invite", response_model=MemberOut, status_code=201)
def invite_member(
    group_id: uuid.UUID,
    data: InviteRequest,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> MemberOut:
    member, _invite_url = group_services.add_member_by_email(db, user, group_id, data.email)
    return member


@router.post("/{group_id}/join", response_model=GroupOut)
def join_group(
    group_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> GroupOut:
    return group_services.join_group(db, user, group_id)


@router.post("/{group_id}/leave", status_code=204)
def leave_group(
    group_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> None:
    group_services.remove_member(db, user, group_id, user.id, None)


@router.delete("/{group_id}/members/{member_id}", response_model=GroupOut)
def remove_member(
    group_id: uuid.UUID,
    member_id: uuid.UUID,
    body: RemoveMemberRequest | None = None,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GroupOut:
    reassign = uuid.UUID(body.reassignTo) if body and body.reassignTo else None
    return group_services.remove_member(db, user, group_id, member_id, reassign)


@router.post("/{group_id}/invite-code", response_model=GroupOut)
def regenerate_invite(
    group_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> GroupOut:
    return group_services.regenerate_invite(db, user, group_id)


@router.post("/{group_id}/topics", response_model=GroupOut, status_code=201)
def add_topic(
    group_id: uuid.UUID,
    data: TopicCreate,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GroupOut:
    return group_services.add_topic(db, user, group_id, data.name)


@router.patch("/{group_id}/topics/{topic_id}", response_model=GroupOut)
def rename_topic(
    group_id: uuid.UUID,
    topic_id: uuid.UUID,
    data: TopicPatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GroupOut:
    return group_services.rename_topic(db, user, group_id, topic_id, data.name)


@router.delete("/{group_id}/topics/{topic_id}", response_model=GroupOut)
def remove_topic(
    group_id: uuid.UUID,
    topic_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GroupOut:
    return group_services.remove_topic(db, user, group_id, topic_id)


@router.post("/{group_id}/links", response_model=GroupOut, status_code=201)
def add_link(
    group_id: uuid.UUID,
    data: GroupLinkCreate,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GroupOut:
    return group_services.add_link(db, user, group_id, data.label, data.url)


@router.delete("/{group_id}/links/{link_id}", response_model=GroupOut)
def remove_link(
    group_id: uuid.UUID,
    link_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GroupOut:
    return group_services.remove_link(db, user, group_id, link_id)


@router.get("/{group_id}/notes", response_model=list[NoteOut])
def list_group_notes(
    group_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> list[NoteOut]:
    return note_services.notes_for_group(db, user, group_id)


@router.post("/{group_id}/notes", response_model=NoteOut, status_code=201)
def create_group_note(
    group_id: uuid.UUID,
    data: GroupNoteCreate,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> NoteOut:
    return note_services.create_group_note(db, user, group_id, data)
