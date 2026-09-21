"""Groups, members, topics, links and invites.

Groups are the only shared container: a task or note belongs to a group or to a
person, never both. Membership is the authorization boundary; the owner has a
few extra powers (delete, invite, remove members).
"""

import re
import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import get_settings
from ..models import (
    Group,
    GroupKind,
    GroupLink,
    GroupMember,
    GroupRole,
    GroupTopic,
    Note,
    Task,
    TaskAssignee,
    User,
)
from ..schemas.groups import (
    GroupCreate,
    GroupLinkOut,
    GroupOut,
    GroupPatch,
    GroupPreviewOut,
    MemberOut,
    TopicOut,
)
from ..utils import to_ms
from . import access, email_services
from .errors import ConflictError, InvalidError, NotFoundError

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MARKER_KEYS = ("amber", "mint", "sky", "coral", "violet", "pink")

MISSING_GROUP = "That group is gone."


def _hash_int(value: str) -> int:
    """Same djb2-ish hash the client uses, so avatar colours match."""
    result = 0
    for char in value:
        result = ((result << 5) - result + ord(char)) & 0xFFFFFFFF
        if result >= 0x80000000:
            result -= 0x100000000
    return abs(result)


def _new_invite_code(db: DbSession) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(4))
        other = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(4))
        candidate = f"{code}-{other}"
        if db.scalar(select(Group.id).where(Group.invite_code == candidate)) is None:
            return candidate
    raise ConflictError("Could not allocate an invite code. Try again.")


def _member_out(db: DbSession, group_id: uuid.UUID) -> list[MemberOut]:
    rows = db.execute(
        select(GroupMember, User)
        .join(User, User.id == GroupMember.user_id)
        .where(GroupMember.group_id == group_id)
        .order_by(GroupMember.joined_at)
    ).all()
    return [
        MemberOut(
            id=str(user.id),
            name=user.display_name or "User",
            email=user.email or "",
            color=user.color or "amber",
            program=user.program or "",
            invited=user.zitadel_sub is None,
        )
        for _membership, user in rows
    ]


def group_out(db: DbSession, group: Group) -> GroupOut:
    topics = db.scalars(
        select(GroupTopic)
        .where(GroupTopic.group_id == group.id)
        .order_by(GroupTopic.position, GroupTopic.created_at)
    ).all()
    links = db.scalars(
        select(GroupLink)
        .where(GroupLink.group_id == group.id)
        .order_by(GroupLink.position, GroupLink.created_at)
    ).all()
    return GroupOut(
        id=str(group.id),
        kind=group.kind,
        name=group.name,
        subject=group.subject,
        color=group.color,
        description=group.description,
        inviteCode=group.invite_code,
        ownerId=str(group.owner_id),
        topics=[TopicOut(id=str(topic.id), name=topic.name, color=topic.color) for topic in topics],
        links=[GroupLinkOut(id=str(link.id), label=link.label, url=link.url) for link in links],
        members=_member_out(db, group.id),
        createdAt=to_ms(group.created_at) or 0,
        updatedAt=to_ms(group.updated_at) or 0,
    )


def list_groups(db: DbSession, user: User) -> list[GroupOut]:
    groups = db.scalars(
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == user.id)
        .order_by(Group.created_at.desc())
    ).all()
    return [group_out(db, group) for group in groups]


def create_group(db: DbSession, user: User, data: GroupCreate) -> GroupOut:
    group = Group(
        kind=data.kind,
        name=data.name.strip(),
        subject=data.subject.strip()[:80],
        color=data.color.strip() or ("violet" if data.kind is GroupKind.study else "sky"),
        description=data.description.strip()[:2000],
        invite_code=_new_invite_code(db),
        owner_id=user.id,
    )
    db.add(group)
    db.flush()
    access.add_member(db, group.id, user.id, GroupRole.owner)
    for index, name in enumerate(data.topics):
        clean = name.strip()[:80]
        if clean:
            db.add(
                GroupTopic(
                    group_id=group.id,
                    name=clean,
                    color=MARKER_KEYS[index % 6],
                    position=index,
                )
            )
    db.commit()
    return group_out(db, group)


def get_group(db: DbSession, user: User, group_id: uuid.UUID) -> GroupOut:
    group = access.require_group(db, group_id, user)
    return group_out(db, group)


def update_group(db: DbSession, user: User, group_id: uuid.UUID, patch: GroupPatch) -> GroupOut:
    group = access.require_group(db, group_id, user)
    if patch.name is not None:
        group.name = patch.name.strip()
    if patch.subject is not None:
        group.subject = patch.subject.strip()[:80]
    if patch.color is not None and patch.color.strip():
        group.color = patch.color.strip()[:16]
    if patch.description is not None:
        group.description = patch.description.strip()[:2000]
    db.commit()
    return group_out(db, group)


def delete_group(db: DbSession, user: User, group_id: uuid.UUID) -> None:
    """Owner only. Tasks, notes, topics and links cascade; events unlink."""
    group = access.require_group_owner(db, group_id, user)
    db.delete(group)
    db.commit()


def find_by_code(db: DbSession, code: str) -> Group | None:
    return db.scalar(select(Group).where(Group.invite_code == code.strip().upper()))


def preview(db: DbSession, code: str) -> GroupPreviewOut:
    group = find_by_code(db, code)
    if group is None:
        raise NotFoundError("That invite link is not valid.")
    owner = db.get(User, group.owner_id)
    topics = db.scalars(
        select(GroupTopic).where(GroupTopic.group_id == group.id).order_by(GroupTopic.position)
    ).all()
    return GroupPreviewOut(
        id=str(group.id),
        kind=group.kind,
        name=group.name,
        subject=group.subject,
        color=group.color,
        description=group.description,
        inviteCode=group.invite_code,
        ownerName=(owner.display_name if owner else "") or "",
        topics=[TopicOut(id=str(topic.id), name=topic.name, color=topic.color) for topic in topics],
        memberCount=len(access.member_ids(db, group.id)),
        isMember=False,
    )


def join_group(db: DbSession, user: User, group_id: uuid.UUID) -> GroupOut:
    group = db.get(Group, group_id)
    if group is None:
        raise NotFoundError("That invite link does not match a group.")
    if not access.is_member(db, group.id, user.id):
        access.add_member(db, group.id, user.id)
        db.commit()
    return group_out(db, group)


def add_member_by_email(db: DbSession, user: User, group_id: uuid.UUID, email: str) -> tuple[MemberOut, str]:
    """Adds a member, creating an invited placeholder user when needed.

    Returns the member and the invite URL that was emailed.
    """
    group = access.require_group(db, group_id, user)
    clean = email.strip().lower()
    if not EMAIL_PATTERN.match(clean):
        raise InvalidError("Enter a valid email address, like maya@student.edu.")

    invitee = db.scalar(select(User).where(User.email == clean).order_by(User.created_at).limit(1))
    if invitee is None:
        local = clean.split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ")
        invitee = User(
            email=clean,
            display_name=local.title() or "Invitee",
            color=MARKER_KEYS[_hash_int(clean) % 6],
        )
        db.add(invitee)
        db.flush()

    if access.is_member(db, group.id, invitee.id):
        raise ConflictError(f"{invitee.display_name} is already in this group.")

    access.add_member(db, group.id, invitee.id)
    db.commit()

    settings = get_settings()
    invite_url = f"{settings.public_base_url.rstrip('/')}/join/{group.invite_code}"
    topics = [
        topic.name
        for topic in db.scalars(
            select(GroupTopic).where(GroupTopic.group_id == group.id).order_by(GroupTopic.position)
        )
    ]
    email_services.send_group_invite(
        db, group=group, inviter=user, to_email=clean, invite_url=invite_url, topics=topics
    )

    members = {member.id: member for member in _member_out(db, group.id)}
    return members[str(invitee.id)], invite_url


def remove_member(
    db: DbSession, user: User, group_id: uuid.UUID, member_id: uuid.UUID, reassign_to: uuid.UUID | None
) -> GroupOut:
    group = access.require_group(db, group_id, user)
    if member_id == group.owner_id:
        raise InvalidError("The owner cannot be removed. Delete the group instead.")
    if member_id != user.id and group.owner_id != user.id:
        raise InvalidError("Only the owner can remove other members.")
    if not access.is_member(db, group.id, member_id):
        raise NotFoundError("They are not in this group.")
    if reassign_to is not None and not access.is_member(db, group.id, reassign_to):
        raise InvalidError("Pick a member of this group to hand the work to.")

    for membership in db.scalars(
        select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.user_id == member_id)
    ):
        db.delete(membership)

    task_ids = list(db.scalars(select(Task.id).where(Task.group_id == group.id)).all())
    for assignee in db.scalars(
        select(TaskAssignee).where(TaskAssignee.task_id.in_(task_ids), TaskAssignee.user_id == member_id)
    ):
        db.delete(assignee)
    if reassign_to is not None:
        for task_id in task_ids:
            exists = db.scalar(
                select(TaskAssignee.id).where(
                    TaskAssignee.task_id == task_id, TaskAssignee.user_id == reassign_to
                )
            )
            if exists is None:
                db.add(TaskAssignee(task_id=task_id, user_id=reassign_to))

    db.commit()
    return group_out(db, group)


def regenerate_invite(db: DbSession, user: User, group_id: uuid.UUID) -> GroupOut:
    group = access.require_group_owner(db, group_id, user)
    group.invite_code = _new_invite_code(db)
    db.commit()
    return group_out(db, group)


def add_topic(db: DbSession, user: User, group_id: uuid.UUID, name: str) -> GroupOut:
    group = access.require_group(db, group_id, user)
    position = len(db.scalars(select(GroupTopic.id).where(GroupTopic.group_id == group.id)).all())
    db.add(
        GroupTopic(
            group_id=group.id,
            name=name.strip()[:80],
            color=MARKER_KEYS[position % 6],
            position=position,
        )
    )
    db.commit()
    return group_out(db, group)


def rename_topic(db: DbSession, user: User, group_id: uuid.UUID, topic_id: uuid.UUID, name: str) -> GroupOut:
    group = access.require_group(db, group_id, user)
    topic = db.get(GroupTopic, topic_id)
    if topic is None or topic.group_id != group.id:
        raise NotFoundError("That topic is gone.")
    topic.name = name.strip()[:80]
    db.commit()
    return group_out(db, group)


def remove_topic(db: DbSession, user: User, group_id: uuid.UUID, topic_id: uuid.UUID) -> GroupOut:
    group = access.require_group(db, group_id, user)
    topic = db.get(GroupTopic, topic_id)
    if topic is None or topic.group_id != group.id:
        raise NotFoundError("That topic is gone.")
    for note in db.scalars(select(Note).where(Note.topic_id == topic_id)):
        note.topic_id = None
    db.delete(topic)
    db.commit()
    return group_out(db, group)


def add_link(db: DbSession, user: User, group_id: uuid.UUID, label: str, url: str) -> GroupOut:
    group = access.require_group(db, group_id, user)
    clean_url = url.strip()
    if not clean_url.lower().startswith(("http://", "https://")):
        raise InvalidError("Links need to start with http:// or https://")
    position = len(db.scalars(select(GroupLink.id).where(GroupLink.group_id == group.id)).all())
    db.add(
        GroupLink(
            group_id=group.id,
            label=(label.strip() or clean_url.split("//")[-1].split("/")[0])[:160],
            url=clean_url[:1000],
            position=position,
        )
    )
    db.commit()
    return group_out(db, group)


def remove_link(db: DbSession, user: User, group_id: uuid.UUID, link_id: uuid.UUID) -> GroupOut:
    group = access.require_group(db, group_id, user)
    link = db.get(GroupLink, link_id)
    if link is None or link.group_id != group.id:
        raise NotFoundError("That link is gone.")
    db.delete(link)
    db.commit()
    return group_out(db, group)
