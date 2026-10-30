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
from ..schemas.notes import NoteStudy
from ..schemas.study import (
    BulkCardsRequest,
    FlashcardCreate,
    FlashcardDraft,
    FlashcardGrade,
    FlashcardOut,
    FlashcardPatch,
    GenerateCardsRequest,
    GenerateCardsResponse,
)
from ..utils import to_ms
from . import cardgen, file_services, note_services, srs
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
        statement = statement.where(Flashcard.suspended.is_(False), Flashcard.due_at <= datetime.now(UTC))
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


def _front_key(front: str) -> str:
    return " ".join(front.lower().split())


def _existing_fronts(db: DbSession, user: User, note_id: uuid.UUID) -> set[str]:
    statement = select(Flashcard.front).where(Flashcard.owner_id == user.id, Flashcard.note_id == note_id)
    return {_front_key(front) for front in db.scalars(statement)}


def _file_text(db: DbSession, user: User, note: Note) -> str | None:
    """The extracted text of the note's attachment, when the caller can see it."""
    if note.file_id is None:
        return None
    file = file_services.require_visible_file(db, user, note.file_id)
    return file.extracted_text or None


def generate_cards(db: DbSession, user: User, data: GenerateCardsRequest) -> GenerateCardsResponse:
    """Draft cards from the note (and its PDF/deck text); never writes rows."""
    note = note_services.require_note(db, user, _note_uuid(data.noteId))
    study = NoteStudy.model_validate(note.study or {})
    highlights = [(item.page, item.quote) for item in study.highlights if item.quote.strip()]
    drafts = cardgen.generate(
        note.body or "",
        file_text=_file_text(db, user, note),
        highlights=highlights,
        limit=data.count,
    )
    existing = _existing_fronts(db, user, note.id)
    cards = [
        FlashcardDraft(
            front=draft.front,
            back=draft.back,
            kind=draft.kind,
            source=draft.source,
            page=draft.page,
            duplicate=_front_key(draft.front) in existing,
        )
        for draft in drafts
    ]
    notice = None
    if data.refine:
        notice = "AI refine is not connected yet - these are the free rules-based cards."
    return GenerateCardsResponse(
        noteId=str(note.id),
        noteTitle=note.title,
        engine="rules",
        refined=False,
        cards=cards,
        notice=notice,
    )


def create_cards(db: DbSession, user: User, data: BulkCardsRequest) -> list[FlashcardOut]:
    """Save the previewed drafts in one commit, skipping duplicates."""
    note = note_services.require_note(db, user, _note_uuid(data.noteId))
    seen = _existing_fronts(db, user, note.id)
    rows: list[Flashcard] = []
    for draft in data.cards:
        front = draft.front.strip()
        if not front:
            raise InvalidError("One of those cards had no question.")
        key = _front_key(front)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            Flashcard(
                owner_id=user.id,
                note_id=note.id,
                front=front[:1000],
                back=draft.back.strip()[:2000],
            )
        )
    if not rows:
        return []
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return [card_out(db, row) for row in rows]


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
