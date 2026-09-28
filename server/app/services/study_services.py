"""Study sessions, the per-subject dashboard, streaks and "continue studying".

Sessions are written by the note-page timer (or manually). Everything else is
derived on read: the vault is small, so Python aggregation keeps the SQL
simple and the rules easy to test.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..models import Flashcard, Note, NoteScope, StudySession, Subject, User
from ..schemas.study import (
    ContinueStudy,
    StudyOverview,
    StudySessionCreate,
    StudySessionOut,
    SubjectStudyStats,
)
from ..utils import from_ms, to_ms
from . import note_services
from .errors import InvalidError, NotFoundError

MISSING_NOTE = "That note is gone."
MISSING_SUBJECT = "That subject is gone."
MAX_SECONDS = 24 * 60 * 60


def session_out(db: DbSession, session: StudySession) -> StudySessionOut:
    note = db.get(Note, session.note_id) if session.note_id else None
    return StudySessionOut(
        id=str(session.id),
        noteId=str(session.note_id) if session.note_id else None,
        noteTitle=note.title if note else None,
        subjectId=str(session.subject_id) if session.subject_id else None,
        startedAt=to_ms(session.started_at) or 0,
        endedAt=to_ms(session.ended_at),
        seconds=session.seconds,
        source=session.source,
    )


def create_session(db: DbSession, user: User, data: StudySessionCreate) -> StudySessionOut:
    note = None
    subject_id: uuid.UUID | None = None
    if data.noteId:
        try:
            note = note_services.require_note(db, user, uuid.UUID(data.noteId))
        except ValueError as exc:
            raise InvalidError(MISSING_NOTE) from exc
        subject_id = note.subject_id
    if data.subjectId:
        try:
            subject_id = uuid.UUID(data.subjectId)
        except ValueError as exc:
            raise InvalidError(MISSING_SUBJECT) from exc
        subject = db.get(Subject, subject_id)
        if subject is None or subject.owner_id != user.id:
            raise NotFoundError(MISSING_SUBJECT)

    started_at = from_ms(data.startedAt) or datetime.now(UTC)
    ended_at = from_ms(data.endedAt) if data.endedAt else None
    session = StudySession(
        user_id=user.id,
        note_id=note.id if note else None,
        subject_id=subject_id,
        started_at=started_at,
        ended_at=ended_at,
        seconds=min(int(data.seconds), MAX_SECONDS),
        source=data.source,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session_out(db, session)


def list_sessions(db: DbSession, user: User, *, limit: int = 50) -> list[StudySessionOut]:
    rows = db.scalars(
        select(StudySession)
        .where(StudySession.user_id == user.id)
        .order_by(StudySession.started_at.desc())
        .limit(limit)
    ).all()
    return [session_out(db, session) for session in rows]


def week_start(moment: datetime) -> datetime:
    """Monday 00:00 UTC of the week containing `moment`."""
    day = moment.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday())


def streak_days(db: DbSession, user: User, *, now: datetime | None = None) -> int:
    """Consecutive days with a session or a graded card, ending today or yesterday."""
    moment = now or datetime.now(UTC)
    days: set[date] = set()
    for started_at in db.scalars(
        select(StudySession.started_at).where(StudySession.user_id == user.id)
    ):
        days.add(started_at.astimezone(UTC).date())
    for updated_at in db.scalars(
        select(Flashcard.updated_at).where(Flashcard.owner_id == user.id, Flashcard.reps > 0)
    ):
        days.add(updated_at.astimezone(UTC).date())
    if not days:
        return 0
    cursor = moment.astimezone(UTC).date()
    if cursor not in days:
        cursor -= timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


def _dashboard(
    db: DbSession, user: User, *, now: datetime
) -> tuple[list[SubjectStudyStats], int]:
    start = week_start(now)
    subjects = list(
        db.scalars(select(Subject).where(Subject.owner_id == user.id).order_by(Subject.position)).all()
    )
    notes = list(
        db.scalars(
            select(Note).where(Note.owner_id == user.id, Note.scope == NoteScope.personal)
        ).all()
    )
    cards = list(db.scalars(select(Flashcard).where(Flashcard.owner_id == user.id)).all())
    sessions = list(db.scalars(select(StudySession).where(StudySession.user_id == user.id)).all())

    due_cards_by_subject: dict[str, int] = {}
    due_note_ids = {str(card.note_id) for card in cards if not card.suspended and card.due_at <= now}
    for note in notes:
        if str(note.id) in due_note_ids and note.subject_id:
            key = str(note.subject_id)
            due_cards_by_subject[key] = due_cards_by_subject.get(key, 0) + 1

    session_subject: dict[uuid.UUID, uuid.UUID | None] = {}
    for session in sessions:
        if session.subject_id:
            session_subject[session.id] = session.subject_id
        elif session.note_id:
            note = next((item for item in notes if item.id == session.note_id), None)
            session_subject[session.id] = note.subject_id if note else None
        else:
            session_subject[session.id] = None

    stats: list[SubjectStudyStats] = []
    for subject in subjects:
        key = str(subject.id)
        subject_notes = [note for note in notes if note.subject_id == subject.id]
        subject_sessions = [
            session for session in sessions if session_subject.get(session.id) == subject.id
        ]
        stats.append(
            SubjectStudyStats(
                subjectId=key,
                name=subject.name,
                color=subject.color,
                notes=len(subject_notes),
                files=len([note for note in subject_notes if note.file_id]),
                cardsDue=due_cards_by_subject.get(key, 0),
                minutesThisWeek=sum(
                    session.seconds
                    for session in subject_sessions
                    if session.started_at >= start
                )
                // 60,
                lastStudiedAt=max(
                    (to_ms(session.started_at) or 0 for session in subject_sessions), default=None
                )
                or None,
            )
        )
    minutes = sum(session.seconds for session in sessions if session.started_at >= start) // 60
    return stats, minutes


def _continue(db: DbSession, user: User) -> ContinueStudy | None:
    latest = db.scalars(
        select(StudySession)
        .where(StudySession.user_id == user.id, StudySession.note_id.is_not(None))
        .order_by(StudySession.started_at.desc())
        .limit(1)
    ).first()
    note: Note | None = None
    last_at: datetime | None = None
    if latest is not None:
        note = db.get(Note, latest.note_id)
        last_at = latest.started_at
    if note is None:
        note = db.scalars(
            select(Note)
            .where(Note.owner_id == user.id, Note.scope == NoteScope.personal)
            .order_by(Note.updated_at.desc())
            .limit(1)
        ).first()
        last_at = note.updated_at if note else None
    if note is None:
        return None
    study = note.study or {}
    position = study.get("position") or {}
    timestamps = study.get("timestamps") or []
    return ContinueStudy(
        noteId=str(note.id),
        title=note.title,
        subjectId=str(note.subject_id) if note.subject_id else None,
        type=note.type,
        page=int(position.get("page") or 1),
        videoSeconds=float(timestamps[-1]) if timestamps else None,
        lastAt=to_ms(last_at) or 0,
    )


def overview(db: DbSession, user: User, *, now: datetime | None = None) -> StudyOverview:
    moment = now or datetime.now(UTC)
    subjects, minutes = _dashboard(db, user, now=moment)
    return StudyOverview(
        streakDays=streak_days(db, user, now=moment),
        minutesThisWeek=minutes,
        subjects=subjects,
        continueStudy=_continue(db, user),
    )
