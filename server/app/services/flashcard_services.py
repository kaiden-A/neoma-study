"""Flashcards and the review queue.

Cards are personal study aids: a member can card any note they can see
(personal or group), but every card belongs to its creator. The SM-2 math is
in services/srs.py; this module only moves rows.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..models import Flashcard, Note, User
from ..schemas.study import FlashcardCreate, FlashcardGrade, FlashcardOut, FlashcardPatch
from ..utils import to_ms
from . import note_services, srs
from .errors import InvalidError, NotFoundError

MISSING_CARD = "That card is gone."


def card_out(db: DbSession, card: Flashcard) -> FlashcardOut:
    note = db.get(Note, card.note_id)
    return FlashcardOut(
        id=str(card.id),
        noteId=str(card.note_id),
        noteTitle=note.title if note else None,
        front=card.front,
        back=card.back,
        sourceHighlightId=card.source_highlight_id,
        dueAt=to_ms(card.due_at) or 0,
        intervalDays=card.interval_days,
        ease=round(card.ease, 3),
        reps=card.reps,
        lapses=card.lapses,
        suspended=card.suspended,
        createdAt=to_ms(card.created_at) or 0,
        updatedAt=to_ms(card.updated_at) or 0,
    )


def require_card(db: DbSession, user: User, card_id: uuid.UUID) -> Flashcard:
    card = db.get(Flashcard, card_id)
    if card is None or card.owner_id != user.id:
        raise NotFoundError(MISSING_CARD)
    return card


def _note_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise InvalidError("That note id is not valid.") from exc


def list_cards(
    db: DbSession,
    user: User,
    *,
    note_id: str | None = None,
    due_only: bool = False,
    limit: int | None = None,
) -> list[FlashcardOut]:
    statement = select(Flashcard).where(Flashcard.owner_id == user.id)
    if note_id:
        note = note_services.require_note(db, user, _note_uuid(note_id))
        statement = statement.where(Flashcard.note_id == note.id)
    if due_only:
        statement = statement.where(
            Flashcard.suspended.is_(False), Flashcard.due_at <= datetime.now(UTC)
        )
    statement = statement.order_by(Flashcard.due_at, Flashcard.created_at)
    if limit:
        statement = statement.limit(limit)
    return [card_out(db, card) for card in db.scalars(statement).all()]


def create_card(db: DbSession, user: User, data: FlashcardCreate) -> FlashcardOut:
    note = note_services.require_note(db, user, _note_uuid(data.noteId))
    front = data.front.strip()
    if not front:
        raise InvalidError("Write the question first.")
    card = Flashcard(
        owner_id=user.id,
        note_id=note.id,
        front=front[:1000],
        back=data.back.strip()[:2000],
        source_highlight_id=(data.sourceHighlightId or None),
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card_out(db, card)


def update_card(db: DbSession, user: User, card_id: uuid.UUID, patch: FlashcardPatch) -> FlashcardOut:
    card = require_card(db, user, card_id)
    fields = patch.model_fields_set
    if "front" in fields and patch.front is not None:
        front = patch.front.strip()
        if not front:
            raise InvalidError("Write the question first.")
        card.front = front[:1000]
    if "back" in fields and patch.back is not None:
        card.back = patch.back.strip()[:2000]
    if "suspended" in fields and patch.suspended is not None:
        card.suspended = patch.suspended
    db.commit()
    db.refresh(card)
    return card_out(db, card)


def delete_card(db: DbSession, user: User, card_id: uuid.UUID) -> None:
    card = require_card(db, user, card_id)
    db.delete(card)
    db.commit()


def grade_card(db: DbSession, user: User, card_id: uuid.UUID, grade: FlashcardGrade) -> FlashcardOut:
    card = require_card(db, user, card_id)
    schedule = srs.review(
        ease=card.ease,
        interval_days=card.interval_days,
        reps=card.reps,
        lapses=card.lapses,
        grade=grade,
    )
    card.ease = schedule.ease
    card.interval_days = schedule.interval_days
    card.reps = schedule.reps
    card.lapses = schedule.lapses
    card.due_at = schedule.due_at
    db.commit()
    db.refresh(card)
    return card_out(db, card)
