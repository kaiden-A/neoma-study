"""MCP tools for the iTa'leem mirror.

Read tools answer from the local mirror; deadlines auto-refresh when stale and
fall back to cached rows instead of failing. Only `italeem_sync` and
`italeem_save_file` mutate anything, and the token is never returned.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy import select

from .mcp_server import current_user, default_zone, get_session, mcp
from .models import MoodleAssignment, MoodleCourse, Task, TaskStatus, User
from .schemas.moodle import CourseDetailOut, CourseOut
from .services import moodle_services, settings_services
from .services.errors import ServiceError
from .services.storage_services import get_storage

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)
MUTATING = ToolAnnotations(read_only_hint=False, open_world_hint=False)

CourseId = Annotated[str, Field(description="The Neoma course id from italeem_courses.")]
TaskId = Annotated[str, Field(description="The taskId from italeem_deadlines.")]
FRESH_FOR = timedelta(minutes=10)


def _fail(exc: ServiceError) -> ToolError:
    return ToolError(exc.message)


def _account(db, user: User):
    account = moodle_services.account_for(db, user)
    if account is None:
        raise ToolError(
            "iTa'leem isn't connected. Open Neoma → Settings → iTa'leem and paste a connect link."
        )
    return account


def _stale(account) -> bool:
    if account.last_sync_at is None:
        return True
    last = account.last_sync_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=UTC)
    return datetime.now(UTC) - last > FRESH_FOR


def _refresh(db, user: User, account, *, force: bool = False) -> str | None:
    if not force and not _stale(account):
        return None
    try:
        moodle_services.sync_account(db, user, account)
        return None
    except ServiceError as exc:
        return exc.message


def _label(ms: int | None) -> str | None:
    if ms is None:
        return None
    local = datetime.fromtimestamp(ms / 1000, tz=UTC).astimezone(default_zone())
    return f"{local:%a %d %b, %H:%M}"


def _course_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ToolError("That course id is not valid. Use an id from italeem_courses.") from exc


def _share(db, user: User) -> tuple[dict, dict]:
    courses = {
        course.id: course
        for course in db.scalars(select(MoodleCourse).where(MoodleCourse.user_id == user.id)).all()
    }
    assignments = {
        row.task_id: row
        for row in db.scalars(
            select(MoodleAssignment).where(MoodleAssignment.user_id == user.id)
        ).all()
        if row.task_id is not None
    }
    return courses, assignments


def _task_url(task: Task, assignment: MoodleAssignment | None, wwwroot: str) -> str | None:
    if assignment is not None:
        return f"{wwwroot}/mod/assign/view.php?id={assignment.cmid}"
    found = re.search(r"https?://\S+", task.description or "")
    return found.group(0).rstrip(").,") if found else None


@mcp.tool(annotations=READ_ONLY)
def italeem_status() -> dict:
    """Is iTa'leem connected, when did it last sync, and how much is mirrored?"""
    with get_session() as db:
        user = current_user(db)
        account = moodle_services.account_for(db, user)
        if account is None:
            stored = settings_services.read_settings(user).moodle
            return {
                "connected": False,
                "message": "Open Neoma → Settings → iTa'leem and paste a connect link.",
                "error": stored.error,
            }
        status = moodle_services.status(db, user)
        status["stale"] = _stale(account)
        status["username"] = account.username or None
        status["release"] = account.release or None
        return status


@mcp.tool(annotations=READ_ONLY)
def italeem_courses() -> list[CourseOut]:
    """The member's iTa'leem courses, with progress and open deadline counts."""
    with get_session() as db:
        user = current_user(db)
        _account(db, user)
        return moodle_services.list_courses(db, user)


@mcp.tool(annotations=READ_ONLY)
def italeem_deadlines(
    days: Annotated[int, Field(ge=1, le=120, description="How far ahead to look.")] = 14,
    course_id: CourseId | None = None,
    include_overdue: Annotated[bool, Field(description="Include deadlines already past.")] = True,
    refresh: Annotated[bool, Field(description="Force a sync before answering.")] = False,
) -> dict:
    """Upcoming iTa'leem assignment and quiz deadlines as Neoma tasks."""
    with get_session() as db:
        user = current_user(db)
        account = _account(db, user)
        warning = _refresh(db, user, account, force=refresh)
        courses, assignments = _share(db, user)
        now = datetime.now(UTC)
        query = (
            select(Task)
            .where(
                Task.owner_id == user.id,
                Task.external_uid.is_not(None),
                Task.status != TaskStatus.done,
                Task.due_at.is_not(None),
                Task.due_at <= now + timedelta(days=days),
            )
            .order_by(Task.due_at.asc())
        )
        if course_id:
            query = query.where(Task.course_id == _course_id(course_id))
        tasks = db.scalars(query).all()
        items = []
        for task in tasks:
            due = task.due_at
            if due is None:
                continue
            if not include_overdue and due < now:
                continue
            course = courses.get(task.course_id) if task.course_id else None
            assignment = assignments.get(task.id)
            due_ms = int(due.timestamp() * 1000)
            items.append(
                {
                    "taskId": str(task.id),
                    "title": task.title,
                    "courseId": str(course.id) if course else None,
                    "course": course.shortname if course else None,
                    "dueAt": due_ms,
                    "due": _label(due_ms),
                    "overdue": due < now,
                    "status": task.status.value,
                    "submission": assignment.submission_status if assignment else "",
                    "url": _task_url(task, assignment, account.wwwroot or moodle_services.MOODLE_WWWROOT),
                }
            )
        if len(items) > 100:
            items = items[:100]
        return {
            "items": items,
            "count": len(items),
            "windowDays": days,
            "lastSyncAt": int(account.last_sync_at.timestamp() * 1000) if account.last_sync_at else None,
            "stale": _stale(account),
            "warning": warning,
        }


@mcp.tool(annotations=READ_ONLY)
def italeem_course(
    course_id: CourseId,
    include_files: Annotated[bool, Field(description="List each activity's files.")] = True,
    refresh: Annotated[bool, Field(description="Re-fetch the outline from iTa'leem.")] = False,
) -> dict:
    """One course's outline: sections, activities, links and files."""
    with get_session() as db:
        user = current_user(db)
        _account(db, user)
        course_uuid = _course_id(course_id)
        try:
            detail: CourseDetailOut = moodle_services.course_detail(
                db, user, course_uuid, force=refresh
            )
        except ServiceError as exc:
            raise _fail(exc) from exc
        sections = []
        for section in detail.sections:
            modules = []
            for module in section.modules:
                item: dict = {
                    "cmid": module.cmid,
                    "name": module.name,
                    "modname": module.modname,
                    "url": module.url,
                    "description": module.description[:400],
                }
                if module.link:
                    item["link"] = module.link
                if include_files:
                    item["files"] = [
                        {
                            "filename": file.filename,
                            "mimetype": file.mimetype,
                            "size": file.size,
                            "savedNoteId": file.noteId,
                        }
                        for file in module.files
                    ]
                modules.append(item)
            sections.append({"name": section.name, "summary": section.summary[:400], "modules": modules})
        return {
            "course": detail.course.model_dump(),
            "sections": sections,
            "assignments": [row.model_dump() for row in detail.assignments],
            "outlineAt": detail.outlineAt,
            "outlineError": detail.outlineError,
            "truncated": detail.truncated,
        }


@mcp.tool(annotations=READ_ONLY)
def italeem_files(
    course_id: CourseId,
    query: Annotated[str | None, Field(description="Filter by file or activity name.")] = None,
    only_unsaved: Annotated[bool, Field(description="Hide files already in the vault.")] = False,
) -> list[dict]:
    """Files in a course's materials, with whether Neoma already has a copy."""
    with get_session() as db:
        user = current_user(db)
        _account(db, user)
        course_uuid = _course_id(course_id)
        try:
            detail = moodle_services.course_detail(db, user, course_uuid)
        except ServiceError as exc:
            raise _fail(exc) from exc
        needle = (query or "").strip().lower()
        rows: list[dict] = []
        for section in detail.sections:
            for module in section.modules:
                for index, file in enumerate(module.files):
                    if only_unsaved and file.noteId:
                        continue
                    haystack = f"{module.name} {file.filename}".lower()
                    if needle and needle not in haystack:
                        continue
                    rows.append(
                        {
                            "cmid": module.cmid,
                            "fileIndex": index,
                            "activity": module.name,
                            "filename": file.filename,
                            "mimetype": file.mimetype,
                            "size": file.size,
                            "savedNoteId": file.noteId,
                            "url": module.url,
                        }
                    )
        return rows[:100]


@mcp.tool(annotations=READ_ONLY)
def italeem_assignment(
    task_id: TaskId,
    refresh: Annotated[bool, Field(description="Fetch the latest submission status.")] = False,
) -> dict:
    """One assignment's details, submission status, grade and activity link."""
    with get_session() as db:
        user = current_user(db)
        account = _account(db, user)
        try:
            task_uuid = uuid.UUID(task_id)
        except ValueError as exc:
            raise ToolError("That task id is not valid.") from exc
        task = db.get(Task, task_uuid)
        if task is None or task.owner_id != user.id or not task.external_uid:
            raise ToolError("That is not an iTa'leem deadline on your account.")
        assignment = db.scalar(
            select(MoodleAssignment).where(
                MoodleAssignment.user_id == user.id, MoodleAssignment.task_id == task.id
            )
        )
        if refresh and assignment is not None:
            try:
                moodle_services.refresh_assignment_status(db, user, assignment)
            except ServiceError as exc:
                raise _fail(exc) from exc
        course = db.get(MoodleCourse, task.course_id) if task.course_id else None
        return {
            "taskId": str(task.id),
            "title": task.title,
            "course": course.shortname if course else None,
            "dueAt": int(task.due_at.timestamp() * 1000) if task.due_at else None,
            "due": _label(int(task.due_at.timestamp() * 1000)) if task.due_at else None,
            "status": task.status.value,
            "description": task.description[:4000],
            "submission": assignment.submission_status if assignment else "",
            "grade": assignment.grade if assignment else "",
            "gradeMax": assignment.grade_max if assignment else "",
            "cutoffAt": (
                int(assignment.cutoff_at.timestamp() * 1000)
                if assignment and assignment.cutoff_at
                else None
            ),
            "url": _task_url(task, assignment, account.wwwroot or moodle_services.MOODLE_WWWROOT),
        }


@mcp.tool(annotations=READ_ONLY)
def italeem_grades(
    course_id: CourseId | None = None,
    refresh: Annotated[bool, Field(description="Re-fetch grades from iTa'leem.")] = False,
) -> dict:
    """Grades iTa'leem has published, for one course or every course."""
    with get_session() as db:
        user = current_user(db)
        _account(db, user)
        courses = moodle_services.list_courses(db, user)
        if course_id:
            selected = [row for row in courses if row.id == course_id]
            if not selected:
                raise ToolError("That course is not in your iTa'leem mirror.")
        else:
            selected = courses
        output = []
        for row in selected:
            course = moodle_services.require_course(db, user, uuid.UUID(row.id))
            try:
                grades = moodle_services.grades_for(db, user, course, force=refresh)
            except ServiceError as exc:
                raise _fail(exc) from exc
            output.append(
                {
                    "course": row.shortname,
                    "courseId": row.id,
                    "items": [grade.model_dump() for grade in grades],
                }
            )
        return {"courses": output}


@mcp.tool(annotations=MUTATING)
def italeem_sync() -> dict:
    """Refresh courses and deadlines from iTa'leem now (no-op inside a minute)."""
    with get_session() as db:
        user = current_user(db)
        account = _account(db, user)
        if account.last_sync_at is not None:
            last = account.last_sync_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=UTC)
            if datetime.now(UTC) - last < timedelta(minutes=1):
                return {"skipped": True, "reason": "Synced less than a minute ago."}
        try:
            counts = moodle_services.sync_account(db, user, account)
        except ServiceError as exc:
            raise _fail(exc) from exc
        return counts


@mcp.tool(annotations=MUTATING)
def italeem_save_file(
    course_id: CourseId,
    cmid: Annotated[int, Field(description="The activity cmid from italeem_course/files.")],
    file_index: Annotated[int, Field(ge=0, le=50, description="Index in that activity's files.")] = 0,
) -> dict:
    """Save a course file into the member's vault as a note (PDFs, decks, docs)."""
    with get_session() as db:
        user = current_user(db)
        _account(db, user)
        try:
            note = moodle_services.save_file(
                db,
                user,
                _course_id(course_id),
                cmid=cmid,
                file_index=file_index,
                storage=get_storage(),
            )
        except ServiceError as exc:
            raise _fail(exc) from exc
        return {
            "noteId": note.id,
            "title": note.title,
            "fileId": note.fileId,
            "size": note.fileSize,
            "message": "Saved to the vault. It can be opened, highlighted and searched.",
        }
