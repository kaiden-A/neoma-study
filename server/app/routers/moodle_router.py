"""iTa'leem connection, sync and course content."""

import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..models.users import utcnow
from ..schemas.moodle import (
    AssignmentOut,
    CourseDetailOut,
    CourseOut,
    GradeOut,
    MoodleConnectIn,
    MoodleConnectOut,
    MoodleSaveIn,
    MoodleSaveOut,
    MoodleStatusOut,
    MoodleSyncOut,
)
from ..services import moodle_services
from ..services.storage_services import Storage, get_storage

router = APIRouter(prefix="/api/moodle", tags=["moodle"])


@router.get("", response_model=MoodleStatusOut)
def status(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> MoodleStatusOut:
    return MoodleStatusOut(**moodle_services.status(db, user))


@router.post("/token", response_model=MoodleConnectOut)
def connect(
    data: MoodleConnectIn,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> MoodleConnectOut:
    result = moodle_services.connect_token(db, user, data.link)
    return MoodleConnectOut(
        status=MoodleStatusOut(**result["status"]),
        counts=MoodleSyncOut(**result["counts"]),
    )


@router.post("/sync", response_model=MoodleSyncOut)
def sync(
    auto: bool = Query(default=False),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> MoodleSyncOut:
    account = moodle_services.require_account(db, user)
    if auto and account.last_sync_at is not None:
        last = account.last_sync_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        if utcnow() - last < moodle_services.AUTO_SYNC_WINDOW:
            return MoodleSyncOut(courses=0, deadlines=0, events=0)
    return MoodleSyncOut(**moodle_services.sync_account(db, user, account))


@router.delete("", response_model=dict[str, bool])
def disconnect(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> dict[str, bool]:
    moodle_services.disconnect(db, user)
    return {"ok": True}


@router.get("/courses", response_model=list[CourseOut])
def list_courses(
    user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> list[CourseOut]:
    return moodle_services.list_courses(db, user)


@router.get("/courses/{course_id}", response_model=CourseDetailOut)
def course_detail(
    course_id: uuid.UUID,
    refresh: bool = Query(default=False),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> CourseDetailOut:
    return moodle_services.course_detail(db, user, course_id, force=refresh)


@router.post("/courses/{course_id}/save", response_model=MoodleSaveOut, status_code=201)
def save_file(
    course_id: uuid.UUID,
    data: MoodleSaveIn,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> MoodleSaveOut:
    note = moodle_services.save_file(
        db,
        user,
        course_id,
        cmid=data.cmid,
        file_index=data.fileIndex,
        storage=storage,
    )
    return MoodleSaveOut(
        noteId=note.id,
        title=note.title,
        fileId=note.fileId or "",
        size=note.fileSize or 0,
    )


@router.get("/courses/{course_id}/grades", response_model=list[GradeOut])
def grades(
    course_id: uuid.UUID,
    refresh: bool = Query(default=False),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[GradeOut]:
    course = moodle_services.require_course(db, user, course_id)
    return moodle_services.grades_for(db, user, course, force=refresh)


@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentOut])
def assignments(
    course_id: uuid.UUID,
    refresh: bool = Query(default=False),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[AssignmentOut]:
    course = moodle_services.require_course(db, user, course_id)
    moodle_services.refresh_submission_status(db, user, course, force=refresh)
    return moodle_services.assignments_for(db, user, course)
