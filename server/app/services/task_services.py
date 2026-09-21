"""Tasks: personal to-dos and group board items.

A task belongs either to a person (owner_id) or to a group (group_id); the
database check constraint enforces the exclusive-or. Visibility follows that:
your own rows, plus every task in a group you belong to.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from ..models import GroupMember, Task, TaskAssignee, TaskLink, TaskStatus, TaskSubtask, User
from ..schemas.tasks import SubtaskIn, SubtaskOut, TaskCreate, TaskLinkIn, TaskLinkOut, TaskOut, TaskPatch
from ..utils import from_ms, to_ms
from . import access
from .errors import InvalidError, NotFoundError

MISSING_TASK = "We could not find that task."


def _visible_group_ids(db: DbSession, user: User) -> list[uuid.UUID]:
    return list(db.scalars(select(GroupMember.group_id).where(GroupMember.user_id == user.id)).all())


def _can_access(db: DbSession, user: User, task: Task) -> bool:
    if task.owner_id is not None:
        return task.owner_id == user.id
    return task.group_id is not None and access.is_member(db, task.group_id, user.id)


def require_task(db: DbSession, user: User, task_id: uuid.UUID) -> Task:
    task = db.get(Task, task_id)
    if task is None or not _can_access(db, user, task):
        raise NotFoundError(MISSING_TASK)
    return task


def task_out(task: Task) -> TaskOut:
    return TaskOut(
        id=str(task.id),
        groupId=str(task.group_id) if task.group_id else None,
        title=task.title,
        description=task.description,
        dueAt=to_ms(task.due_at),
        status=task.status,
        priority=task.priority,
        createdBy=str(task.created_by) if task.created_by else None,
        completedAt=to_ms(task.completed_at),
        createdAt=to_ms(task.created_at) or 0,
        updatedAt=to_ms(task.updated_at) or 0,
        assigneeIds=sorted(str(assignee.user_id) for assignee in task.assignees),
        subtasks=[
            SubtaskOut(id=str(row.id), title=row.title, done=row.done)
            for row in sorted(task.subtasks, key=lambda item: item.position)
        ],
        links=[
            TaskLinkOut(id=str(row.id), label=row.label, url=row.url)
            for row in sorted(task.links, key=lambda item: item.position)
        ],
    )


def list_tasks(
    db: DbSession,
    user: User,
    *,
    group_id: uuid.UUID | None = None,
    personal: bool = False,
    status: TaskStatus | None = None,
    assignee: uuid.UUID | None = None,
    due_before: datetime | None = None,
    due_after: datetime | None = None,
) -> list[TaskOut]:
    group_ids = _visible_group_ids(db, user)
    condition = Task.owner_id == user.id
    if group_ids:
        condition = or_(condition, Task.group_id.in_(group_ids))
    query = select(Task).where(condition)
    if personal:
        query = query.where(Task.owner_id == user.id)
    elif group_id is not None:
        access.require_group(db, group_id, user)
        query = query.where(Task.group_id == group_id)
    if status is not None:
        query = query.where(Task.status == status)
    if due_before is not None:
        query = query.where(Task.due_at.is_not(None), Task.due_at <= due_before)
    if due_after is not None:
        query = query.where(Task.due_at.is_not(None), Task.due_at >= due_after)
    tasks = list(db.scalars(query.order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc())).all())
    if assignee is not None:
        tasks = [task for task in tasks if any(row.user_id == assignee for row in task.assignees)]
    return [task_out(task) for task in tasks]


def _apply_assignees(db: DbSession, user: User, task: Task, assignee_ids: list[str]) -> None:
    wanted: list[uuid.UUID] = []
    for raw in assignee_ids:
        try:
            wanted.append(uuid.UUID(raw))
        except ValueError as exc:
            raise InvalidError("That assignee id is not valid.") from exc
    if task.group_id is None:
        # Personal to-dos have nobody to assign to.
        wanted = []
    else:
        access.require_members_of(db, task.group_id, wanted)
    for row in list(task.assignees):
        db.delete(row)
    for user_id in dict.fromkeys(wanted):
        db.add(TaskAssignee(task_id=task.id, user_id=user_id))


def _apply_subtasks(task: Task, subtasks: list[SubtaskIn]) -> None:
    for row in list(task.subtasks):
        task.subtasks.remove(row)
    for index, item in enumerate(subtasks):
        task.subtasks.append(TaskSubtask(title=item.title.strip()[:300], done=item.done, position=index))


def _apply_links(task: Task, links: list[TaskLinkIn]) -> None:
    for row in list(task.links):
        task.links.remove(row)
    for index, item in enumerate(links):
        url = item.url.strip()
        if not url.lower().startswith(("http://", "https://")):
            raise InvalidError("Links need to start with http:// or https://")
        task.links.append(
            TaskLink(
                label=(item.label.strip() or url.split("//")[-1].split("/")[0])[:160],
                url=url[:1000],
                position=index,
            )
        )


def create_task(db: DbSession, user: User, data: TaskCreate) -> TaskOut:
    group_id: uuid.UUID | None = None
    if data.groupId:
        try:
            group_id = uuid.UUID(data.groupId)
        except ValueError as exc:
            raise InvalidError("That group id is not valid.") from exc
        access.require_group(db, group_id, user)

    task = Task(
        owner_id=None if group_id else user.id,
        group_id=group_id,
        title=data.title.strip(),
        description=data.description.strip(),
        due_at=from_ms(data.dueAt),
        status=data.status,
        priority=data.priority,
        created_by=user.id,
    )
    db.add(task)
    db.flush()
    _apply_assignees(db, user, task, data.assigneeIds)
    _apply_subtasks(task, data.subtasks)
    _apply_links(task, data.links)
    db.commit()
    db.refresh(task)
    return task_out(task)


def update_task(db: DbSession, user: User, task_id: uuid.UUID, patch: TaskPatch) -> TaskOut:
    task = require_task(db, user, task_id)
    fields = patch.model_fields_set

    if "groupId" in fields and patch.groupId != (str(task.group_id) if task.group_id else None):
        if patch.groupId:
            try:
                new_group = uuid.UUID(patch.groupId)
            except ValueError as exc:
                raise InvalidError("That group id is not valid.") from exc
            access.require_group(db, new_group, user)
            task.group_id = new_group
            task.owner_id = None
        else:
            task.group_id = None
            task.owner_id = user.id
            # A personal to-do has nobody to assign to.
            _apply_assignees(db, user, task, [])

    if "title" in fields and patch.title is not None:
        task.title = patch.title.strip()
    if "description" in fields and patch.description is not None:
        task.description = patch.description.strip()
    if "dueAt" in fields:
        task.due_at = from_ms(patch.dueAt)
    if "priority" in fields and patch.priority is not None:
        task.priority = patch.priority
    if "status" in fields and patch.status is not None and patch.status != task.status:
        task.status = patch.status
        task.completed_at = datetime.now(UTC) if patch.status is TaskStatus.done else None
    if "assigneeIds" in fields and patch.assigneeIds is not None:
        _apply_assignees(db, user, task, patch.assigneeIds)
    if "subtasks" in fields and patch.subtasks is not None:
        _apply_subtasks(task, patch.subtasks)
    if "links" in fields and patch.links is not None:
        _apply_links(task, patch.links)

    db.commit()
    db.refresh(task)
    return task_out(task)


def delete_task(db: DbSession, user: User, task_id: uuid.UUID) -> None:
    task = require_task(db, user, task_id)
    db.delete(task)
    db.commit()


def postpone_task(db: DbSession, user: User, task_id: uuid.UUID, timezone_offset_minutes: int) -> TaskOut:
    """+1 calendar day preserving clock time; undated tasks get tomorrow 09:00."""
    task = require_task(db, user, task_id)
    if task.due_at is not None:
        task.due_at = task.due_at + timedelta(days=1)
    else:
        offset = timedelta(minutes=timezone_offset_minutes)
        local_now = datetime.now(UTC) - offset
        tomorrow = (local_now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        task.due_at = tomorrow + offset
    db.commit()
    db.refresh(task)
    return task_out(task)


def duplicate_task(db: DbSession, user: User, task_id: uuid.UUID) -> TaskOut:
    task = require_task(db, user, task_id)
    copy = Task(
        owner_id=task.owner_id,
        group_id=task.group_id,
        title=task.title,
        description=task.description,
        due_at=task.due_at,
        status=TaskStatus.todo,
        priority=task.priority,
        created_by=user.id,
    )
    db.add(copy)
    db.flush()
    for assignee in task.assignees:
        db.add(TaskAssignee(task_id=copy.id, user_id=assignee.user_id))
    for index, subtask in enumerate(sorted(task.subtasks, key=lambda item: item.position)):
        db.add(TaskSubtask(task_id=copy.id, title=subtask.title, done=False, position=index))
    for index, link in enumerate(sorted(task.links, key=lambda item: item.position)):
        db.add(TaskLink(task_id=copy.id, label=link.label, url=link.url, position=index))
    db.commit()
    db.refresh(copy)
    return task_out(copy)
