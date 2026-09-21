"""Membership and ownership checks shared by every router and service."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..models import Group, GroupMember, GroupRole, User
from .errors import ForbiddenError, NotFoundError

MISSING = "We could not find that."


def is_member(db: DbSession, group_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        db.scalar(
            select(GroupMember.id).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        )
        is not None
    )


def require_group(db: DbSession, group_id: uuid.UUID, user: User) -> Group:
    """The group, if the user is a member. Non-members get a 404, not a 403:
    the API never confirms that someone else's group exists."""
    group = db.get(Group, group_id)
    if group is None or not is_member(db, group_id, user.id):
        raise NotFoundError(MISSING)
    return group


def require_group_owner(db: DbSession, group_id: uuid.UUID, user: User) -> Group:
    group = require_group(db, group_id, user)
    if group.owner_id != user.id:
        raise ForbiddenError("Only the group owner can do that.")
    return group


def member_ids(db: DbSession, group_id: uuid.UUID) -> list[uuid.UUID]:
    return list(db.scalars(select(GroupMember.user_id).where(GroupMember.group_id == group_id)).all())


def add_member(
    db: DbSession, group_id: uuid.UUID, user_id: uuid.UUID, role: GroupRole = GroupRole.member
) -> GroupMember:
    membership = GroupMember(group_id=group_id, user_id=user_id, role=role)
    db.add(membership)
    return membership


def require_members_of(db: DbSession, group_id: uuid.UUID, user_ids: list[uuid.UUID]) -> None:
    """Every id must belong to the group; used for assignee lists."""
    if not user_ids:
        return
    known = set(member_ids(db, group_id))
    if any(user_id not in known for user_id in user_ids):
        raise NotFoundError("Some of those people are not in this group.")


def require_owned(row: object | None, user: User, *, owner_attr: str = "owner_id") -> None:
    """404 unless the row exists and belongs to the user."""
    if row is None or getattr(row, owner_attr) != user.id:
        raise NotFoundError(MISSING)
