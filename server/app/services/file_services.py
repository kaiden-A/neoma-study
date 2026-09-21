"""Shared file access rules.

A file is personal (owner only) or group-scoped: group_id set means every
member of that group can preview it. Routers and services both go through these
helpers so the rules live in exactly one place. Shared copies are separate rows
with their own keys, so deleting either copy never affects the other.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..models import FileObject, Group, Note, User
from . import access, storage_services
from .errors import InvalidError, NotFoundError

MISSING_FILE = "That file is gone."
NOT_YOUR_GROUP_FILE = "That file is gone."


def require_visible_file(db: DbSession, user: User, file_id: uuid.UUID) -> FileObject:
    """The file, if the user owns it or belongs to its group."""
    file = db.get(FileObject, file_id)
    if file is None:
        raise NotFoundError(MISSING_FILE)
    if file.owner_id == user.id:
        return file
    if file.group_id is not None and access.is_member(db, file.group_id, user.id):
        return file
    raise NotFoundError(MISSING_FILE)


def require_deletable_file(db: DbSession, user: User, file_id: uuid.UUID) -> FileObject:
    """The uploader can delete their file; so can the group's owner."""
    file = require_visible_file(db, user, file_id)
    if file.owner_id == user.id:
        return file
    group = db.get(Group, file.group_id) if file.group_id else None
    if group is not None and group.owner_id == user.id:
        return file
    raise NotFoundError(NOT_YOUR_GROUP_FILE)


def require_attachable_file(
    db: DbSession, user: User, file_id: str | None, group_id: uuid.UUID | None
) -> uuid.UUID | None:
    """Resolves a file id from a payload for a note about to be created.

    Personal notes may only attach the owner's personal files, and group notes
    may only attach files scoped to that group — otherwise the other members
    could not preview the attachment.
    """
    if not file_id:
        return None
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError as exc:
        raise InvalidError("That file id is not valid.") from exc
    file = db.get(FileObject, file_uuid)
    if file is None:
        raise NotFoundError(MISSING_FILE)
    if group_id is None:
        if file.owner_id != user.id or file.group_id is not None:
            raise NotFoundError(MISSING_FILE)
    elif file.group_id != group_id:
        raise NotFoundError(MISSING_FILE)
    return file_uuid


def purge_file(db: DbSession, storage: storage_services.Storage, file: FileObject) -> None:
    """Removes the blob and the row. The caller commits."""
    storage.delete(file.key)
    storage.delete(file.thumb_key)
    db.delete(file)


def purge_attached_file(
    db: DbSession, storage: storage_services.Storage, file: FileObject, keep_note_id: uuid.UUID
) -> None:
    """Removes an attachment when the note carrying it goes, unless another
    note still references it. The caller commits."""
    still_used = db.scalar(
        select(Note.id).where(Note.file_id == file.id, Note.id != keep_note_id).limit(1)
    )
    if still_used is None:
        purge_file(db, storage, file)


def purge_group_files(db: DbSession, storage: storage_services.Storage, group_id: uuid.UUID) -> None:
    """Removes every blob a group owns; used before the group row cascades."""
    for file in db.scalars(select(FileObject).where(FileObject.group_id == group_id)):
        purge_file(db, storage, file)
    # Flush first: otherwise the group delete runs first and the FK cascade
    # removes these rows underneath the unit of work.
    db.flush()
