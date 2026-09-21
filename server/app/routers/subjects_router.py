import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import Note, Subject, User
from ..schemas.subjects import SubjectCreate, SubjectOut, SubjectPatch
from ..services.errors import NotFoundError

router = APIRouter(prefix="/api/subjects", tags=["subjects"])

MARKERS = ("amber", "mint", "sky", "coral", "violet", "pink")
MISSING = "That subject is gone."


def _out(subject: Subject) -> SubjectOut:
    return SubjectOut(id=str(subject.id), name=subject.name, color=subject.color)


def _owned(db: DbSession, user: User, subject_id: uuid.UUID) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None or subject.owner_id != user.id:
        raise NotFoundError(MISSING)
    return subject


@router.get("", response_model=list[SubjectOut])
def list_subjects(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> list[SubjectOut]:
    subjects = db.scalars(
        select(Subject).where(Subject.owner_id == user.id).order_by(Subject.position, Subject.created_at)
    ).all()
    return [_out(subject) for subject in subjects]


@router.post("", response_model=SubjectOut, status_code=201)
def create_subject(
    data: SubjectCreate, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> SubjectOut:
    name = data.name.strip()[:120] or "New subject"
    position = len(db.scalars(select(Subject.id).where(Subject.owner_id == user.id)).all())
    subject = Subject(
        owner_id=user.id,
        name=name,
        color=MARKERS[position % 6],
        position=position,
    )
    db.add(subject)
    db.commit()
    return _out(subject)


@router.patch("/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: uuid.UUID,
    patch: SubjectPatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> SubjectOut:
    subject = _owned(db, user, subject_id)
    if patch.name is not None and patch.name.strip():
        subject.name = patch.name.strip()[:120]
    if patch.color is not None and patch.color.strip():
        subject.color = patch.color.strip()[:16]
    db.commit()
    return _out(subject)


@router.delete("/{subject_id}", status_code=204)
def delete_subject(
    subject_id: uuid.UUID,
    moveTo: str | None = None,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> None:
    """Deleting a subject keeps its items: they move to `moveTo` or to no subject."""
    subject = _owned(db, user, subject_id)
    target: uuid.UUID | None = None
    if moveTo:
        target = _owned(db, user, uuid.UUID(moveTo)).id
    for note in db.scalars(select(Note).where(Note.subject_id == subject.id)):
        note.subject_id = target
    db.delete(subject)
    db.commit()
